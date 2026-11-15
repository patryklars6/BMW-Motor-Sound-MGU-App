'use strict';

const path = require('path');
const mgu = require('./kit/mgu');
const { Telemetry } = require('./telemetry');
const { connectVehicle } = require('./vehicle');
const { MODES, resolveSettings, Synth } = require('./sound');
const { PcmOutput } = require('./output');

const WIDTH = 1600;
const HEIGHT = 520;
const PALETTE = { bg: '#1b1a20', panel: '#27262e', text: '#f7f6fa', sub: '#bcb7c7', violet: '#ba9dec', line: '#36333f' };
const ENGINE_LABEL = { off: 'Aus', starting: 'Startet', running: 'Läuft' };
const clock = () => process.uptime() * 1000;

function audioLabel(prefs, data, output) {
    if (!prefs.enabled) return 'Motorsound aus';
    if (!prefs.profileId) return 'Wartet auf Fahrmodus';
    if (data.engine === null || data.rpm === null) return 'Wartet auf Fahrzeugdaten';
    if (data.engine !== 'running' || data.rpm < 400) return 'Motor steht';
    if (prefs.gain === 0) return 'Motorsound stumm';
    if (output.state === 'connecting') return 'Verbindet Audiopfad';
    if (output.channels === 2) return 'Audio verbunden · Stereo';
    if (output.channels === 4) return 'Audio verbunden · 4 Kanäle';
    return 'Kein freigegebener Audiopfad';
}

function draw(cv, data, prefs, output) {
    const c = PALETTE;
    const unknown = '–';
    const rpm = data.rpm === null ? unknown : String(Math.round(data.rpm));
    const mode = data.mode === null ? unknown : MODES[data.mode].label;
    const gear = data.gear !== null ? [data.stage, data.gear].filter(v => v !== null).join(' ') : data.stage || unknown;
    const state = ENGINE_LABEL[data.engine] || unknown;
    const speed = data.speed === null ? unknown : Math.round(data.speed) + ' km/h';
    const idle = data.idle === null ? unknown : data.idle ? 'Ja' : 'Nein';

    cv.fillRect(0, 0, WIDTH, HEIGHT + (cv.extra || 0), c.bg);
    cv.fillRect(44, 39, 6, 56, c.violet);
    cv.text('LUXO Motor Sound', 69, 80, 43, c.text, { font: 'bold' });
    cv.text(audioLabel(prefs, data, output), 1555, 79, 26, c.violet, { align: 'right' });
    cv.roundRect(44, 118, 968, 278, 18, c.panel);
    cv.roundRect(1032, 118, 524, 278, 18, c.panel);
    cv.text('DREHZAHL', 77, 166, 22, c.sub, { font: 'bold', spacing: 2 });
    cv.text(rpm, 78, 300, 112, c.text, { font: 'num' });
    cv.text('U/min', 435, 298, 28, c.sub);
    cv.roundRect(78, 339, 895, 10, 5, c.line);
    const meter = data.rpm === null ? 0 : Math.min(1, data.rpm / 6500);
    if (meter > 0) cv.roundRect(78, 339, Math.max(10, 895 * meter), 10, 5, c.violet);

    const values = [['Fahrmodus', mode], ['Motor', state], ['Gang', gear], ['Motorleerlauf', idle], ['Geschwindigkeit', speed]];
    values.forEach((value, i) => {
        const y = 169 + 46 * i;
        cv.text(value[0], 1070, y, 25, c.sub);
        cv.text(value[1], 1519, y, 25, c.text, { align: 'right', font: 'bold' });
    });
    cv.fillRect(44, 422, 1512, 1, c.line);
    cv.text('Klangprofil', 46, 454, 22, c.sub);
    cv.text(prefs.profileLabel || unknown, 46, 492, 28, c.text, { font: 'bold' });
    cv.text('Lautsprechersystem', 544, 454, 22, c.sub);
    cv.text(prefs.speaker.label, 544, 492, 28, c.text, { font: 'bold' });
    cv.text('Pegel / Grenze', 1064, 454, 22, c.sub);
    cv.text(Math.round(prefs.ceiling * 100) + ' %', 1064, 492, 28, c.text, { font: 'bold' });
}

mgu.run({
    background({ app, settings, log }) {
        const vehicle = new Telemetry(clock);
        const output = new PcmOutput(clock);
        const synth = new Synth();
        const get = key => settings.get(key);
        let stopVehicle = () => {};
        try {
            stopVehicle = connectVehicle(vehicle, log, require('someip'), path.resolve(__dirname, '..', '..', 'someipInterfaces'));
        } catch (e) {
            log.warn('Die native SOME/IP-Bindung ist nicht verfügbar.');
        }
        let currentMode;
        let prefs;
        settings.onChange(() => { prefs = null; });
        function effective(mode) {
            if (!prefs || currentMode !== mode) {
                currentMode = mode;
                prefs = resolveSettings(get, mode);
            }
            return prefs;
        }
        const timer = setInterval(() => {
            const data = vehicle.snapshot();
            const cfg = effective(data.mode);
            const active = cfg.enabled && cfg.profileId && cfg.gain > 0 && data.engine === 'running' && data.rpm !== null && data.rpm >= 400;
            if (!active) {
                if (output.socket) output.close();
                synth.reset();
                return;
            }
            output.tick();
            if (output.channels) output.write(synth.render(data, cfg, output.channels));
            else synth.reset();
        }, 20);
        app.once('shutdown', () => {
            clearInterval(timer);
            output.close();
            stopVehicle();
        });
        return { vehicle, output, effective };
    },

    start(ctx) {
        if (!ctx.background) return;
        const { vehicle, output, effective } = ctx.background;
        let previous = null;
        ctx.onLayout(() => { previous = null; });
        ctx.loop('MAIN', 5, async () => {
            const data = vehicle.snapshot();
            const cfg = effective(data.mode);
            const key = JSON.stringify([
                data.rpm === null ? null : Math.round(data.rpm), data.speed === null ? null : Math.round(data.speed),
                data.engine, data.stage, data.gear, data.mode, data.idle, output.state, output.channels,
                cfg.profileLabel, cfg.speaker.label, cfg.enabled, cfg.ceiling
            ]);
            if (key === previous) return;
            const cv = ctx.canvas(WIDTH, HEIGHT);
            draw(cv, data, cfg, output);
            await ctx.ui.image('MAIN_GFX', cv);
            previous = key;
        });
    }
}).catch(() => {});
