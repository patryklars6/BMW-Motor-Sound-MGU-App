'use strict';

const path = require('path');
const mgu = require('./kit/mgu');
const themes = require('./kit/themes');
const { Telemetry } = require('./telemetry');
const { connectVehicle } = require('./vehicle');
const { resolveSettings, Synth, profileSetting } = require('./sound');
const { PcmOutput } = require('./output');
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
        const pages = { home: 'MAIN', live: 'LIVE', profiles: 'PROFILES', info: 'INFO' };
        const groups = { modes: 'Fahrmodi', speakers: 'Lautsprecher', design: 'Oberfläche' };
        const categories = [...new Set(settings.schema.filter(item => !item.hidden).map(item => item.group))];

        function go(to) {
            if (screen === to) return;
            const before = screen;
            screen = to;
            if (before === 'MAIN') return ui.open(to);
            return ui.close(before).then(() => to === 'MAIN' ? undefined : ui.open(to));
        }

        function chooseGroup(value) {
            group = value;
            effectSettings = null;
            row = 0;
            refreshSettings();
        }

        function offered() {
            return settings.schema.filter(item => item.group === group && settings.shown(item)
                && (!effectSettings || effectSettings.settings.some(key => profileSetting(tuneProfile, key) === item.key))
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
            chooseGroup(value || 'Motorsound');
            return go('CONFIG');
        }

        function moveProfile(step) {
            choice = (choice + step + PROFILE_CARDS.length) % PROFILE_CARDS.length;
            refreshProfiles();
        }

        function openTuning(profile) {
            tuneProfile = profile;
            tuneEffect = 0;
            refreshTuning();
            return go('TUNING');
        }

        function openEffect(index) {
            tuneEffect = index;
            const card = PROFILE_CARDS.find(item => item.id === tuneProfile);
            chooseGroup(card.name);
            effectSettings = EFFECTS[index];
            return go('CONFIG');
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
            reset() {
                const profile = currentProfile();
                const card = PROFILE_CARDS.find(row => row.id === profile);
                settings.schema.filter(row => row.group === card.name).forEach(row => {
                    if (settings.get(row.key) !== row.default) settings.set(row.key, row.default);
                });
            }
        };

        const buttons = {
            BTN_POWER: actions.power,
            BTN_LIVE_POWER: actions.power,
            BTN_AUTO: actions.auto,
            BTN_OPEN_PROFILES: () => {
                choice = PROFILE_CARDS.findIndex(card => card.id === currentProfile());
                return go('PROFILES');
            },
            BTN_CONFIG: () => goSettings(),
            BTN_CONFIG_GROUP: () => chooseGroup(categories[(categories.indexOf(group) + 1) % categories.length]),
            BTN_CONFIG_ROW: moveRow,
            BTN_CONFIG_UP: () => changeRow(row, 1),
            BTN_CONFIG_DOWN: () => changeRow(row, -1),
            BTN_CONFIG_HOME: () => go(effectSettings ? 'TUNING' : 'MAIN'),
            BTN_PROFILE_PREV: () => moveProfile(-1),
            BTN_PROFILE_NEXT: () => moveProfile(1),
            BTN_PROFILE_USE: () => actions.select(PROFILE_CARDS[choice].id),
            BTN_PROFILE_TUNE: () => openTuning(PROFILE_CARDS[choice].id),
            BTN_TUNE_PROFILE: () => {
                const index = PROFILE_CARDS.findIndex(card => card.id === tuneProfile);
                tuneProfile = PROFILE_CARDS[(index + 1) % PROFILE_CARDS.length].id;
                refreshTuning();
            },
            BTN_TUNE_EFFECT: () => { tuneEffect = (tuneEffect + 1) % EFFECTS.length; refreshTuning(); },
            BTN_TUNE_OPEN: () => openEffect(tuneEffect),
            BTN_TUNE_SWITCH: () => toggleEffect(tuneEffect),
            BTN_TUNE_HOME: () => go('MAIN'),
            BTN_OPEN_LIVE: () => go('LIVE'),
            BTN_OPEN_INFO: () => go('INFO'),
            BTN_LIVE_HOME: () => go('MAIN'),
            BTN_PROFILES_HOME: () => go('MAIN'),
            BTN_INFO_HOME: () => go('MAIN'),
            BTN_RESET: actions.reset
        };
        Object.keys(buttons).forEach(id => ui.onClick(id, buttons[id]));
        ['BTN_POWER', 'BTN_LIVE_POWER', 'BTN_AUTO', 'BTN_RESET', 'BTN_OPEN_PROFILES', 'BTN_OPEN_LIVE', 'BTN_OPEN_INFO',
            'BTN_CONFIG', 'BTN_PROFILE_PREV', 'BTN_PROFILE_NEXT', 'BTN_PROFILE_USE', 'BTN_CONFIG_GROUP', 'BTN_CONFIG_UP',
            'BTN_CONFIG_DOWN', 'BTN_CONFIG_ROW'].forEach(id => ctx.hideButton(id));

        function labelNativeButtons() {
            const power = settings.get('enabled') ? 'Sound aus' : 'Sound ein';
            void ui.text('BTN_POWER', power);
            void ui.text('BTN_LIVE_POWER', power);
            void ui.text('BTN_AUTO', settings.get('autoMode') === false ? 'Automatik ein' : 'Automatik aus');
        }
        labelNativeButtons();

        const last = Object.create(null);
        function paint(name, key, draw) {
            if (last[name] === key) return;
            return Promise.resolve(ui.image(name + '_GFX', draw(ctx.canvas(WIDTH, HEIGHT)))).then(() => {
                last[name] = key;
            });
        }

        const homeTick = ctx.loop('MAIN', 8, () => {
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
        const liveTick = ctx.loop('LIVE', 12, () => {
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
        const profileTick = ctx.loop('PROFILES', 6, () => {
            const cfg = effective(vehicle.snapshot().mode);
            const theme = settings.get('theme');
            return paint('PROFILES', [cfg.profileId, cfg.auto, theme, choice].join('/'), cv => {
                drawProfiles(cv, cfg, actions, theme, PROFILE_CARDS[choice].id);
                return cv;
            });
        });
        const infoTick = ctx.loop('INFO', 2, () =>
            paint('INFO', ctx.spec.version + settings.get('theme'), cv => {
                drawInfo(cv, actions.nav, ctx.spec.version, settings.get('theme'));
                return cv;
            }));
        const configTick = ctx.loop('CONFIG', 6, () => {
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
        const tuningTick = ctx.loop('TUNING', 6, () => {
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
        ctx.onLayout(() => { Object.keys(last).forEach(name => { last[name] = null; }); });
        ui.onVisible((name, visible) => {
            if (!visible && screen === name) screen = 'MAIN';
            if (!visible) last[name] = null;
        });
        settings.onChange(key => {
            if (key === 'enabled' || key === 'autoMode') labelNativeButtons();
            homeTick.kick();
            liveTick.kick();
            profileTick.kick();
            infoTick.kick();
            configTick.kick();
            tuningTick.kick();
        });
    }
}).catch(() => {});
