'use strict';
// Managed entertainment routing. Default diagnostics remain read-only.
// IDs, instances, schemas and PCM names must be observed on this head unit.
const fs = require('fs');
const { interfaceSchema, READS } = require('./audio_probe');
const CC = 'org.genivi.am.commandinterface.CommandControl';
const OBS = 'org.genivi.am.routinginterface.RoutingControlObserver';
function failure(code, message) { return Object.assign(Error(message || code), { code }); }
function rows(value, field, depth) {
    if (!value || (depth || 0) > 6) return [];
    if (Array.isArray(value)) return value.filter(row => row && typeof row === 'object' && Number.isInteger(row[field]));
    if (typeof value !== 'object') return [];
    return Object.keys(value).reduce((out, key) => out.concat(rows(value[key], field, (depth || 0) + 1)), []);
}
function unique(value, field, name) {
    const found = rows(value, field).filter(row => row.name === name && row[field] > 0 && row[field] < 65536);
    if (found.length !== 1) throw failure('MEDIA_UNSUPPORTED', name + ' absent or ambiguous');
    return found[0];
}
function discover(sourceReply, sinkReply, devices) {
    const source = unique(sourceReply, 'sourceID', 'CarLifeMedia');
    const sink = unique(sinkReply, 'sinkID', 'MediaSink_Front');
    const names = (devices || []).map(row => row.name);
    const device = ['plug:smartx:CarLifeMedia_CF_48_STEREO', 'smartx:CarLifeMedia_CF_48_STEREO'].find(name => names.indexOf(name) >= 0);
    if (!device) throw failure('MEDIA_UNSUPPORTED', 'No observed CarLife stereo PCM');
    const availability = source.availability;
    if (!availability || ['A_AVAILABLE', 'A_UNAVAILABLE'].indexOf(availability.availability) < 0)
        throw failure('MEDIA_UNSUPPORTED', 'Source availability format not confirmed');
    return { device, sourceID: source.sourceID, sinkID: sink.sinkID, channels: 2, originalAvailability: availability };
}
function connections(reply) {
    if (!reply || (reply.amError && reply.amError !== 'E_OK') || !Array.isArray(reply.listConnections))
        throw failure('MEDIA_UNSUPPORTED', 'Connection inventory unavailable or unrecognized');
    if (reply.listConnections.some(c => !c || !Number.isInteger(c.mainConnectionID) ||
        !Number.isInteger(c.sourceID) || !Number.isInteger(c.sinkID) || typeof c.connectionState !== 'string'))
        throw failure('MEDIA_UNSUPPORTED', 'Unrecognized connection record');
    return reply.listConnections;
}
function accepted(reply) {
    if (!reply || ['E_OK', 'E_ALREADY_EXISTS'].indexOf(reply.amError) < 0)
        throw failure('MEDIA_CONNECT_FAILED', 'AudioManager: ' + (reply && reply.amError || 'missing result'));
}
class MediaRoute {
    constructor(cc, observer, devices, options) {
        this.cc = cc; this.observer = observer; this.devices = devices; this.options = options || {};
        this.route = null; this.id = null; this.previous = null; this.changedAvailability = false;
        this.attempted = false; this.lost = false; this.released = false;
    }
    call(method, args) { return this.cc.callMethod(method, args || {}, 1500); }
    async inspect() {
        return discover(await this.call('getListMainSources'), await this.call('getListMainSinks'), this.devices);
    }
    async start() {
        this.route = await this.inspect();
        const list = connections(await this.call('getListMainConnections'));
        if (list.some(c => c.sourceID === this.route.sourceID && c.connectionState !== 'CS_DISCONNECTED'))
            throw failure('MEDIA_SOURCE_BUSY', 'CarLife source already belongs to another session');
        const active = list.filter(c => c.sinkID === this.route.sinkID && c.connectionState === 'CS_CONNECTED');
        if (active.length > 1) throw failure('MEDIA_SOURCE_BUSY', 'Ambiguous current front source');
        this.previous = active.length ? active[0].sourceID : null;
        if (this.route.originalAvailability.availability !== 'A_AVAILABLE') {
            this.changedAvailability = true;
            await this.observer.callMethod('hookSourceAvailablityStatusChange', { sourceID: this.route.sourceID,
                availability: { availability: 'A_AVAILABLE', availabilityReason: 0 } }, 1500);
        }
        this.attempted = true;
        const answer = await this.call('connect', { sourceID: this.route.sourceID, sinkID: this.route.sinkID });
        accepted(answer);
        // Never disconnect a connection not identified by this connect response.
        if (!Number.isInteger(answer.mainConnectionID) || answer.mainConnectionID <= 0)
            throw failure('MEDIA_CONNECT_FAILED', 'Missing owned connection ID');
        this.id = answer.mainConnectionID;
        const deadline = Date.now() + (this.options.connectMs || 6500);
        do {
            const current = connections(await this.call('getListMainConnections')).find(c =>
                c.mainConnectionID === this.id && c.sourceID === this.route.sourceID && c.sinkID === this.route.sinkID);
            if (current && current.connectionState === 'CS_CONNECTED') return Object.assign({}, this.route, { connectionID: this.id,
                parallelMusic: false, independentBmwVolume: false, speakerOutputVerified: false });
            await new Promise(resolve => setTimeout(resolve, this.options.pollMs || 120));
        } while (Date.now() < deadline);
        throw failure('MEDIA_CONNECT_TIMEOUT', 'Source owner did not confirm CS_CONNECTED');
    }
    async check() {
        const list = connections(await this.call('getListMainConnections'));
        const ours = list.find(c => c.mainConnectionID === this.id && c.sourceID === this.route.sourceID &&
            c.sinkID === this.route.sinkID && c.connectionState === 'CS_CONNECTED');
        if (!ours || list.some(c => c.sinkID === this.route.sinkID && c.mainConnectionID !== this.id && c.connectionState === 'CS_CONNECTED')) {
            this.lost = true;
            throw failure('MEDIA_SOURCE_LOST', 'BMW changed the active audio source');
        }
    }
    async release() {
        if (this.released || !this.route) return;
        this.released = true;
        const list = connections(await this.call('getListMainConnections'));
        const other = list.some(c => c.sinkID === this.route.sinkID && c.mainConnectionID !== this.id && c.connectionState === 'CS_CONNECTED');
        const ours = this.id && list.find(c => c.mainConnectionID === this.id && c.sourceID === this.route.sourceID);
        if (ours) accepted(await this.call('disconnect', { mainConnectionID: this.id }));
        // Never mark a source unavailable if another session now owns it.
        const foreignOwner = list.some(c => c.sourceID === this.route.sourceID && c.mainConnectionID !== this.id && c.connectionState !== 'CS_DISCONNECTED');
        if (this.changedAvailability && !foreignOwner)
            await this.observer.callMethod('hookSourceAvailablityStatusChange', { sourceID: this.route.sourceID,
                availability: this.route.originalAvailability }, 1500);
        if (this.attempted && !this.lost && !other && this.previous !== null) {
            const after = connections(await this.call('getListMainConnections'));
            if (!after.some(c => c.sinkID === this.route.sinkID && c.connectionState === 'CS_CONNECTED'))
                accepted(await this.call('connect', { sourceID: this.previous, sinkID: this.route.sinkID }));
        }
    }
}
async function proxy(binding, catalog, name, methods) {
    if (!catalog.interfaces || !catalog.interfaces[name]) throw failure('MEDIA_UNSUPPORTED', 'Missing ' + name);
    const schema = interfaceSchema(catalog, name, methods), keys = Object.keys(schema.instances);
    const key = keys.indexOf('1') >= 0 ? '1' : keys.length === 1 ? keys[0] : null;
    if (!key || methods.some(method => !schema.methods[method])) throw failure('MEDIA_UNSUPPORTED', 'Required catalog methods/instance missing');
    await new Promise(resolve => setImmediate(resolve));
    const p = await binding.buildProxy(schema, key); await p.init();
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(failure('MEDIA_MANAGER_UNAVAILABLE')), 1800);
        const ready = () => { clearTimeout(timer); resolve(); };
        Promise.resolve(p.subscribeToAvailability(up => { if (up) ready(); })).then(() => {
            if (p.isAvailable && p.isAvailable()) ready();
            if (p.waitUntilAvailable) p.waitUntilAvailable(1800).then(ready, () => {});
        }).catch(error => { clearTimeout(timer); reject(error); });
    });
    return p;
}
async function main() {
    const catalog = JSON.parse(fs.readFileSync('/etc/oap/someip/someip-interfaces.json', 'utf8'));
    const binding = require('/usr/lib/someip.node');
    const devices = JSON.parse(process.argv[2] || '[]');
    const cc = await proxy(binding, catalog, CC, READS.concat(['connect', 'disconnect']));
    const observer = await proxy(binding, catalog, OBS, ['hookSourceAvailablityStatusChange']);
    const route = new MediaRoute(cc, observer, devices);
    let stopping = false, timer, starting;
    const send = value => process.stdout.write(JSON.stringify(value) + '\n');
    async function stop(code) {
        if (stopping) return; stopping = true; clearInterval(timer);
        const kill = setTimeout(() => process.exit(code), 12000);
        try {
            if (starting) await starting.catch(() => {});
            await route.release();
        } catch (error) { send({ cleanupError: error.code || error.message }); }
        clearTimeout(kill); process.exit(code);
    }
    process.stdin.resume(); process.stdin.on('end', () => stop(0));
    process.on('SIGTERM', () => stop(0)); process.on('SIGINT', () => stop(0));
    try {
        starting = route.start();
        const result = await starting;
        if (stopping) return;
        send({ ready: true, route: result });
        let checking = false;
        timer = setInterval(async () => {
            if (checking || stopping) return; checking = true;
            try { await route.check(); } catch (error) { send({ error: error.code || 'MEDIA_SOURCE_LOST', detail: error.message }); await stop(1); }
            checking = false;
        }, 1000);
    } catch (error) {
        send({ error: error.code || 'MEDIA_CONNECT_FAILED', detail: String(error.message).slice(0, 240) });
        await stop(1);
    }
}
if (require.main === module) main().catch(error => {
    process.stdout.write(JSON.stringify({ error: error.code || 'MEDIA_UNSUPPORTED', detail: String(error.message).slice(0, 240) }) + '\n');
    process.exitCode = 1;
});
module.exports = { MediaRoute, discover, proxy };
