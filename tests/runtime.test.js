'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Telemetry, CDS, CDS2, VEHICLE, GEAR, FES, PEDAL } = require('../apps/patryklars6_motor_sound/telemetry');
const { connectVehicle } = require('../apps/patryklars6_motor_sound/vehicle');
const { FRAMES, PEAK, MODES, resolveSettings, channelMatrix, Synth } = require('../apps/patryklars6_motor_sound/sound');
const { drawHome } = require('../apps/patryklars6_motor_sound/home');
const { smoothGauge, drawLive, drawProfiles } = require('../apps/patryklars6_motor_sound/view');
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

test('BMW drive modes choose independent assignments and their configured intensity', () => {
    const choices = { eco: 'm', comfort: 'f90', sport: 'v8', sportPlus: 'individual', individualMode: 'f90' };
    let last = -1;
    for (const mode of ['eco', 'comfort', 'sport', 'sportPlus']) {
        const v = preferences(choices, mode);
        assert.equal(v.profileId, choices[mode]);
        assert.ok(v.gain > last);
        last = v.gain;
    }
    assert.equal(preferences(choices, 'individualMode').profileId, 'f90');
    assert.equal(preferences({}, null).profileId, null);
    assert.equal(preferences({ autoMode: false, manualProfile: 'individual' }, null).profileId, 'individual');
    assert.equal(preferences({ level: 100, limit: 40 }).ceiling, 0.4);
});

test('All five factory voices and Individual produce distinct bounded PCM', () => {
    const voices = ['v6', 'v8', 'f90', 'm', 'diesel', 'individual'].map(manualProfile => {
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
    channelMatrix(cfg.routes, 4).forEach(gain => assert.deepEqual(gain, [0, 1, 0, 0]));
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
    const modes = { ECO_PRO_EFFICIENT: 'eco', COMFORT: 'comfort', SPORT_DYNAMIC: 'sport', SPORT_EXPERT: 'sportPlus',
        SPORT_INDIVIDUAL: 'individualMode', 6: 'individualMode', ECO_PRO_INDIVIDUAL: 'individualMode' };
    for (const [wire, expected] of Object.entries(modes)) {
        add(FES, 'statusFESVehicleDynamicSwitchHMI', { actualValueModeDrivingExperience: wire });
        assert.equal(telemetry.snapshot().mode, expected);
    }
    add(FES, 'statusFESVehicleDynamicSwitchHMI', { actualValueModeDrivingExperience: 63 });
    assert.equal(telemetry.snapshot().mode, null);
});

test('Only a current longitudinal acceleration signal is displayed', () => {
    const { telemetry, add, tick } = feed();
    assert.equal(telemetry.snapshot().acceleration, null);
    add(CDS2, 'statusLongitudinalAccelerationMassCenter', { longitudinalAccelerationCentreOfGravity: 33500 });
    assert.equal(telemetry.snapshot().acceleration, 2);
    tick(1501);
    assert.equal(telemetry.snapshot().acceleration, null);
    add(CDS2, 'statusLongitudinalAccelerationMassCenter', { longitudinalAccelerationCentreOfGravity: 65535 });
    assert.equal(telemetry.snapshot().acceleration, null);
});

test('Each of the four profiles owns its adjustable sound parameters', () => {
    const every = { v8_engine: 12, f90_engine: 24, m_engine: 36, engine: 48, v8_lift: 72,
        f90_turbo: 81, m_exhaust: 93, bass: 59 };
    const choose = manualProfile => preferences(Object.assign({}, every, { autoMode: false, manualProfile }));
    assert.equal(choose('v8').voice.engine, 0.12);
    assert.equal(choose('f90').voice.engine, 0.24);
    assert.equal(choose('m').voice.engine, 0.36);
    assert.equal(choose('individual').voice.engine, 0.48);
    assert.equal(choose('v8').voice.lift, 0.72);
    assert.equal(choose('f90').voice.turbo, 0.81);
    assert.equal(choose('m').voice.exhaust, 0.93);
    assert.equal(choose('individual').voice.bass, 0.59);
});

test('Animation only interpolates the dial and never supplies missing or displayed RPM', () => {
    assert.equal(smoothGauge(null, 900, 17), 900);
    const needle = smoothGauge(900, 1400, 17);
    assert.ok(needle > 900 && needle < 1400);
    assert.equal(smoothGauge(needle, null, 17), null);

    const labels = [];
    const cv = { fillRect() {}, roundRect() {}, arc() {}, circle() {}, line() {}, text(label) { labels.push(label); } };
    const { telemetry, add } = feed();
    const prefs = preferences();
    drawLive(cv, telemetry.snapshot(), prefs, { channels: 0, state: 'waiting' }, null, {});
    assert.equal(labels.filter(label => label === 'Nicht verfügbar').length, 7);
    add(CDS, 'statusEngineSpeed2', { actualValueRPMEngineCrankshaft: 5600 });
    const start = labels.length;
    drawLive(cv, telemetry.snapshot(), prefs, { channels: 0, state: 'waiting' }, needle, {});
    assert.ok(labels.slice(start).includes('1400'));
    assert.ok(!labels.slice(start).includes(String(Math.round(needle))));
});

test('Profile cards and automatic mode switch are assigned real actions', () => {
    const active = [];
    const targets = new Map();
    const cv = {
        own: true, fillRect() {}, roundRect() {}, strokeRoundRect() {}, circle() {}, text() {},
        target(x, y, w, h, act, key) { targets.set(key, act); }
    };
    drawProfiles(cv, preferences(), { select: id => active.push(id), auto: () => active.push('auto') });
    assert.equal(targets.size, 8);
    targets.get('f90')();
    targets.get('fahrmodusautomatik')();
    assert.deepEqual(active, ['f90', 'auto']);
});

test('Individual mode has a dedicated map and never applies a simulated BMW mode', () => {
    const cfg = preferences({ individualMode: 'v8' }, 'individualMode');
    assert.equal(MODES.individualMode.label, 'INDIVIDUAL');
    assert.equal(cfg.profileId, 'v8');
    assert.equal(preferences({}, 'individualMode').profileId, 'individual');
});

test('Independent layer switches and volumes affect the PCM independently', () => {
    const manual = { autoMode: false, manualProfile: 'v8' };
    const muted = { v8_engineOn: false, v8_turboOn: false, v8_exhaustOn: false };
    const cfg = layer => preferences(Object.assign({}, manual, muted, layer));
    const render = layer => new Synth().render(driving(), cfg(layer), 2);
    assert.equal(peak(render({})), 0);
    for (const name of ['engine', 'turbo', 'exhaust']) {
        const on = { ['v8_' + name + 'On']: true };
        const full = render(on);
        assert.ok(peak(full) > 0);
        const reduced = render(Object.assign({}, on, { ['v8_' + name + 'Volume']: 25 }));
        assert.ok(peak(reduced) > 0 && peak(reduced) < peak(full));
    }
    assert.notDeepEqual(render({ v8_engineOn: true }), render({ v8_engineOn: true, v8_character: 'mperformance' }));
});

test('Synthetic overrun effect waits for a real falling pedal sample and can be disabled', () => {
    const settings = { autoMode: false, manualProfile: 'v8', v8_engineOn: false, v8_turboOn: false, v8_exhaustOn: false };
    const on = preferences(Object.assign({}, settings, { v8_bangOn: true }));
    const off = preferences(settings);
    const release = driving({ pedal: { value: 0.08, sequence: 2, at: 140 } });
    const a = new Synth();
    assert.equal(peak(a.render(driving(), on, 2)), 0);
    assert.ok(peak(a.render(release, on, 2)) > 0);
    const b = new Synth();
    b.render(driving(), off, 2);
    assert.equal(peak(b.render(release, off, 2)), 0);
});

test('Profile balance overrides system balance and front/rear respects two-channel output', () => {
    const front = preferences({ autoMode: false, manualProfile: 'v8', v8_fader: '-100', v8_balance: '100' });
    const back = preferences({ autoMode: false, manualProfile: 'v8', v8_fader: '100', v8_balance: '100' });
    channelMatrix(front.routes, 4).forEach(gain => assert.deepEqual(gain, [0, 1, 0, 0]));
    channelMatrix(back.routes, 4).forEach(gain => assert.deepEqual(gain, [0, 0, 0, 1]));
    assert.deepEqual(new Synth().render(driving(), front, 2), new Synth().render(driving(), back, 2));
    assert.notDeepEqual(new Synth().render(driving(), front, 4), new Synth().render(driving(), back, 4));
});

test('Main-menu navigation, switches, adjustment and reset call their configured actions', () => {
    const events = [];
    const targets = new Map();
    const cv = { own: true, fillRect() {}, roundRect() {}, strokeRoundRect() {}, circle() {}, arc() {}, polyline() {},
        line() {}, text() {}, target(x, y, w, h, act, key) { targets.set(key, act); } };
    const action = name => (...args) => events.push([name].concat(args));
    const controls = { nav: action('nav'), select: action('select'), adjust: action('adjust'), flip: action('flip'),
        power: action('power'), auto: action('auto'), reset: action('reset') };
    const state = { theme: 'orange', status: 'Aus', enabled: false, selected: 'v8', auto: true, label: 'V8 Sound',
        effects: { turbo: { level: 50, on: true }, exhaust: { level: 50, on: true }, bang: { level: 50, on: false } } };
    const sliders = drawHome(cv, { mode: null }, state, controls);
    assert.equal(sliders.length, 3);
    ['nav-live', 'sound-power', 'home-f90', 'turbo-up', 'exhaust-down', 'bang-switch', 'profile-reset', 'auto-mode']
        .forEach(key => targets.get(key)());
    assert.deepEqual(events, [['nav', 'live'], ['power'], ['select', 'f90'], ['adjust', 'turbo', 10],
        ['adjust', 'exhaust', -10], ['flip', 'bang'], ['reset'], ['auto']]);
});

test('All four persistent theme choices have distinct palettes and the amplifier subpage is interactive', () => {
    const { themeFor, kitTheme } = require('../apps/patryklars6_motor_sound/themes');
    const { drawSettings } = require('../apps/patryklars6_motor_sound/settings-view');
    const themes = spec.settings.find(item => item.key === 'theme').options.map(option => option[0]);
    assert.equal(new Set(themes.map(id => themeFor(id).bg)).size, 4);
    assert.equal(themeFor('unrecognized').label, 'LUXO');
    assert.equal(kitTheme(themeFor('ice_white')).text, '#18334a');
    const actions = [];
    const targets = new Map();
    const cv = { own: true, fillRect() {}, roundRect() {}, strokeRoundRect() {}, text() {}, line() {},
        target(x, y, w, h, act, key) { targets.set(key, act); } };
    drawSettings(cv, { group: 'Lautsprecher', groups: ['Motorsound', 'Lautsprecher'], theme: 'ice_white', index: 0,
        rows: [{ label: 'Lautsprechersystem', value: 'MATCH UP 10', key: 'speakers' }] },
    { group: name => actions.push(name), change: (index, step) => actions.push([index, step]) });
    targets.get('speakers-up')();
    targets.get('settings-Motorsound')();
    assert.deepEqual(actions, [[0, 1], 'Motorsound']);
});

test('Each effect has its own spatial defaults with a center only in the five-channel matrix', () => {
    const cfg = preferences({ autoMode: false, manualProfile: 'v8' });
    const two = channelMatrix(cfg.routes, 2);
    const four = channelMatrix(cfg.routes, 4);
    const five = channelMatrix(cfg.routes, 5);
    assert.equal(two[0].length, 2);
    assert.ok(two[1][1] > two[1][0]);
    assert.ok(four[0][0] > four[0][2]);
    assert.ok(four[1][1] > 3 * four[1][0]);
    assert.ok(four[2][2] > four[2][0]);
    assert.ok(four[3][3] > four[3][1]);
    assert.ok(five[0][4] > 0);
    assert.deepEqual(five.slice(1).map(route => route[4]), [0, 0, 0]);
    const custom = preferences({ autoMode: false, manualProfile: 'v8', v8_turboPan: -100,
        v8_turboFader: 100, v8_turboRouteGain: 50 });
    assert.deepEqual(channelMatrix(custom.routes, 4)[1], [0, 0, 0.5, 0]);
});

test('Output accepts the optional separate five-channel sink and PCM uses its channel order', () => {
    const socket = new Peer();
    const output = new PcmOutput(() => 0, { trusted: () => true, open: () => socket });
    output.tick();
    socket.emit('data', Buffer.from('READY 5\n'));
    assert.equal(output.channels, 5);
    const frame = new Synth().render(driving(), preferences(), output.channels);
    assert.equal(frame.length, FRAMES * 10);
    const center = Array.from({ length: FRAMES }, (_, i) => frame.readInt16LE((5 * i + 4) * 2));
    assert.ok(center.some(value => value !== 0));
    output.close();
});

test('Turbo styles, independent acceleration whistle and pop frequency change emitted PCM', () => {
    const turboOnly = { autoMode: false, manualProfile: 'v8', v8_engineOn: false, v8_exhaustOn: false };
    const turbo = layer => new Synth().render(driving(), preferences(Object.assign({}, turboOnly, layer)), 2);
    assert.notDeepEqual(turbo({ v8_boostOn: false }), turbo({ v8_boostOn: true, v8_boost: 80 }));
    assert.notDeepEqual(turbo({ v8_turboStyle: 'soft' }), turbo({ v8_turboStyle: 'twin' }));
    const settings = Object.assign({}, turboOnly, { v8_turboOn: false, v8_bangOn: true });
    const a = new Synth();
    const quiet = preferences(Object.assign({}, settings, { v8_bangRate: 0 }));
    a.render(driving(), quiet, 4);
    const release = driving({ pedal: { at: 160, sequence: 2, value: 0.03 } });
    assert.equal(peak(a.render(release, quiet, 4)), 0);
    const loud = preferences(Object.assign({}, settings, { v8_bangRate: 100 }));
    const b = new Synth();
    b.render(driving(), loud, 4);
    assert.ok(peak(b.render(release, loud, 4)) > 0);
    assert.ok(b.pops >= 2);
});
