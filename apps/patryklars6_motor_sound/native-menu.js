'use strict';

const { PROFILE_CARDS } = require('./view');
const { EFFECTS, channelStatus } = require('./tuning-view');
const { MODES } = require('./sound');

const PAGE_SIZE = 8;

class NativeMenu {
    constructor(ui, settings, background, callbacks) {
        this.ui = ui;
        this.settings = settings;
        this.background = background;
        this.callbacks = callbacks;
        this.stack = [];
        this.page = { kind: 'root', offset: 0 };
        this.last = null;
        this.actions = [];
        this.rendering = false;
        this.pending = false;
        for (let index = 0; index < PAGE_SIZE; index++) {
            ui.onClick('NATIVE_ROW_' + index, () => this.choose(index));
        }
        ui.onClick('NATIVE_BACK', () => this.back());
        ui.onClick('NATIVE_PREV', () => this.turn(-1));
        ui.onClick('NATIVE_NEXT', () => this.turn(1));
    }

    open(page) {
        this.stack.push(Object.assign({}, this.page));
        this.page = Object.assign({ offset: 0 }, page);
        return this.render();
    }

    back() {
        this.page = this.stack.pop() || { kind: 'root', offset: 0 };
        return this.render();
    }

    turn(direction) {
        const count = this.rows().length;
        const max = Math.max(0, Math.floor((count - 1) / PAGE_SIZE) * PAGE_SIZE);
        this.page.offset = Math.max(0, Math.min(max, this.page.offset + direction * PAGE_SIZE));
        return this.render();
    }

    choose(index) {
        const action = this.actions[index];
        if (action) return Promise.resolve(action()).then(() => this.render());
    }

    rows() {
        const s = this.settings;
        const data = this.background.vehicle.snapshot();
        const cfg = this.background.effective(data.mode);
        const out = this.background.output;
        const row = (label, value, action) => ({ label, value: value || '', action });
        const group = name => this.open({ kind: 'settings', group: name });
        if (this.page.kind === 'root') {
            return [
                row('Motorsound', cfg.enabled ? 'Ein · zum Stummschalten drücken' : 'Aus · zum Einschalten drücken', () => s.set('enabled', !cfg.enabled)),
                row('LUXO-Oberfläche', this.callbacks.graphicsStatus(), this.callbacks.canGraphics() ? () => this.callbacks.graphics() : null),
                row('Soundprofile', cfg.profileLabel || 'Automatik wartet auf Fahrmodus', () => this.open({ kind: 'profiles' })),
                row('Sound-Tuning', 'Motor, Turbo, Auspuff, Pop & Bangs', () => this.open({ kind: 'tuningProfiles' })),
                row('Lautstärke und Audio', out.detail || 'Audiopfad prüfen', () => this.open({ kind: 'audio' })),
                row('Live-Fahrzeugdaten', 'Empfangene Werte anzeigen', () => this.open({ kind: 'live' })),
                row('Lautsprecher', cfg.speaker.label, () => group('Lautsprecher')),
                row('Fahrmodi', s.get('autoMode') ? 'Automatik ein' : 'Manuell', () => group('Fahrmodi')),
                row('Design und Darstellung', s.display('theme'), () => group('Oberfläche')),
                row('Alle Einstellungen', 'Gespeicherte Einstellungen', () => this.open({ kind: 'groups' })),
                row('Hilfe', 'Bedienung und Audiovoraussetzungen', () => this.open({ kind: 'help' }))
            ];
        }
        if (this.page.kind === 'profiles' || this.page.kind === 'tuningProfiles') {
            return PROFILE_CARDS.map(profile => row(profile.name,
                this.page.kind === 'profiles' ? cfg.profileId === profile.id ? 'Ausgewählt' : 'Manuell auswählen' : 'Einstellungen bearbeiten', () => {
                    if (this.page.kind === 'profiles') this.callbacks.select(profile.id);
                    else return this.open({ kind: 'effects', profile: profile.id });
                }));
        }
        if (this.page.kind === 'effects') {
            const profile = PROFILE_CARDS.find(item => item.id === this.page.profile);
            return EFFECTS.map(effect => row(effect.name, profile.name, () => this.open({
                kind: 'settings', group: profile.name, profile: profile.id, effect: effect.id
            }))).concat([
                row('Alle Profilwerte', profile.name, () => group(profile.name)),
                row('Profil zurücksetzen', profile.name + ' auf Standard setzen', () => this.open({ kind: 'reset', profile: profile.id }))
            ]);
        }
        if (this.page.kind === 'reset') return [row('Zurücksetzen bestätigen', 'Nur ' + this.page.profile,
            () => { this.callbacks.reset(this.page.profile); return this.back(); })];
        if (this.page.kind === 'groups') {
            const groups = Array.from(new Set(s.schema.filter(item => !item.hidden).map(item => item.group)));
            return groups.map(name => row(name, 'Öffnen', () => group(name)));
        }
        if (this.page.kind === 'settings') {
            const items = this.callbacks.offered(this.page.group, this.page.profile, this.page.effect);
            return items.map(item => row(item.label,
                item.type === 'bool' ? s.get(item.key) ? 'Ein' : 'Aus' : s.display(item.key), () => {
                    if (item.type === 'bool') s.set(item.key, s.get(item.key) !== true);
                    else return this.open({ kind: 'values', key: item.key });
                }));
        }
        if (this.page.kind === 'values') {
            const item = s.item(this.page.key);
            const options = item.type === 'choice' ? item.options : item.steps.map(value => [value, s.numberText(item, value)]);
            return options.map(option => row(String(option[1]), option[0] === s.get(item.key) ? 'Ausgewählt' : '', () => {
                s.set(item.key, option[0]);
                return this.back();
            }));
        }
        if (this.page.kind === 'audio') {
            return [row('Audioausgabe', out.detail || 'Wird geprüft'), row('Kanäle', channelStatus(out.channels)),
                row('App-Pegel', s.display('level'), () => this.open({ kind: 'values', key: 'level' })),
                row('Pegelgrenze', s.display('limit'), () => this.open({ kind: 'values', key: 'limit' })),
                row('Audio erneut prüfen', 'Verbindung zum Audio-Dienst testen', () => out.retry()),
                row('Parallele Musik', 'Benötigt bestätigten ALSA-Mischpfad luxo_overlay'),
                row('BMW-Lautstärke', 'Unabhängigkeit hängt vom RAM- und Verstärkerpfad ab')];
        }
        if (this.page.kind === 'live') {
            const unknown = 'Nicht verfügbar';
            return [row('Drehzahl', data.rpm === null ? unknown : Math.round(data.rpm) + ' U/min'),
                row('Geschwindigkeit', data.speed === null ? unknown : Math.round(data.speed) + ' km/h'),
                row('Motor', ({ off: 'Aus', starting: 'Startet', running: 'An' })[data.engine] || unknown),
                row('Fahrmodus', data.mode === null ? unknown : MODES[data.mode].label),
                row('Gang', data.gear === null ? data.stage || unknown : [data.stage, data.gear].filter(x => x !== null).join(' ')),
                row('Leerlauf', data.idle === null ? unknown : data.idle ? 'Ja' : 'Nein'),
                row('Beschleunigung', data.acceleration === null ? unknown : data.acceleration.toFixed(1) + ' m/s²')];
        }
        return [row('Bedienung', 'Zeile mit Touch oder Controller drücken. Zurück und Weitere Seiten unten.'),
            row('LUXO-Grafik', 'Benötigt mgu-render/1 mit Touch-Routing. BMW-Menüs funktionieren auch ohne Renderer.'),
            row('Einstellungen', 'Jede Änderung wird automatisch in data/settings.json gespeichert.'),
            row('Kein Ton', out.detail || 'Audio-Dienst und Mischpfad luxo_overlay prüfen.'),
            row('Fahrzeugdaten', 'Ohne frische Drehzahl und laufenden Motor bleibt der Motorsound stumm.'),
            row('MGU-Store-Update', 'Quelle aktualisieren und Version 0.2.1 aktualisieren. App-ID bleibt gleich.')];
    }

    async render() {
        if (this.rendering) { this.pending = true; return; }
        this.rendering = true;
        try {
            do {
                this.pending = false;
                const all = this.rows();
                this.page.offset = Math.min(this.page.offset, Math.max(0, Math.floor((all.length - 1) / PAGE_SIZE) * PAGE_SIZE));
                const rows = all.slice(this.page.offset, this.page.offset + PAGE_SIZE);
                const signature = JSON.stringify([this.page, rows.map(item => [item.label, item.value])]);
                if (signature === this.last) continue;
                // Block actions until the displayed rows have been replaced.
                this.actions = [];
                await Promise.all(Array.from({ length: PAGE_SIZE }, (_, index) => {
                    const item = rows[index];
                    const writes = [
                        this.ui.cells('NATIVE_ROW_' + index, 0, { Text1stRow: item ? item.label : '', Text2ndRow: item ? item.value : '' }),
                        this.ui.visible('NATIVE_ROW_' + index, !!item)
                    ];
                    if (this.ui.enabled) writes.push(this.ui.enabled('NATIVE_ROW_' + index, !!(item && item.action)));
                    return Promise.all(writes);
                }));
                await Promise.all([
                    this.ui.cells('NATIVE_BACK', 0, { Text1stRow: 'Zurück / Hauptmenü', Text2ndRow: '' }),
                    this.ui.cells('NATIVE_PREV', 0, { Text1stRow: 'Vorherige Seite', Text2ndRow: '' }),
                    this.ui.cells('NATIVE_NEXT', 0, { Text1stRow: 'Weitere Einträge', Text2ndRow: '' }),
                    this.ui.visible('NATIVE_BACK', this.stack.length > 0),
                    this.ui.visible('NATIVE_PREV', this.page.offset > 0),
                    this.ui.visible('NATIVE_NEXT', this.page.offset + PAGE_SIZE < all.length)
                ]);
                this.actions = rows.map(item => item.action);
                this.last = signature;
            } while (this.pending);
        } finally { this.rendering = false; }
    }
}

module.exports = { NativeMenu };
