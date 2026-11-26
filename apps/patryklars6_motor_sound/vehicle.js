'use strict';

const fs = require('fs');
const path = require('path');
const { CDS } = require('./telemetry');

let nativeQueue = Promise.resolve();
function nativeTick(fn) {
    const run = () => new Promise((resolve, reject) => setImmediate(() => {
        try { Promise.resolve(fn()).then(resolve, reject); }
        catch (error) { reject(error); }
    }));
    const next = nativeQueue.then(run);
    nativeQueue = next.catch(() => {});
    return next;
}

function connectVehicle(telemetry, log, binding, configDir) {
    const subscriptions = [];
    let closed = false;
    const groups = telemetry.watchGroups();

    async function watch(iface, fields) {
        let proxy;
        let timer;
        let provider = false;
        let availabilityObserved = false;
        let availabilitySubscribed = false;
        let generation = 0;
        const status = telemetry.interfaceStatus[iface] = { available: false, configured: false, instance: null, fields: {}, errors: [] };
        const recordError = message => { status.errors.push(String(message).slice(0, 200)); if (status.errors.length > 8) status.errors.shift(); };
        const versions = Object.create(null);
        const pending = new Set();
        const configPath = path.join(configDir, iface.replace(/\./g, '_') + '.json');
        const clear = () => Object.keys(fields).forEach(f => fields[f].decode(null));
        const availability = value => {
            if (closed) return;
            const active = !!value;
            availabilityObserved = true;
            if (active === provider) return;
            provider = active;
            status.available = active;
            generation++;
            if (provider) setImmediate(poll);
            else clear();
        };

        function poll() {
            if (!provider || closed) return;
            const token = generation;
            for (const field of Object.keys(fields)) {
                if (!config.fields[field] || !config.fields[field].getter || pending.has(field)) continue;
                const version = versions[field] || 0;
                pending.add(field);
                let result;
                try { result = proxy.getValue(field, 450); }
                catch (error) { recordError(field + ': ' + error.message); pending.delete(field); continue; }
                Promise.resolve(result).then(value => {
                    if (!closed && provider && generation === token && (versions[field] || 0) === version) {
                        fields[field].decode(value);
                    }
                }).catch(error => recordError(field + ': ' + error.message)).then(() => pending.delete(field));
            }
        }

        let config;
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (!config.fields || closed) return;
            status.configured = true;
            Object.keys(fields).forEach(field => { const value = config.fields[field];
                status.fields[field] = value ? { getter: !!value.getter, notifier: !!value.notifier } : { missing: true };
                if (value && /VehicleInformation/.test(iface)) status.fields[field].catalogDescriptor = JSON.stringify(value).slice(0, 1800);
            });
            const instances = Object.keys(config.instances || {});
            status.instances = instances;
            const instanceName = instances.indexOf('1') >= 0 ? '1' : instances.length === 1 ? instances[0] : instances.length === 0 ? '1' : null;
            if (instanceName === null) throw Error('Multiple catalog instances; no unambiguous vehicle instance');
            status.instance = instanceName;
            status.instanceSource = instances.length ? 'catalog' : 'legacy default (catalog omitted instances)';
            proxy = await nativeTick(async () => {
                const instance = await binding.buildProxy(config, instanceName);
                await instance.init();
                return instance;
            });
            subscriptions.push(() => {
                clearInterval(timer);
                if (proxy.shutdown) void nativeTick(() => proxy.shutdown()).catch(() => {});
            });
            if (closed) {
                subscriptions.pop()();
                return;
            }
            if (proxy.subscribeToAvailability) {
                availabilitySubscribed = await nativeTick(() => proxy.subscribeToAvailability(availability))
                    .then(() => true, () => false);
            }
            for (const field of Object.keys(fields)) {
                if (!config.fields[field] || !config.fields[field].notifier || closed) continue;
                await nativeTick(() => proxy.subscribe({
                    name: field,
                    onReceive(value) {
                        if (closed || (availabilityObserved && !provider)) return;
                        versions[field] = (versions[field] || 0) + 1;
                        const notificationOnly = availabilitySubscribed && provider && !config.fields[field].getter;
                        fields[field].decode(value, notificationOnly);
                    }
                })).catch(e => { recordError(field + ': ' + e.message); log.warn('SOME/IP ' + field + ': ' + e.message); });
            }
            if (closed) return;
            if (proxy.isAvailable && proxy.isAvailable()) availability(true);
            timer = setInterval(poll, iface === CDS ? 250 : 750);
        } catch (e) {
            recordError(e.message);
            log.warn('SOME/IP ' + iface + ': ' + e.message);
        }
    }

    for (const iface of Object.keys(groups)) void watch(iface, groups[iface]);
    return () => {
        closed = true;
        subscriptions.splice(0).forEach(close => close());
    };
}

module.exports = { connectVehicle };
