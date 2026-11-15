'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Telemetry, CDS, VEHICLE, GEAR, FES, PEDAL } = require('../apps/patryklars6_motor_sound/telemetry');
const { connectVehicle } = require('../apps/patryklars6_motor_sound/vehicle');
const { FRAMES, PEAK, MODES, resolveSettings, Synth } = require('../apps/patryklars6_motor_sound/sound');
const { PcmOutput } = require('../apps/patryklars6_motor_sound/output');
const spec = require('../apps/patryklars6_motor_sound/app.json');

function feed() {
    let time = 30;
    const telemetry = new Telemetry(() => time);
    const group = telemetry.watchGroups();
    function add(iface, field, data) { group[iface][field].decode(data); }
    return { telemetry, add, tick: ms => { time += ms; } };
}

function preferences(settings = {}, mode = 'sport') {
    const values = Object.assign({}, Object.fromEntries(spec.settings.map(x => [x.key, x.default])), { enabled: true }, settings);
    return resolveSettings(key => values[key], mode);
}

function driving(overrides) {
    return Object.assign({ rpm: 1850, engine: 'running', pedal: { value: 0.58, at: 100, sequence: 1 }, torque: null, stage: 'D', idle: false }, overrides);
}

function peak(pcm) {
    let max = 0;
    for (let i = 0; i < pcm.length; i += 2) max = Math.max(max, Math.abs(pcm.readInt16LE(i)));
    return max;
}

test('Vehicle payloads decode with the published scales and expire independently', () => {
    const { telemetry, add, tick } = feed();
    assert.equal(telemetry.snapshot().rpm, null);
    add(CDS, 'statusEngineSpeed2', { actualValueRPMEngineCrankshaft: 3212 });
    add(CDS, 'statusEngineStatus', { statusEngineRunDrive: 'MOTOR_LAEUFT' });
    add(VEHICLE, 'statusCarSpeed2', { speedVehicleCentreOfGravity: 0 });
    add(GEAR, 'statusGearboxDrive', { statusActualStageDrive: 'N', statusActualGearDrive: 'N_OR_P' });
    add(FES, 'statusFESVehicleDynamicSwitchHMI', { actualValueModeDrivingExperience: 2 });
    add(PEDAL, 'AngleAcceleratorPedal', { actualValueAngleAcceleratorPedal: 0 });
    const s = telemetry.snapshot();
    assert.equal(s.rpm, 803);
    assert.equal(s.speed, 0);
    assert.equal(s.engine, 'running');
    assert.equal(s.stage, 'N');
    assert.equal(s.neutral, true);
    assert.equal(s.idle, true);
    assert.equal(s.mode, 'sportPlus');
    tick(1001);
    assert.equal(telemetry.snapshot().rpm, null);
    assert.equal(telemetry.snapshot().idle, null);
    assert.equal(telemetry.snapshot().mode, 'sportPlus');
    tick(7000);
    assert.equal(telemetry.snapshot().engine, null);
    assert.equal(telemetry.snapshot().mode, null);
});

test('Invalid samples invalidate immediately and ambiguous P/N is left unresolved', () => {
    const { telemetry, add } = feed();
    add(CDS, 'statusEngineSpeed2', { actualValueRPMEngineCrankshaft: 2400 });
    add(CDS, 'statusEngineSpeed2', { actualValueRPMEngineCrankshaft: 65535 });
    add(GEAR, 'DataPowerTrain2', { statusGearSelectionDrive: 'NP' });
    add(FES, 'statusFESVehicleDynamicSwitchHMI', { actualValueModeDrivingExperience: 'ADAPTIVE' });
    assert.equal(telemetry.snapshot().rpm, null);
    assert.equal(telemetry.snapshot().neutral, null);
    assert.equal(telemetry.snapshot().mode, null);
    add(GEAR, 'DataPowerTrain2', { statusGearSelectionDrive: '_6' });
    assert.equal(telemetry.snapshot().gear, 6);
    add(GEAR, 'statusGearboxDrive', { statusActualStageDrive: 1, statusActualGearDrive: 2 });
    assert.equal(telemetry.snapshot().stage, 'P');
    assert.equal(telemetry.snapshot().neutral, false);
    assert.equal(telemetry.snapshot().gear, null);
});

test('Drive modes choose four independent assignments and scaled intensity', () => {
    const choices = { eco: 'm', comfort: 'f90', sport: 'v8', sportPlus: 'individual' };
    let last = -1;
    for (const mode of Object.keys(MODES)) {
        const v = preferences(choices, mode);
        assert.equal(v.profileId, choices[mode]);
        assert.ok(v.gain > last);
        last = v.gain;
    }
    assert.equal(preferences({}, null).profileId, null);
    assert.equal(preferences({ autoMode: false, manualProfile: 'individual' }, null).profileId, 'individual');
    assert.equal(preferences({ level: 100, limit: 40 }).ceiling, 0.4);
});

test('All three factory voices and Individual produce distinct bounded PCM', () => {
    const voices = ['v8', 'f90', 'm', 'individual'].map(manualProfile => {
        const cfg = preferences({ autoMode: false, manualProfile, level: 100, limit: 100 });
        return new Synth().render(driving(), cfg, 4);
    });
    for (let i = 0; i < voices.length; i++) {
        assert.equal(voices[i].length, FRAMES * 8);
        assert.ok(peak(voices[i]) > 0 && peak(voices[i]) <= Math.ceil(PEAK * 32767));
        for (let j = 0; j < i; j++) assert.notDeepEqual(voices[j], voices[i]);
    }
});

test('Zero control, stopped engine, missing RPM and unknown automatic mode produce silence', () => {
    const synth = new Synth();
    assert.ok(peak(synth.render(driving(), preferences(), 2)) > 0);
    const cases = [
        [driving(), preferences({ enabled: false })],
        [driving(), preferences({ level: 0 })],
        [driving({ rpm: null }), preferences()],
        [driving({ engine: 'off' }), preferences()],
        [driving({ engine: 'starting' }), preferences()],
        [driving(), preferences({}, null)]
    ];
    cases.forEach(([data, cfg]) => assert.equal(peak(synth.render(data, cfg, 2)), 0));
});

test('Fader, balance, and missing rear channels affect the app stream', () => {
    for (const system of spec.settings.find(s => s.key === 'speakers').options) {
        assert.equal(preferences({ speakers: system[0] }).speaker.label, system[1]);
    }
    const cfg = preferences({ speakers: 'other', rear: false, balance: 100, fader: 100 });
    assert.deepEqual(cfg.gains, [0, 1, 0, 0]);
    const frame = new Synth().render(driving(), cfg, 4);
    assert.ok(peak(frame) > 0);
    for (let i = 0; i < frame.length; i += 8) {
        assert.equal(frame.readInt16LE(i), 0);
        assert.equal(frame.readInt16LE(i + 4), 0);
        assert.equal(frame.readInt16LE(i + 6), 0);
    }
    const stereo = new Synth().render(driving(), cfg, 2);
    assert.ok(peak(stereo) > 0);
    for (let i = 0; i < stereo.length; i += 4) assert.equal(stereo.readInt16LE(i), 0);
});

test('Turbo lift is triggered by real consecutive pedal readings and never replayed on the same sample', () => {
    const withLift = preferences({ autoMode: false, manualProfile: 'individual', lift: 100 });
    const noLift = preferences({ autoMode: false, manualProfile: 'individual', lift: 0 });
    const a = new Synth();
    const b = new Synth();
    assert.deepEqual(a.render(driving(), withLift, 2), b.render(driving(), noLift, 2));
    const lifted = driving({ pedal: { value: 0.1, at: 190, sequence: 2 } });
    assert.notDeepEqual(a.render(lifted, withLift, 2), b.render(lifted, noLift, 2));
    const strength = a.lift;
    a.render(lifted, withLift, 2);
    assert.ok(a.lift < strength);
});

class Peer extends EventEmitter {
    constructor() { super(); this.packets = []; this.ready = true; }
    write(value) { this.packets.push(value); return this.ready; }
    destroy() { this.destroyed = true; this.emit('close'); }
}
test('Unix output requires an acknowledged format and drops backlogged frames', () => {
    const socket = new Peer();
    let now = 0;
    const output = new PcmOutput(() => now, { trusted: () => true, open: () => socket });
    output.tick();
    socket.emit('connect');
    output.write(Buffer.alloc(FRAMES * 8));
    assert.deepEqual(socket.packets, ['LUXO/1 S16LE 48000\n']);
    socket.emit('data', Buffer.from('REA'));
    socket.emit('data', Buffer.from('DY 4\n'));
    assert.equal(output.channels, 4);
    socket.ready = false;
    output.write(Buffer.alloc(FRAMES * 8));
    output.write(Buffer.alloc(FRAMES * 8));
    assert.equal(socket.packets.length, 2);
    now = 100;
    output.tick();
    assert.equal(socket.destroyed, true);
    assert.equal(output.channels, 0);
});

test('Unix output never opens an untrusted endpoint and rejects an invalid channel count', () => {
    const bad = new Peer();
    const output = new PcmOutput(() => 0, { trusted: () => true, open: () => bad });
    const bypass = new PcmOutput(() => 0, { trusted: () => false, open: () => assert.fail('unexpected connection') });
    bypass.tick();
    output.tick();
    bad.emit('data', Buffer.from('READY 8\n'));
    assert.equal(bad.destroyed, true);
});

test('Every vehicle interface only requests subscriptions and getters', () => {
    assert.equal(typeof connectVehicle, 'function');
    const fields = new Telemetry(() => 0).watchGroups();
    for (const [iface, specFields] of Object.entries(spec.signals)) {
        assert.deepEqual(Object.keys(fields[iface]).sort(), Object.keys(specFields).filter(x => x[0] !== '_').sort());
        assert.ok(Object.values(specFields).filter(x => x === 'rs').length > 0);
        assert.ok(Object.entries(specFields).every(([k, v]) => k === '_optional' || v === 'rs'));
    }
});

test('SOME/IP getters and notifications update the app and provider loss clears live data', { timeout: 3000 }, async t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luxo-live-test-'));
    const config = path.join(dir, 'de_bmw_infotainment_vehicle_CDS.json');
    fs.writeFileSync(config, JSON.stringify({ fields: {
        statusEngineSpeed2: { getter: {}, notifier: {} },
        statusEngineStatus: { notifier: {} }
    } }));
    t.after(() => { fs.unlinkSync(config); fs.rmdirSync(dir); });

    const notifications = new Map();
    let available;
    let finishRead;
    const reading = new Promise(resolve => { finishRead = resolve; });
    const proxy = {
        init() {},
        subscribeToAvailability(fn) { available = fn; },
        subscribe({ name, onReceive }) { notifications.set(name, onReceive); },
        isAvailable() { return false; },
        getValue() { return reading; }
    };
    const { telemetry, tick } = feed();
    const stop = connectVehicle(telemetry, { warn() {} }, { buildProxy: async () => proxy }, dir);
    t.after(stop);
    const waitTick = () => new Promise(resolve => setImmediate(resolve));
    for (let retries = 0; notifications.size < 2 && retries < 100; retries++) await waitTick();
    assert.equal(notifications.size, 2);
    available(true);
    await waitTick();
    notifications.get('statusEngineStatus')({ statusEngineRunDrive: 2 });
    notifications.get('statusEngineSpeed2')({ actualValueRPMEngineCrankshaft: 4320 });
    finishRead({ actualValueRPMEngineCrankshaft: 4000 });
    await waitTick();
    assert.equal(telemetry.snapshot().rpm, 1080);
    assert.equal(telemetry.snapshot().engine, 'running');
    tick(8500);
    assert.equal(telemetry.snapshot().rpm, null);
    assert.equal(telemetry.snapshot().engine, 'running');
    available(false);
    assert.equal(telemetry.snapshot().engine, null);
    notifications.get('statusEngineSpeed2')({ actualValueRPMEngineCrankshaft: 4560 });
    assert.equal(telemetry.snapshot().rpm, null);
});

test('Known textual BMW mode values select the corresponding profile without guessing unknown modes', () => {
    const { telemetry, add } = feed();
    const modes = { ECO_PRO_EFFICIENT: 'eco', COMFORT: 'comfort', SPORT_DYNAMIC: 'sport', SPORT_EXPERT: 'sportPlus' };
    for (const [wire, expected] of Object.entries(modes)) {
        add(FES, 'statusFESVehicleDynamicSwitchHMI', { actualValueModeDrivingExperience: wire });
        assert.equal(telemetry.snapshot().mode, expected);
    }
    add(FES, 'statusFESVehicleDynamicSwitchHMI', { actualValueModeDrivingExperience: 63 });
    assert.equal(telemetry.snapshot().mode, null);
});
