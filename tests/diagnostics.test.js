'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const cp = require('node:child_process');
const { once } = require('node:events');
const { AudioDiagnostics, request, parked } = require('../apps/patryklars6_motor_sound/audio-diagnostics');
const { PcmOutput } = require('../apps/patryklars6_motor_sound/output');
const { Synth, resolveSettings } = require('../apps/patryklars6_motor_sound/sound');
const { interfaceSchema, probe, READS } = require('../tools/audio_probe');
const spec = require('../apps/patryklars6_motor_sound/app.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('Socket inspection distinguishes a missing socket filename from a missing parent directory', () => {
    const { inspectSocket } = require('../apps/patryklars6_motor_sound/output');
    const target = '/run/luxo-motor-sound/diagnostics.sock';
    const parent = path.dirname(target);
    const missing = file => Object.assign(Error('missing'), { code: 'ENOENT', path: file, syscall: 'lstat' });
    const result = inspectSocket(target, { lstatSync(file) {
        if (file === parent) return { isDirectory: () => true, uid: 0, mode: 0o755 };
        throw missing(file);
    } });
    assert.equal(result.errorPath, target); assert.equal(result.checkedPath, target);
    const noParent = inspectSocket(target, { lstatSync(file) { throw missing(file); } });
    assert.equal(noParent.errorPath, parent); assert.equal(noParent.path, target);
});

test('Running audio service with no selection and a missing diagnostic socket stays distinguishable and exportable', async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luxo-vehicle-report-'));
    t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    const endpoint = '/run/luxo-motor-sound/diagnostics.sock', operations = [];
    const service = { serviceStarted: true, pid: 11338, route: null, routeError: { code: 'ROUTE_NOT_SELECTED' },
        routeAssessment: { state: 'not-selected' }, usbMounts: ['/fixture-usb'],
        diagnosticEndpointHealth: { expectedSocketPath: endpoint, state: 'socket-unit-not-active' } };
    const d = new AudioDiagnostics({ dataDir, spec, output: {}, settings: { get() {} },
        vehicle: { snapshot: () => ({ rpm: null, speed: null }) },
        rpc: async value => {
            operations.push(value.op);
            if (value.op === 'diagnose') return service;
            assert.equal(value.op, 'export');
            assert.equal(value.report.independentDiagnosticsError.path, endpoint);
            return { path: '/fixture-usb/LUXO-Diagnose/fixture.json' };
        },
        supportRpc: async () => { throw Object.assign(Error('missing diagnostic socket'), { code: 'ENOENT', path: endpoint }); } });
    await d.refresh();
    assert.equal(d.service.pid, 11338);
    assert.match(d.message, /Kein Audioweg ausgewählt/);
    d.page = 'modes'; assert.match(d.rows()[0].value, /Noch kein Audioweg/);
    d.page = 'diagnostic-path';
    assert.equal(d.rows().find(row => row.id === 'diag-failed-path').value, endpoint);
    assert.match(d.rows().find(row => row.id === 'diag-unit-state').value, /nicht aktiv/);
    d.page = 'usb'; await d.rows().find(row => row.id === 'usb-0').action();
    assert.equal(d.exported, '/fixture-usb/LUXO-Diagnose/fixture.json');
    assert.equal(operations.some(op => op === 'select' || op === 'select-media'), false);
    const saved = JSON.parse(fs.readFileSync(d.saved));
    assert.equal(saved.service.route, null);
    assert.equal(saved.service.diagnosticEndpointHealth.expectedSocketPath, endpoint);
    assert.equal(saved.independentDiagnosticsError.path, endpoint);
    assert.equal(saved.audibleOutputAutomaticallyVerified, false);
});

test('Switching media mode pauses PCM reconnects while the previous stream releases its lock', async () => {
    let closed = 0, retried = 0, attempts = 0;
    const d = new AudioDiagnostics({ spec, output: { close() { closed++; }, retry() { retried++; } },
        settings: { get() {} }, vehicle: { snapshot: () => ({}) },
        rpc: async value => {
            assert.equal(d.changingMode, true);
            assert.equal(value.acceptSharedMedia, true);
            if (++attempts === 1) throw Object.assign(Error('still closing'), { code: 'AUDIO_BUSY' });
            return { backend: 'bmw-media-source' };
        } });
    d.refresh = async () => {};
    await d.selectMedia();
    assert.equal(attempts, 2); assert.equal(closed, 1); assert.equal(retried, 1);
    assert.equal(d.changingMode, false); assert.equal(d.page, 'root');
});

test('Save waits for an extended report even when a lightweight refresh is already running', async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luxo-report-wait-'));
    t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    const calls = [];
    const d = new AudioDiagnostics({ dataDir, spec, output: {}, settings: { get() {} }, vehicle: { snapshot: () => ({}) },
        rpc: async () => { await delay(10); return { serviceStarted: true }; },
        supportRpc: async value => {
            calls.push(value.extended); await delay(10);
            return value.extended ? { audioJournal: { stdout: 'full failure evidence' } } : {};
        } });
    await d.refresh(true);
    const pending = d.refresh(false);
    const file = await d.save(); await pending;
    assert.deepEqual(calls, [true, false, true]);
    assert.equal(JSON.parse(fs.readFileSync(file)).independentDiagnostics.audioJournal.stdout, 'full failure evidence');
});

test('Independent production diagnostic endpoint exports while the PCM backend cannot even import', { timeout: 6000 }, async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luxo-independent-'));
    t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    const child = cp.spawn(process.env.LUXO_TEST_PYTHON, ['-B', path.join(__dirname, 'diagnostics-host-fixture.py'), dataDir],
        { stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => child.kill());
    let errors = ''; child.stderr.on('data', data => { errors += data; });
    const first = await Promise.race([once(child.stdout, 'data'), delay(2000).then(() => { throw Error(errors || 'Fixture startup timeout'); })]);
    const port = JSON.parse(first[0].toString()).port;
    const d = new AudioDiagnostics({ dataDir, spec, output: { state: 'waiting', channels: 0 },
        settings: { get() { return 'up10'; } }, vehicle: { snapshot: () => ({ rpm: null, speed: null }) },
        rpc: async () => { throw Object.assign(Error('PCM process unavailable'), { code: 'ECONNREFUSED' }); },
        supportRpc: value => request(value, () => net.createConnection(port, '127.0.0.1'), true) });
    await d.refresh();
    assert.equal(d.service, null); assert.equal(d.error.code, 'ECONNREFUSED');
    assert.equal(d.support.independentOfPcmProcess, true);
    assert.match(d.rows().find(row => row.id === 'devices').value, /1 sichtbare/);
    d.page = 'devices'; assert.equal(d.rows()[0].action, null);
    d.page = 'usb';
    await d.rows().find(row => row.id === 'usb-0').action();
    assert.ok(d.exported);
    const report = JSON.parse(fs.readFileSync(d.exported, 'utf8'));
    assert.equal(report.error.code, 'ECONNREFUSED'); assert.equal(report.service, null);
    assert.equal(report.independentDiagnostics.audioSystemd.service.ActiveState, 'failed');
    assert.equal(report.diagnosticsAtExport.physicalSoundAutomaticallyVerified, false);
    assert.equal(JSON.parse(fs.readFileSync(d.saved)).audibleOutputAutomaticallyVerified, false);
    assert.equal(errors, '');
});

test('Both failed diagnostic endpoints still allow local save and show the USB limitation', async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luxo-no-service-'));
    t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    const fail = async () => { throw Object.assign(Error('not installed'), { code: 'ENOENT' }); };
    const d = new AudioDiagnostics({ dataDir, spec, output: {}, settings: { get() {} },
        vehicle: { snapshot: () => ({}) }, rpc: fail, supportRpc: fail });
    const file = await d.save();
    const report = JSON.parse(fs.readFileSync(file));
    assert.equal(report.error.code, 'ENOENT'); assert.equal(report.independentDiagnosticsError.code, 'ENOENT');
    assert.ok(report.local); assert.equal(report.service, null);
    d.page = 'usb'; assert.match(d.rows().find(row => row.id === 'usb-note').value, /Diagnosezugang fehlt/);
});


test('Audiotest requires measured zero speed, P and engine off; missing values never pass', () => {
    const good = { speed: 0, stage: 'P', engine: 'off' };
    assert.equal(parked(good), true);
    for (const bad of [{ speed: null }, { speed: 1 }, { stage: null }, { stage: 'N' }, { engine: null }, { engine: 'running' }])
        assert.equal(parked(Object.assign({}, good, bad)), false);
});

test('Diagnostic RPC accepts fragmented JSON and preserves a concrete service refusal', async t => {
    const server = net.createServer(socket => socket.once('data', bytes => {
        assert.ok(bytes.toString().startsWith('LUXO/2 '));
        socket.write('{"ok":false,"error":"PEER_');
        setImmediate(() => socket.end('DENIED","detail":"UID rejected"}\n'));
    }));
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => server.close());
    await assert.rejects(request({ op: 'diagnose' }, () => net.createConnection(server.address().port, '127.0.0.1')), error => error.code === 'PEER_DENIED');
});

test('Saved diagnostic report contains unknown hardware and no invented audible verification', async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luxo-diag-'));
    t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    const d = new AudioDiagnostics({ dataDir, spec, output: { state: 'waiting', channels: 0 },
        settings: { get() { return 'up10'; } }, vehicle: { snapshot() { return { rpm: null, speed: null }; } },
        rpc: async () => { throw Object.assign(Error('socket missing'), { code: 'ENOENT' }); } });
    await d.refresh();
    const file = await d.save(), report = JSON.parse(fs.readFileSync(file));
    assert.equal(report.appId, 'patryklars6_motor_sound');
    assert.equal(report.service, null); assert.equal(report.error.code, 'ENOENT');
    assert.equal(report.vehicle.rpm, null); assert.equal(report.audibleOutputAutomaticallyVerified, false);
    assert.equal(report.amplifierSelection.source, 'user setting');
    assert.equal(report.amplifierSelection.automaticallyVerified, false);
});

test('Graphic diagnostic pagination displays every row without gaps at multiple canvas heights', () => {
    const { Recorder } = require(path.join(process.env.LUXO_TEST_PACKAGE, 'javascript/kit/record'));
    const { drawDiagnostics } = require('../apps/patryklars6_motor_sound/navigation');
    for (const extra of [0, 90, 180]) {
        const d = new AudioDiagnostics({ spec, output: {}, settings: { get() {} }, vehicle: { snapshot: () => ({}) } });
        d.nextRefresh = Date.now() + 100000;
        const expected = d.rows().map(row => row.label), seen = new Set();
        for (let page = 0; page < 10; page++) {
            const cv = new Recorder(1600, 520); cv.own = true; cv.extra = extra;
            const original = cv.text.bind(cv); cv.text = (...args) => { seen.add(args[0]); return original(...args); };
            drawDiagnostics(cv, d, 'luxo');
            const offset = d.offset;
            cv.targets.find(row => row.key === 'diag-page-1').run();
            if (offset === d.offset) break;
        }
        for (const label of expected) assert.ok(seen.has(label), label + ' at height ' + (520 + extra));
    }
});

test('Application diagnostics distinguishes missing drive mode, mute and real engine gating', () => {
    const values = Object.fromEntries(spec.settings.map(row => [row.key, row.default]));
    values.enabled = true;
    const vehicle = { rpm: 900, engine: 'running', mode: null };
    const d = new AudioDiagnostics({ spec, output: {}, settings: { get: key => values[key] },
        vehicle: { snapshot: () => vehicle }, effective: mode => resolveSettings(key => values[key], mode) });
    assert.match(d.gate(), /Automatik wartet/);
    values.autoMode = false;
    assert.match(d.gate(), /freigabe vorhanden/i);
    values.enabled = false; assert.match(d.gate(), /ausgeschaltet/);
    values.enabled = true; vehicle.rpm = null; assert.match(d.gate(), /Drehzahl fehlt/);
});

test('Read-only AudioManager probe builds only catalog-defined getter methods', async () => {
    const iface = 'org.genivi.am.commandinterface.CommandControl';
    const catalog = { datatypes: {}, instanceIDs: { [iface]: { '7': 'ObservedInstance' } }, interfaces: {
        [iface]: { name: iface, serviceId: 45088, version: { major: 1, minor: 0 }, methods: {
            getListMainSources: { methodId: 12, inputs: [], outputs: [] },
            getListMainSinks: { methodId: 13, inputs: [], outputs: [] },
            getListMainConnections: { methodId: 14, inputs: [], outputs: [] },
            connect: { methodId: 999, inputs: [], outputs: [] }
        } }
    } };
    assert.deepEqual(Object.keys(interfaceSchema(catalog, iface).methods), READS);
    const calls = [];
    const result = await probe(catalog, { async buildProxy(schema, instance) {
        assert.equal(instance, '7'); assert.equal(schema.methods.connect, undefined);
        return { async init() {}, subscribeToAvailability(fn) { fn(true); }, async callMethod(name) { calls.push(name); return { observed: [] }; } };
    } });
    assert.equal(result.available, true); assert.deepEqual(calls, READS);
});

test('Parked audio test is low-level, stops on movement and never confirms mapping itself', async t => {
    const frames = [];
    const server = net.createServer({ allowHalfOpen: true }, socket => {
        let header = Buffer.alloc(0), ready = false;
        socket.on('data', chunk => {
            if (!ready) {
                header = Buffer.concat([header, chunk]); const at = header.indexOf(10);
                if (at < 0) return;
                const command = JSON.parse(header.slice(7, at).toString()); assert.equal(command.op, 'test');
                ready = true; socket.write('READY 2\n');
                if (header.length > at + 1) frames.push(header.slice(at + 1));
            } else frames.push(chunk);
        });
        socket.on('end', () => socket.end());
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
    const vehicle = { speed: 0, stage: 'P', engine: 'off' };
    const diagnostics = new AudioDiagnostics({ spec, output: { close() {} }, settings: { get() {} }, vehicle: { snapshot: () => vehicle } });
    diagnostics.test(2, () => net.createConnection(server.address().port, '127.0.0.1'));
    await delay(120); vehicle.speed = 1;
    await delay(100);
    assert.equal(diagnostics.testing, false); assert.match(diagnostics.message, /abgebrochen/);
    assert.equal(diagnostics.testResult, null);
    assert.ok(frames.length > 0);
    const bytes = Buffer.concat(frames);
    for (let offset = 0; offset + 1 < bytes.length; offset += 2) assert.ok(Math.abs(bytes.readInt16LE(offset)) <= 491);
});

test('Real Python bridge protocol receives synthesized engine PCM at a host sink and returns diagnostics', { timeout: 6000 }, async t => {
    assert.ok(process.env.LUXO_TEST_PYTHON, 'run via tests/run_checks.py');
    const child = cp.spawn(process.env.LUXO_TEST_PYTHON, ['-B', path.join(__dirname, 'audio-host-fixture.py')], { stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => child.kill());
    let errors = ''; child.stderr.on('data', data => { errors += data; });
    const first = await Promise.race([once(child.stdout, 'data'), delay(2000).then(() => { throw Error('Fixture startup: ' + errors); })]);
    const port = JSON.parse(first[0].toString()).port;
    const connect = () => net.createConnection(port, '127.0.0.1');
    const rpc = data => request(data, connect);
    const initial = await rpc({ op: 'diagnose' });
    assert.equal(initial.negotiated, null); assert.equal(initial.routeError.code, 'ROUTE_NOT_SELECTED');
    assert.equal(initial.routeAssessment.state, 'not-selected');
    assert.equal(initial.diagnosticEndpointHealth.expectedSocketPath, '/run/luxo-motor-sound/diagnostics.sock');
    await rpc({ op: 'select', device: 'host_test_sink', channels: 2, approvedOverlay: true });
    let now = 0;
    const output = new PcmOutput(() => now, { trusted: () => true, open: connect });
    t.after(() => output.close()); output.tick();
    for (let i = 0; i < 30 && !output.channels; i++) await delay(10);
    assert.equal(output.channels, 2);
    const settings = Object.fromEntries(spec.settings.map(row => [row.key, row.default]));
    Object.assign(settings, { enabled: true, autoMode: false, manualProfile: 'v8' });
    const cfg = resolveSettings(key => settings[key], null), synth = new Synth();
    const data = { rpm: 1600, engine: 'running', speed: 0, mode: null, stage: 'D', idle: false,
        torque: null, pedal: { value: 0.25, at: 100, sequence: 1 } };
    const pcm = synth.render(data, cfg, 2);
    assert.ok(pcm.some(value => value !== 0));
    output.write(pcm); await delay(40);
    const report = await rpc({ op: 'diagnose' });
    assert.ok(report.stream.writtenFrames > 0);
    assert.equal(report.negotiated.channels, 2);
    assert.equal(report.route.speakerMappingVerified, false);
    assert.equal(report.physicalSoundAutomaticallyVerified, false);
    assert.equal(errors, '');
    output.close();
});
