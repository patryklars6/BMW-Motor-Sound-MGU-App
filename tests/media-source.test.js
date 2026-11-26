'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { MediaRoute, discover, proxy } = require('../tools/media_source');
const PCM = 'plug:smartx:CarLifeMedia_CF_48_STEREO';
function fixture(options) {
    options = options || {};
    const calls = [];
    let list = options.busy ? [{ sourceID: 731, sinkID: 421, mainConnectionID: 55, connectionState: 'CS_CONNECTED' }] :
        [{ sourceID: 82, sinkID: 421, mainConnectionID: 10, connectionState: 'CS_CONNECTED' }];
    const cc = { async callMethod(method, args) {
        calls.push([method, args]);
        if (method === 'getListMainSources') return { listSources: [{ name: 'CarLifeMedia', sourceID: 731,
            availability: { availability: 'A_UNAVAILABLE', availabilityReason: 3 } }] };
        if (method === 'getListMainSinks') return { listSinks: [{ name: 'MediaSink_Front', sinkID: 421 }] };
        if (method === 'getListMainConnections') return { listConnections: list.map(row => ({ ...row })) };
        if (method === 'connect') {
            if (options.refuse) return { amError: 'E_NOT_POSSIBLE' };
            list = [{ sourceID: args.sourceID, sinkID: args.sinkID, mainConnectionID: 56,
                connectionState: options.stall ? 'CS_CONNECTING' : 'CS_CONNECTED' }];
            return { amError: 'E_OK', mainConnectionID: 56 };
        }
        if (method === 'disconnect') { list = list.filter(row => row.mainConnectionID !== args.mainConnectionID); return { amError: 'E_OK' }; }
        throw Error(method);
    } };
    const obs = { async callMethod(method, args) { calls.push([method, args]); return {}; } };
    return { calls, route: new MediaRoute(cc, obs, [{ name: PCM }], { connectMs: 10, pollMs: 1 }),
        replace(value) { list = value; } };
}
test('Managed route uses observed IDs and requires a confirmed connection before PCM readiness', async () => {
    const f = fixture(), result = await f.route.start();
    assert.equal(result.sourceID, 731); assert.equal(result.sinkID, 421); assert.equal(result.device, PCM);
    assert.equal(result.parallelMusic, false); assert.equal(result.independentBmwVolume, false);
    assert.equal(result.speakerOutputVerified, false);
    assert.ok(f.calls.some(([m, a]) => m === 'connect' && a.sourceID === 731 && a.sinkID === 421));
    await f.route.release();
    assert.ok(f.calls.some(([m, a]) => m === 'disconnect' && a.mainConnectionID === 56));
    assert.ok(f.calls.some(([m, a]) => m === 'connect' && a.sourceID === 82));
    const restores = f.calls.filter(([m, a]) => m === 'hookSourceAvailablityStatusChange' && a.availability.availability === 'A_UNAVAILABLE');
    assert.equal(restores[0][1].availability.availabilityReason, 3);
});
test('An already occupied CarLife source is never taken or disconnected', async () => {
    const f = fixture({ busy: true });
    await assert.rejects(f.route.start(), { code: 'MEDIA_SOURCE_BUSY' });
    await f.route.release();
    assert.equal(f.calls.filter(([m]) => ['connect', 'disconnect', 'hookSourceAvailablityStatusChange'].includes(m)).length, 0);
});
test('A user source change ends the route without reclaiming it or replacing the new source on release', async () => {
    const f = fixture(); await f.route.start();
    f.replace([{ sourceID: 99, sinkID: 421, mainConnectionID: 72, connectionState: 'CS_CONNECTED' }]);
    await assert.rejects(f.route.check(), { code: 'MEDIA_SOURCE_LOST' });
    const before = f.calls.length; await f.route.release();
    assert.equal(f.calls.slice(before).some(([m]) => m === 'connect' || m === 'disconnect'), false);
});
test('Connecting without owner acknowledgement fails and restores only the owned connection', async () => {
    const f = fixture({ stall: true });
    await assert.rejects(f.route.start(), { code: 'MEDIA_CONNECT_TIMEOUT' });
    await f.route.release();
    assert.ok(f.calls.some(([m, a]) => m === 'disconnect' && a.mainConnectionID === 56));
});
test('Refused source connection remains a concrete failure and never reports readiness', async () => {
    const f = fixture({ refuse: true });
    await assert.rejects(f.route.start(), { code: 'MEDIA_CONNECT_FAILED' });
    await f.route.release();
});
test('Missing, ambiguous or unknown source/PCM/availability is unsupported rather than a guessed ID7 route', () => {
    const source = { name: 'CarLifeMedia', sourceID: 731, availability: { availability: 'A_AVAILABLE' } };
    const sink = { name: 'MediaSink_Front', sinkID: 421 };
    for (const args of [[[], [sink], [{ name: PCM }]], [[source, source], [sink], [{ name: PCM }]],
        [[source], [sink], [{ name: 'default' }]], [[{ ...source, availability: null }], [sink], [{ name: PCM }]]])
        assert.throws(() => discover(...args), { code: 'MEDIA_UNSUPPORTED' });
});
test('Media helper uses a unique actual catalog instance and includes only required audio methods', async () => {
    const name = 'org.genivi.am.commandinterface.CommandControl';
    const catalog = { interfaces: { [name]: { name, serviceId: 45088, methods: {
        connect: { methodId: 1, inputs: [], outputs: [] }, setVolume: { methodId: 2, inputs: [] }
    } } }, instanceIDs: { [name]: { '7': 'observed' } }, datatypes: {} };
    const native = { async buildProxy(schema, instance) {
        assert.equal(instance, '7'); assert.deepEqual(Object.keys(schema.methods), ['connect']);
        return { async init() {}, subscribeToAvailability(fn) { fn(true); } };
    } };
    await proxy(native, catalog, name, ['connect']);
});
test('A foreign source connection appearing during release is never disconnected or made unavailable', async () => {
    const f = fixture(); await f.route.start();
    f.replace([{ sourceID: 731, sinkID: 421, mainConnectionID: 77, connectionState: 'CS_CONNECTED' }]);
    const before = f.calls.length; await f.route.release();
    assert.equal(f.calls.slice(before).some(([m]) => ['connect', 'disconnect', 'hookSourceAvailablityStatusChange'].includes(m)), false);
});
