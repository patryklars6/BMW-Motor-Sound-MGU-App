'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const spec = require('../apps/patryklars6_motor_sound/app.json');
const packageRoot = process.env.LUXO_TEST_PACKAGE;
assert.ok(packageRoot, 'Set LUXO_TEST_PACKAGE to the extracted app package');
const kit = path.join(packageRoot, 'javascript', 'kit');
const { Recorder } = require(path.join(kit, 'record'));

function settingsAt(directory) {
    const source = fs.readFileSync(path.join(kit, 'mgu.js'), 'utf8');
    const start = source.indexOf('class Settings {');
    const end = source.indexOf('/* iDrive 7 cells', start);
    const Settings = new Function('fs', 'path', 'DATA_DIR', 'log', source.slice(start, end) + '; return Settings;')(
        fs, path, directory, { warn(message) { throw Error(message); }, error(message) { throw Error(message); } });
    return new Settings(spec.settings);
}

function implementation() {
    let app;
    const original = Module._load;
    Module._load = function (id, parent, isMain) {
        if (id === './kit/mgu') return { run(value) { app = value; return Promise.resolve(); }, log: { error() {} } };
        if (id === './kit/themes') return require(path.join(kit, 'themes'));
        return original.call(this, id, parent, isMain);
    };
    try {
        const file = require.resolve('../apps/patryklars6_motor_sound/main');
        delete require.cache[file];
        require(file);
    } finally { Module._load = original; }
    return app;
}

async function harness(t, touch) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luxo-ui-'));
    const settings = settingsAt(dir);
    const handlers = new Map(), cells = new Map(), visible = new Map(), frames = new Map();
    const app = new EventEmitter();
    const data = { rpm: null, engine: null, speed: null, acceleration: null, stage: null, gear: null, idle: null, mode: null };
    const { resolveSettings } = require('../apps/patryklars6_motor_sound/sound');
    const output = { channels: 0, detail: 'Audio-Dienst fehlt', retry() {} };
    let layoutChanged;
    let visibilityChanged;
    let tick;
    let physical = 'NATIVE';
    let canTouch = touch;
    const context = {
        app, settings, spec, log: { warn() {} },
        background: { vehicle: { snapshot: () => data }, output, effective: mode => resolveSettings(key => settings.get(key), mode) },
        display: { blocked: false, ownable: () => canTouch, gpu: { native: !!touch, touch: !!touch, info: { controller: true } } },
        ui: {
            onClick(name, fn) { handlers.set(name, fn); },
            onVisible(fn) { visibilityChanged = fn; },
            cells(name, row, value) { cells.set(name, value); return Promise.resolve(); },
            visible(name, value) { visible.set(name, value); return Promise.resolve(); },
            text() { return Promise.resolve(); },
            isVisible: name => physical === name,
            open(name) { physical = name; visibilityChanged(name, true); return Promise.resolve(); },
            close(name) { if (physical === name) physical = 'NATIVE'; return Promise.resolve(); },
            image(name, frame) { frames.set(name, frame); return Promise.resolve(); }
        },
        canvas(w, h) { const canvas = new Recorder(w, h); canvas.own = canTouch; return canvas; },
        onLayout(fn) { layoutChanged = fn; }, onTap() {},
        loop(name, fps, fn) { assert.equal(name, 'MAIN'); tick = fn; return { kick() {} }; }
    };
    const native = await implementation().start(context);
    t.after(() => { app.emit('shutdown'); fs.rmSync(dir, { recursive: true }); });
    return {
        settings, dir, native, context, frames, cells, visible,
        async click(label) {
            const name = Array.from(cells).find(([key, value]) => visible.get(key) && value.Text1stRow === label);
            assert.ok(name, 'Missing visible native row ' + label);
            await handlers.get(name[0])();
        },
        async button(name) { await handlers.get(name)(); },
        tick: () => tick(), physical: () => physical,
        loseTouch() { canTouch = false; context.display.gpu.touch = false; layoutChanged(); }
    };
}

test('Native BMW menus expose profiles, values, pagination and theme without a GPU', async t => {
    const h = await harness(t, false);
    await h.click('Soundprofile');
    await h.click('Sport Diesel');
    assert.equal(h.settings.get('manualProfile'), 'diesel');
    assert.equal(h.settings.get('autoMode'), false);
    await h.click('Zurück / Hauptmenü');
    await h.click('Lautstärke und Audio');
    await h.click('App-Pegel');
    await h.click('Weitere Einträge');
    await h.click('90 %');
    assert.equal(h.settings.get('level'), 90);
    await h.click('Zurück / Hauptmenü');
    await h.click('Weitere Einträge');
    await h.click('Design und Darstellung');
    await h.click('Design');
    await h.click('Ice White');
    assert.equal(h.settings.get('theme'), 'ice_white');
    assert.equal(h.physical(), 'NATIVE');
    assert.equal(h.frames.size, 0);
    const restored = settingsAt(h.dir);
    assert.equal(restored.get('manualProfile'), 'diesel');
    assert.equal(restored.get('level'), 90);
    assert.equal(restored.get('theme'), 'ice_white');
});

test('All graphical pages share the active canvas and fall back on renderer loss', async t => {
    const h = await harness(t, true);
    await h.click('LUXO-Oberfläche');
    await h.tick();
    assert.equal(h.physical(), 'MAIN');
    let canvas = h.frames.get('MAIN_GFX');
    const target = key => { const item = canvas.targets.find(q => q.key === key); assert.ok(item, key); return item.run(); };
    await target('home-f90');
    assert.equal(h.settings.get('manualProfile'), 'f90');
    await target('nav-individual');
    await h.tick();
    canvas = h.frames.get('MAIN_GFX');
    await target('turbo-tune');
    await h.tick();
    canvas = h.frames.get('MAIN_GFX');
    assert.ok(canvas.targets.some(q => q.key === 'individual_liftOn'));
    assert.deepEqual(Array.from(h.frames.keys()), ['MAIN_GFX']);
    h.loseTouch();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.physical(), 'NATIVE');
    await h.click('Motorsound');
    assert.equal(h.settings.get('enabled'), true);
});

test('Settings from 0.2.0 survive the update with every existing key and theme intact', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luxo-update-'));
    t.after(() => fs.rmSync(dir, { recursive: true }));
    const old = { manualProfile: 'f90', level: 43, theme: 'orange', speakers: 'up10', v8_turbo: 71,
        f90_engineOn: false, individual_fader: '75', sportPlus: 'diesel', enabled: true, futureSetting: 'keep' };
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(old));
    const settings = settingsAt(dir);
    for (const [key, value] of Object.entries(old)) assert.deepEqual(settings.get(key), value);
    settings.set('turbo', 37);
    const restarted = settingsAt(dir);
    for (const [key, value] of Object.entries(old)) assert.deepEqual(restarted.get(key), value);
    assert.equal(restarted.get('turbo'), 37);
});

function realDisplay(t) {
    const file = path.join(kit, 'display.js');
    const { Display } = require(file);
    const events = new Map();
    const ui = {
        onVisible() {}, onFocus() {}, rhmi: { getByName() { return new EventEmitter(); } },
        isVisible: name => name === 'MAIN', hasFocus: () => true, visible() {}, _invalidate() {}
    };
    const settings = { get: key => key === 'renderer' ? 'software' : 'full', onChange() {} };
    const display = new Display(ui, { info() {}, warn() {}, error(error) { throw Error(error); } }, spec, settings, () => ({ accent: '#c3a3f2', bg: '#151419' }));
    display.gpu = { ready: true, native: true, touch: true, screen: { w: 1280, h: 480 }, info: { controller: true },
        place(value) { this.placement = value; }, grab() {}, claim(rects) { events.set('claims', rects); },
        frame(frame) { events.set('frame', frame); }, visible: true };
    t.after(() => { clearInterval(display.keepTimer); clearTimeout(display.showTimer); });
    return { display, events };
}

test('Real display scales to 1280x480, routes touch to targets and accepts controller presses', async t => {
    const { display, events } = realDisplay(t);
    display._place();
    assert.equal(display.own(), true);
    const pl = display.place;
    assert.ok(pl.scale > 0 && pl.ox >= 0 && pl.oy >= 0);
    assert.ok(1600 * pl.scale + pl.ox <= 1280);
    assert.ok((520 + pl.extra) * pl.scale + pl.oy <= 481);
    const frame = display.canvas(1600, 520);
    assert.equal(frame.own, true);
    let presses = 0;
    frame.target(100, 100, 120, 60, () => { presses++; }, 'profile');
    await display.present('MAIN_GFX', frame, () => Promise.resolve());
    assert.equal(events.get('claims')[0].w, 1600);
    display._touch(1, 120, 120);
    display._touch(3, 120, 120);
    await Promise.resolve();
    assert.equal(presses, 1);
    display._ccu({ frontRotaryEncoderOperation: 0, frontRotaryEncoderPushButton: 0, frontRotaryEncoderDeflection: 0 });
    display._ccu({ frontRotaryEncoderOperation: 1, frontRotaryEncoderPushButton: 0, frontRotaryEncoderDeflection: 0 });
    display._ccu({ frontRotaryEncoderOperation: 1, frontRotaryEncoderPushButton: 1, frontRotaryEncoderDeflection: 0 });
    assert.equal(presses, 2);
});

test('Custom canvas requests the renderer touch protocol even with chrome disabled', () => {
    const source = fs.readFileSync(path.join(kit, 'display.js'), 'utf8');
    let requested;
    class Renderer extends EventEmitter {
        constructor(id, log, options) { super(); requested = options.native; }
        connect() {}
    }
    const scope = { module: { exports: {} }, require(name) {
        if (name === './renderd') return { RenderClient: Renderer };
        return require(path.join(kit, name));
    }, process, Buffer, console, setTimeout, clearTimeout, setInterval, clearInterval };
    vm.runInNewContext(source, scope);
    const display = Object.create(scope.module.exports.Display.prototype);
    display.spec = spec;
    display.screen = spec.screens[1];
    display.log = { info() {} };
    display._startGpu();
    assert.equal(requested, true);
});

test('Renderer placement fits multiple ID7 screen sizes and a supplied area', t => {
    const { display } = realDisplay(t);
    for (const [w, h] of [[1920, 720], [1440, 540], [1280, 480]]) {
        display.gpu.screen = { w, h };
        display.gpu.area = { x: 40, y: 60, w: w - 40, h: h - 60 };
        display._place();
        assert.equal(display.own(), true);
        const pl = display.place;
        assert.ok(pl.ox >= 40 && pl.oy >= 60);
        assert.ok(pl.ox + pl.scale * 1600 <= w + 0.01);
        assert.ok(pl.oy + pl.scale * (520 + pl.extra) <= h + 0.01);
    }
});

test('Background sends nonzero engine PCM through the real output protocol and stops on mute', { timeout: 4000 }, async t => {
    const net = require('node:net');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luxo-stream-'));
    const settings = settingsAt(dir);
    settings.set('enabled', true);
    settings.set('autoMode', false);
    const sockets = new Set();
    const blocks = [];
    const server = net.createServer(socket => {
        sockets.add(socket);
        let hello = Buffer.alloc(0);
        let ready = false;
        socket.on('error', () => {});
        socket.on('close', () => sockets.delete(socket));
        socket.on('data', chunk => {
            if (ready) blocks.push(chunk);
            else {
                hello = Buffer.concat([hello, chunk]);
                if (hello.includes(10)) {
                    assert.equal(hello.toString(), 'LUXO/1 S16LE 48000\n');
                    ready = true;
                    socket.write('READY 2\n');
                }
            }
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const app = new EventEmitter();
    const background = implementation().background({ app, settings, log: { warn() {} } });
    background.output.endpoint = { trusted: () => true, open: () => net.createConnection(server.address().port, '127.0.0.1') };
    t.after(() => {
        app.emit('shutdown');
        sockets.forEach(socket => socket.destroy());
        server.close();
        fs.rmSync(dir, { recursive: true });
    });
    background.vehicle.watchGroups()['de.bmw.infotainment.vehicle.CDS'].statusEngineSpeed2.decode({ actualValueRPMEngineCrankshaft: 3200 });
    const deadline = Date.now() + 2000;
    while (!blocks.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(Buffer.concat(blocks).some(byte => byte !== 0), 'Nonzero PCM must reach the output sink');
    settings.set('enabled', false);
    await new Promise(resolve => setTimeout(resolve, 60));
    const count = blocks.length;
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(blocks.length, count);
});
