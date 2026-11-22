'use strict';
// Paced real-time host test. No BMW, no ALSA hardware, no simulated app telemetry shipped.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const net = require('node:net'), Module = require('node:module'), assert = require('node:assert/strict');
const { once, EventEmitter } = require('node:events');
const packageRoot = path.resolve(process.argv[2]), python = process.argv[3], seconds = Number(process.argv[4] || 180);
const outputFile = path.resolve(process.argv[5]);
assert.ok(seconds >= 60 && seconds <= 600);
const src = path.join(packageRoot, 'javascript');
const spec = require(path.join(src, 'kit/app-spec.json'));
const { request } = require(path.join(src, 'audio-diagnostics'));
const { CDS, VEHICLE, GEAR, PEDAL, FES } = require(path.join(src, 'telemetry'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let implementation;
const oldLoad = Module._load;
Module._load = function(id, ...args) { if (id === './kit/mgu') return { run(value) { implementation = value; return Promise.resolve(); }, log: { error() {} } }; return oldLoad.call(this, id, ...args); };
try { require(path.join(src, 'app')); } finally { Module._load = oldLoad; }
async function run() {
    const fixture = cp.spawn(python, ['-B', path.join(__dirname, 'audio-host-fixture.py')], { stdio: ['ignore', 'pipe', 'pipe'] });
    const app = new EventEmitter(); let background, inputTimer;
    try {
        const first = await Promise.race([once(fixture.stdout, 'data'), delay(3000).then(() => { throw Error('Host sink did not start'); })]);
        const port = JSON.parse(first[0].toString()).port;
        const connect = () => net.createConnection(port, '127.0.0.1');
        await request({ op: 'select', device: 'host_test_sink', channels: 2, approvedOverlay: true }, connect);
        const values = Object.fromEntries(spec.settings.map(row => [row.key, row.default]));
        Object.assign(values, { enabled: true, autoMode: false, manualProfile: 'v8', v8_bangOn: true });
        const settings = { get: key => values[key], onChange() {} };
        background = implementation.background({ app, settings, spec, log: { warn() {} } });
        background.output.endpoint = { trusted: () => true, open: connect };
        const groups = background.vehicle.watchGroups();
        const started = Date.now(), rssBefore = process.memoryUsage().rss;
        let lastLog = 0;
        function feed() {
            const elapsed = (Date.now() - started) / 1000, cycle = elapsed % 24;
            const rpm = cycle < 3 ? 820 : cycle < 14 ? 1400 + (cycle - 3) / 11 * 2700 : 4100 - (cycle - 14) / 10 * 3280;
            const parked = cycle < 3;
            groups[CDS].statusEngineSpeed2.decode({ actualValueRPMEngineCrankshaft: Math.round(rpm * 4) });
            groups[VEHICLE].statusCarSpeed2.decode({ speedVehicleCentreOfGravity: parked ? 0 : 3200 });
            groups[GEAR].statusGearboxDrive.decode({ statusActualStageDrive: parked ? 1 : 4,
                statusActualGearDrive: parked ? 2 : cycle < 10 ? 3 : cycle < 18 ? 4 : 3 });
            groups[PEDAL].AngleAcceleratorPedal.decode({ actualValueAngleAcceleratorPedal: parked || cycle > 17 ? 0 : 2700 });
            groups[FES].statusActualValueTorque2.decode({ actualValueTorqueCrankshaft: parked || cycle > 17 ? 1900 : 2400 });
            if (elapsed - lastLog >= 30) { lastLog = elapsed; console.log(JSON.stringify({ elapsed: Math.round(elapsed), state: background.output.state, queuedBlocks: background.output.blocks }), null, 0); }
        }
        feed(); inputTimer = setInterval(feed, 100);
        await delay(seconds * 1000);
        const report = await request({ op: 'diagnose', extended: false }, connect);
        assert.ok(report.hostSink.frames / 48000 >= seconds * .92, 'Paced PCM continuity');
        assert.ok(report.hostSink.nonzeroBlocks > report.hostSink.blocks * .98, 'Continuous idle/drive audio');
        assert.ok(report.hostSink.maxGapSeconds < .5, 'No long unexplained host output gap');
        const result = { version: spec.version, requestedSeconds: seconds, wallSeconds: (Date.now() - started) / 1000,
            acceptedAudioSeconds: report.hostSink.frames / 48000, sink: report.hostSink,
            source: 'actual packaged headless background + telemetry decoder + PcmOutput + Python production bridge + host sink',
            uiStarted: false, inventedTestVehicleInputs: true, hardwareAudioVerified: false,
            events: background.diagnostics.engine.events, rssBefore, rssAfter: process.memoryUsage().rss };
        fs.writeFileSync(outputFile, JSON.stringify(result, null, 2) + '\n');
        console.log(JSON.stringify(result, null, 2));
    } finally {
        clearInterval(inputTimer); app.emit('shutdown'); if (background) background.output.close(); fixture.kill();
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
