'use strict';

// Capture the packaged drawing code. No vehicle connection or invented signals.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
assert.ok(process.argv[2], 'Usage: node tools/render_screenshots.cjs EXTRACTED_PACKAGE [OUTPUT]');
const packageRoot = path.resolve(process.argv[2]);
const dir = path.join(packageRoot, 'javascript');
const spec = require(path.join(dir, 'kit', 'app-spec.json'));
const output = path.resolve(process.argv[3] || path.join(root, 'docs', 'screenshots', spec.version));
const sourceSpec = require(path.join(root, 'apps', 'patryklars6_motor_sound', 'app.json'));
assert.equal(spec.version, sourceSpec.version);
assert.ok(fs.readFileSync(path.join(dir, 'app.js'), 'utf8').replace(/\r\n/g, '\n') ===
    fs.readFileSync(path.join(root, 'apps', 'patryklars6_motor_sound', 'main.js'), 'utf8').replace(/\r\n/g, '\n'),
    'Extract the current package; app.js must match the current source.');
const { Canvas } = require(path.join(dir, 'kit', 'canvas'));
const { Recorder, play } = require(path.join(dir, 'kit', 'record'));
const { Telemetry } = require(path.join(dir, 'telemetry'));
const { PcmOutput } = require(path.join(dir, 'output'));
const { resolveSettings } = require(path.join(dir, 'sound'));
const { AudioDiagnostics } = require(path.join(dir, 'audio-diagnostics'));

let implementation;
const original = Module._load;
Module._load = function (id, ...args) {
    if (id === './kit/mgu') return { run(value) { implementation = value; return Promise.resolve(); } };
    return original.call(this, id, ...args);
};
try { require(path.join(dir, 'app')); } finally { Module._load = original; }

const definitions = new Map(spec.settings.map(item => [item.key, item]));
const values = new Map(spec.settings.map(item => [item.key, item.default]));
const listeners = [];
const settings = {
    schema: spec.settings,
    item: key => definitions.get(key),
    get: key => values.get(key),
    set(key, value) { values.set(key, value); listeners.forEach(fn => fn(key)); },
    onChange(fn) { listeners.push(fn); },
    shown: item => !item.hidden && (!item.when || Object.entries(item.when).every(([key, value]) => [].concat(value).includes(values.get(key)))),
    numberText: (item, value) => String(value) + (item.unit ? ' ' + item.unit : ''),
    display(key) {
        const item = definitions.get(key), value = values.get(key);
        if (item.type === 'choice') return item.options.find(option => option[0] === value)?.[1] ?? String(value);
        return this.numberText(item, value);
    }
};
const vehicle = new Telemetry(() => 0);
const pcm = new PcmOutput(() => 0);
pcm.tick(false); // A missing local audio service is reported honestly.
const background = { vehicle, output: pcm, effective: mode => resolveSettings(key => settings.get(key), mode) };
background.diagnostics = new AudioDiagnostics({ vehicle, output: pcm, settings, spec, effective: background.effective });
const app = new EventEmitter();
const handlers = new Map(), cells = new Map(), visible = new Map(), frames = new Map();
let active = 'NATIVE', visibilityChanged, tick;
const context = {
    app, spec, settings, background, log: { warn() {} },
    // Host renderer capability, never a claim about the user's head unit.
    display: { blocked: false, ownable: () => true, gpu: { native: true, touch: true, info: { controller: true } } },
    onLayout() {}, onTap() {},
    canvas(w, h) { const frame = new Recorder(w, h); frame.own = true; return frame; },
    loop(name, fps, callback) { assert.equal(name, 'MAIN'); tick = callback; return { kick() {} }; },
    ui: {
        onClick(name, fn) { handlers.set(name, fn); },
        onVisible(fn) { visibilityChanged = fn; },
        cells(name, index, value) { cells.set(name, value); return Promise.resolve(); },
        visible(name, value) { visible.set(name, value); return Promise.resolve(); },
        enabled() { return Promise.resolve(); }, text() { return Promise.resolve(); },
        isVisible: name => active === name,
        open(name) { active = name; visibilityChanged(name, true); return Promise.resolve(); },
        close(name) { if (active === name) active = 'NATIVE'; return Promise.resolve(); },
        image(name, frame) { frames.set(name, frame); return Promise.resolve(); }
    }
};
const captures = [];
async function nativeClick(label) {
    const entry = Array.from(cells).find(([key, value]) => visible.get(key) && value.Text1stRow === label);
    assert.ok(entry, 'Missing native menu row: ' + label);
    await handlers.get(entry[0])();
}
async function draw(file) {
    assert.equal(active, 'MAIN');
    assert.equal(settings.get('theme'), 'luxo');
    assert.ok(Object.values(vehicle.snapshot()).every(value => value === null), 'Vehicle values must remain unavailable');
    await tick();
    const frame = frames.get('MAIN_GFX');
    assert.ok(frame && frame.words().length);
    if (file) {
        const canvas = new Canvas(frame.w, frame.h);
        play(frame.words(), canvas);
        const bytes = canvas.png(8);
        fs.writeFileSync(path.join(output, file), bytes);
        captures.push({ file, width: frame.w, height: frame.h,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    }
    return frame;
}
async function target(key) {
    const frame = await draw();
    const item = frame.targets.find(entry => entry.key === key);
    assert.ok(item, 'Missing interactive target: ' + key);
    await item.run();
}
async function home() {
    await handlers.get('BTN_BMW_MENU')();
    await nativeClick('LUXO-Oberfläche');
}

async function main() {
    fs.mkdirSync(output, { recursive: true });
    await implementation.start(context);
    assert.equal(active, 'NATIVE');
    await nativeClick('Lautsprecher');
    // Keep the user's actual selected amplifier in all captures.
    settings.set('speakers', 'up10');
    settings.set('manualProfile', 'v8');
    settings.set('autoMode', false);
    await nativeClick('Zurück / Hauptmenü');
    await nativeClick('LUXO-Oberfläche');
    await draw('hauptmenue.png');
    await target('nav-live');
    await draw('live-daten.png');
    await home();
    await target('nav-profiles');
    await draw('soundprofile.png');
    await target('profil-tuning');
    await draw('sound-tuning.png');
    await target('turbo-tune');
    await draw('turbo-einstellungen.png');
    await target('settings-page-down');
    await draw('turbo-varianten.png');
    await home();
    await target('nav-individual');
    await target('engine-tune');
    await draw('motor-einstellungen.png');
    await home();
    await target('nav-individual');
    await target('exhaust-tune');
    await draw('auspuff-einstellungen.png');
    await home();
    await target('nav-individual');
    await target('bang-tune');
    await draw('pop-bangs.png');
    await home();
    await target('nav-speakers');
    await draw('lautsprecher.png');
    await home();
    await target('nav-modes');
    await target('autoMode');
    assert.equal(settings.get('autoMode'), true);
    await draw('fahrmodi.png');
    await target('autoMode');
    await home();
    await target('nav-settings');
    await draw('einstellungen.png');
    await home();
    await target('nav-design');
    await draw('design.png');
    await home();
    await target('nav-info');
    await draw('info.png');
    await home();
    await background.diagnostics.refresh();
    await target('nav-audio');
    while (background.diagnostics.busy) await new Promise(resolve => setTimeout(resolve, 5));
    background.diagnostics.nextRefresh = Date.now() + 60000;
    await draw('audio-diagnose.png');
    await target('diag-page-1');
    await draw('audio-geraete.png');
    await target('diag-page-1');
    await draw('audio-tests.png');
    await target('diag-page-1');
    await draw('audio-export.png');
    await target('diag-page-1');
    await draw('audio-fehler.png');
    await target('nav-native');
    assert.equal(active, 'NATIVE');
    await nativeClick('Lautstärke und Audio');
    const audioRows = Array.from(cells).filter(([key]) => visible.get(key)).map(([, value]) => value);
    fs.writeFileSync(path.join(output, 'capture.json'), JSON.stringify({
        version: spec.version, theme: 'luxo', capture: 'packaged software renderer',
        vehicleConnected: false, vehicleSignals: 'unavailable',
        note: 'No vehicle photo; native BMW menu appearance depends on head unit. Audio rows below are runtime text only.',
        nativeAudioRows: audioRows, images: captures
    }, null, 2) + '\n');
    console.log('Captured ' + captures.length + ' LUXO menus from package ' + spec.version + '; no invented vehicle values.');
}
main().then(() => { pcm.close(); app.emit('shutdown'); }, error => {
    pcm.close(); app.emit('shutdown'); console.error(error); process.exitCode = 1;
});
