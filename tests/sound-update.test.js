'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { connectVehicle } = require('../apps/patryklars6_motor_sound/vehicle');
const { AudioClock } = require('../apps/patryklars6_motor_sound/audio-clock');
const cp = require('node:child_process');
const spec = require('../apps/patryklars6_motor_sound/app.json');
const { Synth, resolveSettings, PEAK, FRAMES } = require('../apps/patryklars6_motor_sound/sound');
const { SoundEvents } = require('../apps/patryklars6_motor_sound/sound-events');
const { recordings } = require('../apps/patryklars6_motor_sound/recorded-audio');
const { Telemetry, GEAR, CDS, VEHICLE, PEDAL } = require('../apps/patryklars6_motor_sound/telemetry');
const defaults = Object.fromEntries(spec.settings.map(row => [row.key, row.default]));
function cfg(extra) { const values = Object.assign({}, defaults, { autoMode: false, enabled: true, manualProfile: 'v8', level: 60, limit: 60 }, extra); return resolveSettings(key => values[key], null); }
function state(gear = 2, sequence = 1, extra) { return Object.assign({ engine: 'running', rpm: 2600, speed: 45, stage: 'D', gear,
    pedal: { at: 100, sequence: 1, value: .7 }, torque: null, idle: false,
    gearSignal: { gear, sequence, at: sequence * 100, source: 'statusGearboxDrive' } }, extra); }
function peak(pcm) { let value = 0; for (let i = 0; i < pcm.length; i += 2) value = Math.max(value, Math.abs(pcm.readInt16LE(i))); return value; }
function bangCfg(extra) { return cfg(Object.assign({ v8_engineOn: false, v8_turboOn: false, v8_exhaustOn: false, v8_bangOn: true }, extra)); }

test('Five factory voices use distinct licensed field recordings and every shipped PCM passes its manifest hash', () => {
    const bank = recordings(); assert.equal(bank.error, null);
    const manifest = require('../apps/patryklars6_motor_sound/audio/manifest.json');
    const sources = require('../apps/patryklars6_motor_sound/audio/sources.json');
    const ids = ['v6', 'v8', 'f90', 'm', 'diesel'].map(id => manifest.sounds[id + '-low'].source);
    assert.equal(new Set(ids).size, 5);
    assert.equal(Object.keys(bank.sounds).length, 16);
    for (const id of ids) assert.ok(sources.some(row => row.id === id && /^https:\/\/creativecommons.org\//.test(row.license)));
    assert.ok(fs.existsSync(path.join(__dirname, '../apps/patryklars6_motor_sound/audio/ATTRIBUTION.md')));
});

test('PCM pacing follows elapsed time despite coarse or late timer callbacks and never creates an unbounded burst', () => {
    const clock = new AudioClock(); let blocks = 0;
    for (let ms = 0; ms <= 10000; ms += 31.25) blocks += clock.due(ms);
    assert.equal(blocks, 501, 'ten seconds plus initial block, not callback-count audio');
    assert.equal(clock.skippedBlocks, 0);
    assert.ok(clock.due(20000) <= 3);
    assert.ok(clock.skippedBlocks > 0);
    clock.reset(); assert.equal(clock.due(30000), 1);
});

test('An optional local recording bank is loaded and validated without executable plugins', t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'luxo-pack-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    fs.cpSync(path.join(__dirname, '../apps/patryklars6_motor_sound/audio'), temp, { recursive: true });
    assert.equal(recordings(temp).error, null);
    const pcm = path.join(temp, 'v8-low.pcm'), bytes = fs.readFileSync(pcm); bytes[0] ^= 1; fs.writeFileSync(pcm, bytes);
    assert.match(recordings(temp, true).error, /checksum/);
});

test('Choosing a missing optional pack fails silent and choosing the built-in bank restores audio', () => {
    const synth = new Synth(), optional = cfg({ audioPack: 'installed' });
    assert.equal(peak(synth.render(state(), optional, 2)), 0);
    assert.ok(synth.error);
    assert.ok(peak(synth.render(state(), cfg({ audioPack: 'builtin' }), 2)) > 0);
    assert.equal(synth.error, null);
});

test('Vehicle binding selects the actual single catalog instance and exports signal-format diagnostics', async t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'luxo-instance-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    fs.writeFileSync(path.join(temp, GEAR.replace(/\./g, '_') + '.json'), JSON.stringify({ instances: { '7': 'VehicleObserved' }, fields: {
        statusGearboxDrive: { notifier: {} }, DataPowerTrain2: { notifier: {} } } }));
    let instance, receive;
    const telemetry = new Telemetry(() => 100);
    const stop = connectVehicle(telemetry, { warn() {} }, { buildProxy: async (config, id) => {
        instance = id; return { init() {}, isAvailable: () => true, subscribeToAvailability() {}, subscribe(value) { if (value.name === 'statusGearboxDrive') receive = value.onReceive; } };
    } }, temp);
    t.after(stop);
    for (let i = 0; !receive && i < 40; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(instance, '7');
    receive({ statusActualStageDrive: 4, statusActualGearDrive: 'G3' });
    assert.equal(telemetry.snapshot().gear, 3);
    assert.ok(telemetry.diagnostics().interfaces[GEAR].fields.statusGearboxDrive.catalogDescriptor);
    assert.match(telemetry.diagnostics().signals.gearbox.raw, /G3/);
    assert.equal(telemetry.diagnostics().interfaces[GEAR].instanceSource, 'catalog');
});

test('Idle, stationary D/P/N, moving and engine-off states remain distinct without invented missing signals', () => {
    const telemetry = new Telemetry(() => 100), groups = telemetry.watchGroups();
    groups[CDS].statusEngineSpeed2.decode({ actualValueRPMEngineCrankshaft: 3200 });
    groups[VEHICLE].statusCarSpeed2.decode({ speedVehicleCentreOfGravity: 0 });
    groups[PEDAL].AngleAcceleratorPedal.decode({ actualValueAngleAcceleratorPedal: 0 });
    for (const [stage, label] of [[1, 'P'], [3, 'N'], [4, 'D']]) {
        groups[GEAR].statusGearboxDrive.decode({ statusActualStageDrive: stage, statusActualGearDrive: 3 });
        assert.equal(telemetry.snapshot().idle, true);
        assert.equal(telemetry.snapshot().operation, 'stationary-' + label);
        assert.equal(telemetry.snapshot().neutral, label === 'N');
    }
    groups[VEHICLE].statusCarSpeed2.decode({ speedVehicleCentreOfGravity: 1 });
    assert.equal(telemetry.snapshot().moving, true); assert.equal(telemetry.snapshot().idle, false);
    groups[VEHICLE].statusCarSpeed2.decode(null);
    assert.equal(telemetry.snapshot().stationary, null); assert.equal(telemetry.snapshot().idle, null);
    groups[CDS].statusEngineSpeed2.decode({ actualValueRPMEngineCrankshaft: 0 });
    assert.equal(telemetry.snapshot().operation, 'off');
});

test('Observed gearbox changes trigger once; repeated notifications and RPM-only changes do not invent shifts', () => {
    const events = new SoundEvents();
    assert.equal(events.observe(state(2, 1)).shift, null);
    assert.equal(events.observe(state(2, 2)).shift, null);
    assert.equal(events.observe(state(3, 3)).shift, 'upshift');
    assert.equal(events.observe(state(3, 3)).shift, null);
    for (let i = 0; i < 8; i++) assert.equal(events.observe(state(3, 3, { rpm: 1000 + i * 300 })).shift, null);
    assert.equal(events.observe(state(2, 4)).shift, 'downshift');
    assert.equal(events.counts.upshift, 1); assert.equal(events.counts.downshift, 1);
});

test('Gradual real pedal release is accumulated once; held values and stale pedal samples cannot retrigger it', () => {
    const events = new SoundEvents();
    events.observe(state());
    const observed = [];
    for (let i = 1; i <= 7; i++) observed.push(events.observe(state(2, 1,
        { pedal: { sequence: i + 1, at: 100 + i * 30, value: .7 - i * .1 } })));
    assert.equal(observed.filter(row => row.release > 0).length, 1);
    assert.equal(observed.filter(row => row.overrun > 0).length, 1);
    assert.equal(events.observe(state(2, 1, { pedal: { sequence: 8, at: 310, value: 0 } })).overrun, 0);
    const stale = new SoundEvents(); stale.observe(state());
    assert.equal(stale.observe(state(2, 1, { pedal: { at: 3000, sequence: 2, value: 0 } })).overrun, 0);
});

test('Unknown gear, provider/source changes, stationary data and initial D selection cannot trigger a gear effect', () => {
    for (const invalid of [{ gear: null, gearSignal: null }, { stage: 'P' }, { stage: 'N' }]) {
        const events = new SoundEvents(); events.observe(state(2, 1)); events.observe(state(2, 2, invalid));
        assert.equal(events.observe(state(3, 3)).shift, null);
    }
    for (const speed of [null, 0]) {
        const events = new SoundEvents(); events.observe(state(2, 1));
        assert.equal(events.observe(state(3, 2, { speed })).shift, null);
    }
    const events = new SoundEvents(); events.observe(state(2, 1));
    assert.equal(events.observe(state(3, 2, { gearSignal: { gear: 3, at: 200, sequence: 2, source: 'DataPowerTrain2' } })).shift, null);
});

test('Real decoded gear tokens reach the synth and produce a separately switchable shift crack', () => {
    let now = 100;
    const telemetry = new Telemetry(() => now), groups = telemetry.watchGroups();
    groups[CDS].statusEngineSpeed2.decode({ actualValueRPMEngineCrankshaft: 10400 });
    groups[VEHICLE].statusCarSpeed2.decode({ speedVehicleCentreOfGravity: 2880 });
    groups[PEDAL].AngleAcceleratorPedal.decode({ actualValueAngleAcceleratorPedal: 2800 });
    groups[GEAR].statusGearboxDrive.decode({ statusActualStageDrive: 4, statusActualGearDrive: 4 });
    const a = new Synth(), b = new Synth(), on = bangCfg(), off = bangCfg({ v8_shiftBangOn: false });
    assert.equal(peak(a.render(telemetry.snapshot(), on, 2)), 0);
    b.render(telemetry.snapshot(), off, 2);
    now += 150;
    groups[GEAR].statusGearboxDrive.decode({ statusActualStageDrive: 4, statusActualGearDrive: 5 });
    assert.ok(peak(a.render(telemetry.snapshot(), on, 2)) > 100);
    assert.equal(peak(b.render(telemetry.snapshot(), off, 2)), 0);
    assert.equal(a.events.upshift, 1);
    a.render(telemetry.snapshot(), on, 2); assert.equal(a.events.upshift, 1);
});

test('Pop volume and hardness affect recorded transients; zero volume silences the complete pop layer', () => {
    function release(extra) {
        const synth = new Synth(), configuration = bangCfg(extra);
        synth.render(state(), configuration, 2);
        return synth.render(state(2, 1, { pedal: { at: 200, sequence: 2, value: .01 } }), configuration, 2);
    }
    const loud = release({ v8_bangVolume: 100 }), quiet = release({ v8_bangVolume: 25 });
    assert.ok(peak(loud) > peak(quiet) * 1.5);
    assert.equal(peak(release({ v8_bangVolume: 0 })), 0);
    assert.notDeepEqual(release({ v8_bangHardness: 0 }), release({ v8_bangHardness: 100 }));
});

test('Turbo shift release is audible in its own layer and can be disabled independently', () => {
    function shift(extra) {
        const configuration = cfg(Object.assign({ v8_engineOn: false, v8_exhaustOn: false, v8_bangOn: false, v8_turbo: 0 }, extra));
        const synth = new Synth(); synth.render(state(2, 1), configuration, 2);
        return synth.render(state(3, 2), configuration, 2);
    }
    assert.ok(peak(shift({ v8_shiftTurboOn: true })) > 100);
    assert.equal(peak(shift({ v8_shiftTurboOn: false })), 0);
});

test('Shift cracks require a suitable measured load or confirmed coasting condition, not every gear change', () => {
    for (const extra of [{ pedal: null, torque: null }, { pedal: { at: 100, sequence: 1, value: 0 }, torque: 0 }]) {
        const synth = new Synth(), configuration = bangCfg();
        synth.render(state(2, 1, extra), configuration, 2);
        assert.equal(peak(synth.render(state(3, 2, extra), configuration, 2)), 0);
        assert.equal(synth.events.upshift, 1, 'actual shift remains diagnostically visible');
    }
    const synth = new Synth(), configuration = bangCfg();
    const coast = { pedal: { at: 100, sequence: 1, value: .02 }, torque: -50 };
    synth.render(state(3, 1, coast), configuration, 2);
    assert.ok(peak(synth.render(state(2, 2, coast), configuration, 2)) > 100);
    assert.equal(synth.events.downshift, 1);
});

test('Shift diagnostics preserve measured RPM before, at and after the event', () => {
    const events = new SoundEvents(); events.observe(state(2, 1, { rpm: 4200 }));
    events.observe(state(3, 2, { rpm: 3900 }));
    for (let i = 0; i < 20; i++) events.observe(state(3, 2, { rpm: 3100 - i * 5 }));
    assert.equal(events.shiftObservation.rpmBefore, 4200);
    assert.equal(events.shiftObservation.rpmAtShift, 3900);
    assert.equal(events.shiftObservation.rpmAfter, 3005);
});

test('Shutdown tail runs once for less than a second after measured RPM zero, motor off, speed zero and P', () => {
    const synth = new Synth(), configuration = cfg();
    synth.render(state(), configuration, 2);
    const stopped = state(null, 2, { engine: 'off', rpm: 0, speed: 0, stage: 'P', pedal: null, gearSignal: null });
    assert.ok(synth.wantsAudio(stopped, configuration));
    let active = 0;
    for (let i = 0; i < 75; i++) if (peak(synth.render(stopped, configuration, 2)) > 0) active++;
    assert.ok(active > 20 && active <= 43, 'bounded tail duration');
    assert.equal(synth.events.shutdown, 1);
    assert.equal(peak(new Synth().render(stopped, configuration, 2)), 0, 'no shutdown sound at cold app start');
});

test('Missing RPM or parking data, movement, mute and the tail switch stop shutdown audio', () => {
    const stopped = state(null, 2, { engine: 'off', rpm: 0, speed: 0, stage: 'P', pedal: null, gearSignal: null });
    for (const changed of [{ rpm: null }, { speed: null }, { speed: 1 }, { stage: 'D' }, { engine: null }]) {
        const synth = new Synth(), configuration = cfg(); synth.render(state(), configuration, 2);
        assert.equal(peak(synth.render(Object.assign({}, stopped, changed), configuration, 2)), 0);
    }
    for (const settings of [{ enabled: false }, { v8_shutdownTailOn: false }]) {
        const synth = new Synth(); synth.render(state(), cfg(), 2);
        assert.equal(peak(synth.render(stopped, cfg(settings), 2)), 0);
    }
});

test('Missing or corrupt recording data fails silent with a concrete engine error', () => {
    const moduleFile = path.resolve(__dirname, '../apps/patryklars6_motor_sound/sound.js');
    const code = "const fs=require('fs'),old=fs.readFileSync; fs.readFileSync=function(p,...a){const b=old.call(this,p,...a);if(String(p).endsWith('.pcm')){b[0]^=1;}return b;}; const S=require(" + JSON.stringify(moduleFile) + ").Synth;const s=new S();if(!/checksum/.test(s.error))process.exit(2);";
    cp.execFileSync(process.execPath, ['-e', code]);
});

test('Recorded output stays bounded during sustained running, rapid profile switches and five-channel mixing', () => {
    const synth = new Synth(), names = ['v6', 'v8', 'f90', 'm', 'diesel', 'individual'];
    for (let block = 0; block < 1000; block++) {
        const configuration = cfg({ manualProfile: names[Math.floor(block / 25) % names.length], level: 80, limit: 35 });
        const pcm = synth.render(state(2, 1, { rpm: 800 + block % 140 * 37 }), configuration, 5);
        assert.equal(pcm.length, FRAMES * 10);
        assert.ok(peak(pcm) <= Math.ceil(32767 * PEAK * .35));
    }
});
