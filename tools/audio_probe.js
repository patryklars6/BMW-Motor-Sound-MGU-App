'use strict';

// Read-only AudioManager inventory. Schemas and instance IDs come from this
// head unit's catalog. No connect, register, availability or volume methods.
const fs = require('fs');
const READS = ['getListMainSources', 'getListMainSinks', 'getListMainConnections'];
function interfaceSchema(catalog, name, methods) {
    const types = catalog.datatypes || {};
    function shape(reference, depth) {
        if (depth > 20) throw Error('Catalog type recursion');
        const type = types[reference];
        if (!type) return { t: reference, ...(reference === 'Utf16' || reference === 'Utf16D' ? { bo: true } : {}) };
        if (type.type === 'typedef') return shape(type.dataRef, depth + 1);
        if (type.type === 'enum') return { t: 'Enum', e: enumValues(type), ...(type.enumWidth === undefined ? {} : { w: type.enumWidth }) };
        if (type.type === 'struct' || type.type === 'union') return { t: type.type === 'struct' ? 'Struct' : 'Union', e: type.members.map(member => memberShape(member, depth + 1)) };
        if (type.type === 'array') return Object.assign(arrayShape(type), { e: shape(type.dataRef, depth + 1) });
        if (type.type === 'map') return { t: 'Map', k: shape(type.keyDataRef, depth + 1), v: shape(type.valueDataRef, depth + 1) };
        throw Error('Unsupported catalog datatype: ' + type.type);
    }
    function enumValues(type) { return Object.assign({}, types[type.extends] ? enumValues(types[type.extends]) : {}, type.items); }
    function arrayShape(type) {
        if (type.arrayLengthWidth === 0 && type.arrayMaxLength !== undefined) return { t: 'ArrayF', l: type.arrayMaxLength };
        const value = { t: 'ArrayD' };
        if (type.arrayLengthWidth !== undefined && type.arrayLengthWidth !== 4) value.lw = type.arrayLengthWidth;
        if (type.arrayMinLength !== undefined) value.nl = type.arrayMinLength;
        if (type.arrayMaxLength !== undefined) value.xl = type.arrayMaxLength;
        return value;
    }
    function memberShape(member, depth) {
        let value = shape(member.dataRef, depth);
        if (member.dimension) value = Object.assign(arrayShape(member), { e: value });
        value = Object.assign({ n: member.name }, value);
        if (member.bitWidth !== undefined) value.bw = member.bitWidth;
        if (member.defaultValue !== undefined) value.d = member.defaultValue;
        return value;
    }
    function args(list) { return list && list.length ? { t: 'Struct', e: list.map(value => memberShape(value, 0)) } : {}; }
    const original = catalog.interfaces[name];
    const schema = { name: original.name, serviceId: original.serviceId, version: original.version,
        instances: catalog.instanceIDs[name] || {}, methods: {} };
    (methods || READS).forEach(method => {
        const value = original.methods && original.methods[method];
        if (!value) return;
        const result = { id: value.methodId, schema: args(value.inputs) };
        if (value.outputs) result.retSchema = args(value.outputs);
        if (value.reliable) result.reliable = true;
        schema.methods[method] = result;
    });
    return schema;
}

async function probe(catalog, someip) {
    const name = 'org.genivi.am.commandinterface.CommandControl';
    const observer = 'org.genivi.am.routinginterface.RoutingControlObserver';
    const definition = (catalog.interfaces || {})[observer];
    const instances = Object.keys((catalog.instanceIDs || {})[observer] || {});
    const routingObserver = { declared: !!definition, instances,
        requiredMethodDeclared: !!(definition && definition.methods && definition.methods.hookSourceAvailablityStatusChange),
        unambiguousInstance: instances.indexOf('1') >= 0 || instances.length === 1, availability: 'not-probed' };
    const declared = Object.keys(catalog.interfaces || {}).filter(key => /(?:audio|amplifier|\.ram\.|commandinterface)/i.test(key)).slice(0, 64);
    if (!catalog.interfaces || !catalog.interfaces[name]) return { available: false, declaredInterfaces: declared, routingObserver, error: 'CommandControl absent from catalog' };
    const schema = interfaceSchema(catalog, name);
    const instance = Object.keys(schema.instances)[0];
    if (!instance) return { available: false, declaredInterfaces: declared, routingObserver, error: 'No catalog instance' };
    await new Promise(resolve => setImmediate(resolve));
    const proxy = await someip.buildProxy(schema, instance);
    await proxy.init();
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('AudioManager unavailable')), 1500);
        const done = () => { clearTimeout(timeout); resolve(); };
        Promise.resolve(proxy.subscribeToAvailability(up => { if (up) done(); }))
            .then(() => { if (proxy.waitUntilAvailable) return proxy.waitUntilAvailable(1500).then(done); })
            .catch(error => { clearTimeout(timeout); reject(error); });
    });
    const out = { available: true, instance, declaredInterfaces: declared, routingObserver, observations: {} };
    await Promise.all(READS.map(async method => {
        if (schema.methods[method]) {
            try { out.observations[method] = await proxy.callMethod(method, {}, 1200); }
            catch (error) { out.observations[method] = { error: String(error.message || error).slice(0, 128) }; }
        }
    }));
    return out;
}

if (require.main === module) {
    const timer = setTimeout(() => { process.stdout.write(JSON.stringify({ available: false, error: 'Probe timed out' })); process.exit(0); }, 3200);
    Promise.resolve().then(() => probe(JSON.parse(fs.readFileSync('/etc/oap/someip/someip-interfaces.json', 'utf8')), require('/usr/lib/someip.node')))
        .then(value => { const text = JSON.stringify(value); process.stdout.write(text.length <= 32768 ? text : JSON.stringify({ available: true, error: 'Inventory exceeds report limit' })); },
            error => process.stdout.write(JSON.stringify({ available: false, error: String(error.message || error).slice(0, 256) })))
        .then(() => { clearTimeout(timer); process.exit(0); });
}
module.exports = { interfaceSchema, probe, READS };
