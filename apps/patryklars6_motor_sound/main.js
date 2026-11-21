'use strict';

const path = require('path');
const mgu = require('./kit/mgu');
const themes = require('./kit/themes');
const { Telemetry } = require('./telemetry');
const { connectVehicle } = require('./vehicle');
const { resolveSettings, Synth, profileSetting } = require('./sound');
const { PcmOutput } = require('./output');
const { NativeMenu } = require('./native-menu');
const { AudioDiagnostics } = require('./audio-diagnostics');
const { navigation, drawDiagnostics } = require('./navigation');
const { WIDTH, HEIGHT, PROFILE_CARDS, smoothGauge, audioStatus, drawLive, drawProfiles } = require('./view');

const { drawHome, drawInfo } = require('./home');
const { drawSettings } = require('./settings-view');
const { EFFECTS, channelStatus, drawTuning } = require('./tuning-view');
const { THEMES, kitTheme } = require('./themes');

const clock = () => process.uptime() * 1000;
for (const id of Object.keys(THEMES)) {
    themes.THEMES[id] = Object.assign({}, themes.theme('ice'), kitTheme(THEMES[id]));
}

mgu.run({
    background({ app, settings, log, spec, dataDir }) {
        const vehicle = new Telemetry(clock);
        const output = new PcmOutput(clock);
        const synth = new Synth();
        const engine = { blocks: 0, frames: 0, active: false, lastPeak: 0 };
        const diagnostics = new AudioDiagnostics({ vehicle, output, settings, spec, dataDir, engine, effective: mode => effective(mode) });
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
            if (diagnostics.testing) { engine.active = false; return; }
            const data = vehicle.snapshot();
            const cfg = effective(data.mode);
            const active = cfg.enabled && cfg.profileId && cfg.gain > 0 && data.engine === 'running' && data.rpm !== null && data.rpm >= 400;
            if (!active) {
                engine.active = false;
                if (output.channels) output.close();
                output.tick(false);
                synth.reset();
                return;
            }
            output.tick();
            if (output.channels) {
                const pcm = synth.render(data, cfg, output.channels);
                let peak = 0;
                for (let at = 0; at < pcm.length; at += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(at)));
                engine.lastPeak = peak;
                output.write(pcm);
                engine.blocks++; engine.frames += 960; engine.active = true;
            }
            else { engine.active = false; synth.reset(); }
        }, 20);
        app.once('shutdown', () => {
            clearInterval(timer);
            output.close();
            diagnostics.cancelTest();
            clearTimeout(diagnosticStart);
            stopVehicle();
        });
        const diagnosticStart = setTimeout(() => diagnostics.refresh().catch(error => log.warn(error.message)), 2000);
        return { vehicle, output, effective, diagnostics };
    },


    start(ctx) {
        if (!ctx.background) return;
        const { vehicle, output, effective } = ctx.background;
        const diagnostics = ctx.background.diagnostics || new AudioDiagnostics({ vehicle, output, effective, settings: ctx.settings, spec: ctx.spec, dataDir: ctx.dataDir });
        const { ui, settings } = ctx;
        let screen = 'MAIN';
        let sliders = [];
        let group = 'Motorsound';
        let row = 0;
        let choice = 0;
        let tuneProfile = 'individual';
        let tuneEffect = 0;
        let effectSettings = null;
        let refreshTuning = () => {};
        let refreshSettings = () => {};
        let refreshProfiles = () => {};
        const pages = { home: 'MAIN', live: 'LIVE', profiles: 'PROFILES', info: 'INFO', audio: 'DIAG' };
        const groups = { modes: 'Fahrmodi', speakers: 'Lautsprecher', design: 'Oberfläche' };
        const categories = [...new Set(settings.schema.filter(item => !item.hidden).map(item => item.group))];

        const viewTicks = {};
        let physicalTick;
        let nativeMenu;
        let nativeVisible = false;
        let opening = null;
        const history = [];
        const capture = () => ({ screen, group, row, choice, tuneProfile, tuneEffect, effectSettings });
        function back() {
            if (screen === 'DIAG' && diagnostics.backSub()) return;
            diagnostics.cancelTest();
            const previous = history.pop();
            if (!previous) return screen === 'MAIN' ? openNative() : home();
            ({ screen, group, row, choice, tuneProfile, tuneEffect, effectSettings } = previous);
            return show(screen);
        }
        function home() {
            history.length = 0; diagnostics.cancelTest(); return show('MAIN');
        }

        function graphicsReady() {
            return !!(ctx.display && !ctx.display.blocked && ctx.display.ownable() && ctx.display.gpu.native && ctx.display.gpu.touch);
        }

        function graphicsStatus() {
            if (graphicsReady()) {
                return ctx.display.gpu.info && ctx.display.gpu.info.controller ? 'Touch und Controller verfügbar' : 'Touch verfügbar · Controller über BMW-Menü';
            }
            return 'BMW-Menü aktiv · mgu-render/1 mit Touch erforderlich';
        }

        function openNative() {
            if (opening) return opening;
            diagnostics.cancelTest();
            nativeVisible = true;
            opening = Promise.resolve(ui.close('MAIN')).then(() => {
                if (nativeMenu) return nativeMenu.render();
            }).then(() => {
                if (!ui.isVisible('NATIVE')) return ui.open('NATIVE');
            }).then(() => { opening = null; }, error => { opening = null; throw error; });
            return opening;
        }

        function show(to) {
            screen = to;
            Object.keys(last).forEach(key => { last[key] = null; });
            if (!graphicsReady()) return openNative();
            nativeVisible = false;
            if (physicalTick) physicalTick.kick();
            return ui.isVisible('MAIN') ? Promise.resolve() : ui.open('MAIN');
        }
        function go(to, configure) {
            const previous = capture();
            if (configure) configure();
            if (to !== previous.screen || configure) history.push(previous);
            if (to === 'DIAG') { diagnostics.page = 'root'; diagnostics.offset = 0; void diagnostics.refresh(); }
            return show(to);
        }

        function loop(name, fps, fn) {
            viewTicks[name] = fn;
            return { kick() { if (screen === name && physicalTick) physicalTick.kick(); } };
        }

        function chooseGroup(value) {
            group = value;
            effectSettings = null;
            row = 0;
            refreshSettings();
        }

        function offered(groupName, profile, effectId) {
            const effect = effectId ? EFFECTS.find(item => item.id === effectId) : groupName ? null : effectSettings;
            const selectedProfile = profile || tuneProfile;
            return settings.schema.filter(item => item.group === (groupName || group) && settings.shown(item)
                && (!effect || effect.settings.some(key => profileSetting(selectedProfile, key) === item.key))
                && (output.channels === 5 || !item.key.endsWith('_engineCenter')));
        }

        function moveRow() {
            const count = offered().length;
            row = count ? (row + 1) % count : 0;
            refreshSettings();
        }

        function changeRow(index, step) {
            const item = offered()[index];
            if (!item) return;
            row = index;
            if (item.type === 'bool') {
                settings.set(item.key, settings.get(item.key) !== true);
                return;
            }
            const list = item.type === 'choice' ? item.options.map(option => option[0]) : item.steps;
            const position = list.indexOf(setting(item.key));
            const next = item.type === 'choice' ? (position + step + list.length) % list.length
                : Math.max(0, Math.min(list.length - 1, position + step));
            settings.set(item.key, list[next]);
        }

        function goSettings(value) {
            return go('CONFIG', () => chooseGroup(value || 'Motorsound'));
        }

        function moveProfile(step) {
            choice = (choice + step + PROFILE_CARDS.length) % PROFILE_CARDS.length;
            refreshProfiles();
        }

        function openTuning(profile) {
            return go('TUNING', () => {
            tuneProfile = editing(profile);
            tuneEffect = 0;
            refreshTuning();
            });
        }

        function openEffect(index) {
            return go('CONFIG', () => {
            tuneEffect = index;
            const card = PROFILE_CARDS.find(item => item.id === tuneProfile);
            chooseGroup(card.name);
            effectSettings = EFFECTS[index];
            });
        }

        function toggleEffect(index) {
            const key = profileSetting(tuneProfile, EFFECTS[index].id + 'On');
            settings.set(key, setting(key) !== true);
        }

        function editing(profile) {
            if (PROFILE_CARDS.some(card => card.id === profile)) return profile;
            const manual = settings.get('manualProfile');
            return PROFILE_CARDS.some(card => card.id === manual) ? manual : 'v8';
        }

        function currentProfile() {
            return editing(effective(vehicle.snapshot().mode).profileId);
        }

        function setting(key) {
            const value = settings.get(key);
            const definition = settings.item(key);
            return value === undefined && definition ? definition.default : value;
        }

        function level(key) {
            const value = setting(key);
            return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : 0;
        }

        function applyLevel(layer, value) {
            settings.set(profileSetting(currentProfile(), layer), Math.max(0, Math.min(100, value)));
        }

        const actions = {
            toggle: () => settings.set('enabled', settings.get('enabled') !== true),
            auto: () => settings.set('autoMode', settings.get('autoMode') === false),
            power: () => actions.toggle(),
            nav(key) {
                if (key === 'native') return openNative();
                if (key === 'home') return home();
                if (key === 'individual') return openTuning('individual');
                return pages[key] ? go(pages[key]) : goSettings(groups[key]);
            },
            tune: profile => openTuning(profile || currentProfile()),
            select(profile) {
                if (settings.get('manualProfile') !== profile) settings.set('manualProfile', profile);
                if (settings.get('autoMode') !== false) settings.set('autoMode', false);
            },
            adjust(layer, offset) {
                const old = level(profileSetting(currentProfile(), layer));
                const step = offset > 0 ? Math.floor(old / 10) + 1 : Math.ceil(old / 10) - 1;
                applyLevel(layer, step * 10);
            },
            flip(layer) {
                const key = profileSetting(currentProfile(), layer + 'On');
                settings.set(key, setting(key) !== true);
            },
            reset(requestedProfile) {
                const profile = editing(requestedProfile || currentProfile());
                const card = PROFILE_CARDS.find(row => row.id === profile);
                settings.schema.filter(row => row.group === card.name).forEach(row => {
                    if (settings.get(row.key) !== row.default) settings.set(row.key, row.default);
                });
            }
        };

        ui.onClick('BTN_BMW_MENU', openNative);
        ui.onClick('BTN_BACK', back);
        ui.onClick('BTN_HOME', home);
        ui.onClick('BTN_AUDIO', () => go('DIAG'));
        if (ctx.display) ctx.display.onBack = back;
        ui.onClick('BTN_MUTE', () => settings.set('enabled', false));

        const last = Object.create(null);
        nativeMenu = new NativeMenu(ui, settings, ctx.background, {
            select: actions.select, reset: actions.reset, offered,
            diagnostics, graphicsStatus, canGraphics: graphicsReady, graphics: home
        });
        function paint(name, key, draw) {
            if (last[name] === key) return;
            const canvas = draw(ctx.canvas(WIDTH, HEIGHT));
            if (name !== 'MAIN') navigation(canvas, ({ LIVE: 'Live-Fahrzeugdaten', PROFILES: 'Soundprofile',
                TUNING: 'Sound-Tuning', CONFIG: group, INFO: 'Hilfe und Anleitung', DIAG: 'Audio-Diagnose' })[name], settings.get('theme'),
                { back, home, native: openNative });
            return Promise.resolve(ui.image('MAIN_GFX', canvas)).then(() => {
                last[name] = key;
            });
        }

        const homeTick = loop('MAIN', 8, () => {
            const data = vehicle.snapshot();
            const cfg = effective(data.mode);
            const profile = editing(cfg.profileId);
            const effects = {};
            for (const layer of ['turbo', 'exhaust', 'bang']) {
                effects[layer] = { level: level(profileSetting(profile, layer)), on: setting(profileSetting(profile, layer + 'On')) === true };
            }
            const status = cfg.enabled ? audioStatus(cfg, data, output)
                : 'Pegel ' + Math.round(cfg.level * 100) + ' %  ·  Grenze ' + Math.round(cfg.limit * 100) + ' %';
            const values = { enabled: cfg.enabled, status, auto: cfg.auto, selected: profile, theme: settings.get('theme'),
                label: PROFILE_CARDS.find(card => card.id === profile).name, effects };
            const key = JSON.stringify([values, data.mode]);
            return paint('MAIN', key, cv => { sliders = drawHome(cv, data, values, actions); return cv; });
        });
        ctx.onTap((x, y) => {
            if (screen !== 'MAIN') return;
            const row = sliders.find(r => y >= r.top && y < r.bottom && x >= r.start && x <= r.stop);
            if (row) applyLevel(row.name, 10 * Math.round((x - row.start) * 10 / (row.stop - row.start)));
        });

        let at = clock();
        let needle = null;
        const liveTick = loop('LIVE', 12, () => {
            const data = vehicle.snapshot();
            const cfg = effective(data.mode);
            const now = clock();
            needle = smoothGauge(needle, data.rpm, now - at);
            at = now;
            const theme = settings.get('theme');
            const showAcceleration = settings.get('dashboardAccel');
            const key = JSON.stringify([theme, showAcceleration,
                data.rpm === null ? null : Math.round(data.rpm), data.speed === null ? null : Math.round(data.speed),
                data.acceleration === null ? null : Math.round(data.acceleration * 10),
                data.engine, data.stage, data.gear, data.mode, data.idle, output.state, output.channels,
                cfg.profileLabel, cfg.speaker.label, cfg.enabled, cfg.level, cfg.limit,
                needle === null ? null : Math.round(needle)
            ]);
            return paint('LIVE', key, cv => { drawLive(cv, data, cfg, output, needle, actions, theme, showAcceleration); return cv; });
        });
        const profileTick = loop('PROFILES', 6, () => {
            const cfg = effective(vehicle.snapshot().mode);
            const theme = settings.get('theme');
            return paint('PROFILES', [cfg.profileId, cfg.auto, theme, choice].join('/'), cv => {
                drawProfiles(cv, cfg, actions, theme, PROFILE_CARDS[choice].id);
                return cv;
            });
        });
        const infoTick = loop('INFO', 2, () =>
            paint('INFO', ctx.spec.version + settings.get('theme'), cv => {
                drawInfo(cv, actions.nav, ctx.spec.version, settings.get('theme'));
                return cv;
            }));
        loop('DIAG', 6, () => { diagnostics.maybeRefresh(); return paint('DIAG', diagnostics.version + '/' + diagnostics.offset + '/' + diagnostics.page + '/' + settings.get('theme'), cv => {
            drawDiagnostics(cv, diagnostics, settings.get('theme')); return cv;
        }); });
        const configTick = loop('CONFIG', 6, () => {
            const rows = offered().map(item => ({
                key: item.key, label: item.label,
                value: item.type === 'bool' ? settings.get(item.key) ? 'Ein' : 'Aus' : settings.display(item.key)
            }));
            row = Math.max(0, Math.min(rows.length - 1, row));
            const page = { groups: categories, group, index: row, rows, theme: settings.get('theme'),
                title: effectSettings ? group + ' · ' + effectSettings.name : group,
                status: group === 'Lautsprecher' || effectSettings ? channelStatus(output.channels) : null };
            return paint('CONFIG', JSON.stringify(page), cv => {
                drawSettings(cv, page, { group: chooseGroup, change: changeRow, page(delta) {
                    row = Math.max(0, Math.min(rows.length - 1, row + delta));
                    refreshSettings();
                } });
                return cv;
            });
        });
        const tuningTick = loop('TUNING', 6, () => {
            const model = {
                theme: settings.get('theme'), channels: output.channels, focus: tuneEffect,
                label: PROFILE_CARDS.find(card => card.id === tuneProfile).name,
                effects: EFFECTS.map(effect => ({
                    level: level(profileSetting(tuneProfile, effect.id)),
                    on: setting(profileSetting(tuneProfile, effect.id + 'On')) === true
                }))
            };
            return paint('TUNING', JSON.stringify(model), cv => {
                drawTuning(cv, model, { open: openEffect, flip: toggleEffect });
                return cv;
            });
        });
        refreshTuning = () => tuningTick.kick();
        refreshSettings = () => configTick.kick();
        refreshProfiles = () => profileTick.kick();
        physicalTick = ctx.loop('MAIN', 60, () => {
            if (!graphicsReady()) return openNative();
            const tick = viewTicks[screen] || viewTicks.MAIN;
            return tick();
        });
        const nativeTimer = setInterval(() => {
            if (nativeVisible && ui.isVisible('NATIVE')) nativeMenu.render().catch(error => ctx.log.warn('BMW-Menü: ' + error.message));
        }, 500);
        ctx.app.once('shutdown', () => clearInterval(nativeTimer));
        ctx.onLayout(() => {
            Object.keys(last).forEach(name => { last[name] = null; });
            if (!graphicsReady() && ui.isVisible('MAIN')) void openNative();
        });
        ui.onVisible((name, visible) => {
            if (name === 'MAIN' && !visible) diagnostics.cancelTest();
            if (name === 'NATIVE') {
                const hardwareBack = visible && !nativeVisible && screen !== 'MAIN' && graphicsReady();
                if (hardwareBack) { void back(); return; }
                nativeVisible = visible;
                if (visible) nativeMenu.render().catch(error => ctx.log.warn('BMW-Menü: ' + error.message));
            }
        });
        ctx.app.once('shutdown', () => diagnostics.cancelTest());
        settings.onChange(() => {
            Object.keys(last).forEach(name => { last[name] = null; });
            if (physicalTick) physicalTick.kick();
            if (nativeVisible) nativeMenu.render().catch(error => ctx.log.warn('BMW-Menü: ' + error.message));
        });
        return nativeMenu.render();
    }
}).catch(error => mgu.log.error('LUXO-Start: ' + (error && error.stack || error)));
