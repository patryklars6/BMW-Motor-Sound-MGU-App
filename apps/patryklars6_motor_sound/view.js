'use strict';

const { MODES } = require('./sound');
const { themeFor } = require('./themes');

const WIDTH = 1600;
const HEIGHT = 520;
const UNKNOWN = 'Nicht verfügbar';
const ENGINE = { off: 'Aus', starting: 'Startet', running: 'An' };
const OPERATION = { off: 'Motor aus', starting: 'Motor startet', moving: 'Fahrzeug fährt',
    'stationary-P': 'Standlauf · P', 'stationary-N': 'Standlauf · N', 'stationary-D': 'Standlauf · D',
    'stationary-R': 'Standlauf · R', 'stationary-unknown-gear': 'Motor läuft · Fahrzeug steht' };
const PROFILE_CARDS = [
    { id: 'v6', name: 'V6 Sound', description: 'Klarer Sechszylinder-Klang' },
    { id: 'v8', name: 'V8 Sound', description: 'Tiefer Motor- und Auspuffklang' },
    { id: 'f90', name: 'BMW M5 F90', description: 'Kräftiger Klang mit mehr Turbo' },
    { id: 'm', name: 'BMW M Sound', description: 'Präsente Mitten und Obertöne' },
    { id: 'diesel', name: 'Sport Diesel', description: 'Tiefe Pulse und Turbo' },
    { id: 'individual', name: 'Individual', description: 'Deine eigene Klangabstimmung' }
];

function smoothGauge(previous, rpm, elapsed) {
    if (rpm === null || previous === null || Math.abs(rpm - previous) < 2 || elapsed >= 500) return rpm;
    return previous + (rpm - previous) * (1 - Math.exp(-Math.max(0, elapsed) / 85));
}

function audioStatus(prefs, data, output) {
    if (!prefs.enabled) return 'Aus';
    if (data.engine === null || data.rpm === null) return 'Wartet auf Fahrzeugdaten';
    if (data.engine === 'starting') return 'Motor startet';
    if (data.engine === 'off' || data.rpm < 400) return 'Motor steht';
    if (!prefs.profileId) return 'Wartet auf Fahrmodus';
    if (!prefs.gain) return 'Stumm';
    if (output.channels === 5) return 'PCM verbunden · 5 Kanäle';
    if (output.channels === 4) return 'PCM verbunden · 4 Kanäle';
    if (output.channels === 2) return 'PCM verbunden · Stereo';
    return output.state === 'connecting' ? 'Verbindet Audio-Dienst' : 'Audiopfad fehlt · Details im BMW-Menü';
}

function header(cv, page, status, C) {
    const h = HEIGHT + Math.max(0, cv.extra || 0);
    cv.fillRect(0, 0, WIDTH, h, C.bg);
    cv.roundRect(37, 32, 5, 42, 2, C.accent);
    if (C.secondary) cv.roundRect(37, 64, 5, 10, 2, C.secondary);
    cv.text('LUXO Motor Sound', 59, 63, 34, C.text, { font: 'bold' });
    cv.text(page, 402, 63, 25, C.dim);
    if (status) cv.text(status, WIDTH - 38, 60, 24, C.accent, { align: 'right' });
    return h;
}

function dialArc(cv, cx, cy, radius, start, end, color) {
    const steps = Math.max(2, Math.ceil((end - start) / 4));
    let x = cx + Math.cos(start * Math.PI / 180) * radius;
    let y = cy + Math.sin(start * Math.PI / 180) * radius;
    for (let index = 1; index <= steps; index++) {
        const angle = (start + (end - start) * index / steps) * Math.PI / 180;
        const nextX = cx + Math.cos(angle) * radius;
        const nextY = cy + Math.sin(angle) * radius;
        cv.line(x, y, nextX, nextY, 7, color);
        x = nextX;
        y = nextY;
    }
}

function revScale(cv, x, y, w, h, rpm, needle, C) {
    cv.roundRect(x, y, w, h, 20, C.panel);
    const cx = x + w / 2;
    const cy = y + h - 49;
    const radius = Math.min(192, h - 78);
    const start = 195;
    const end = 345;
    cv.text('MOTORDREHZAHL', cx, y + 42, 21, C.dim, { align: 'center', font: 'bold', spacing: 1.4 });
    dialArc(cv, cx, cy, radius - 4, start, end, C.line);
    const limit = 8000;
    if (needle !== null && needle > 0) {
        dialArc(cv, cx, cy, radius - 4, start, start + (end - start) * Math.min(needle / limit, 1), C.accent);
    }
    for (let step = 0; step <= 8; step++) {
        const a = (start + step * (end - start) / 8) * Math.PI / 180;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const inner = radius - (step % 2 ? 20 : 25);
        cv.line(cx + dx * (radius - 13), cy + dy * (radius - 13), cx + dx * inner, cy + dy * inner, 2, C.subdued);
    }
    if (rpm === null) {
        cv.text(UNKNOWN, cx, cy - 44, 42, C.dim, { align: 'center', font: 'bold' });
    } else {
        cv.text(String(Math.round(rpm)), cx, cy - 37, 77, C.text, { align: 'center', font: 'num' });
    }
    cv.text('U/min', cx, cy + 9, 24, C.dim, { align: 'center' });
}

function tile(cv, x, y, w, h, label, value, C) {
    cv.roundRect(x, y, w, h, 16, C.panel);
    cv.text(label, x + 20, y + 30, 21, C.dim);
    cv.text(value === null ? UNKNOWN : value, x + 20, y + h - 19,
        value === null ? 26 : 32, value === null ? C.subdued : C.text, { font: 'bold' });
}

function toggle(cv, x, y, enabled, onClick, key, C) {
    const w = 62, h = 34;
    cv.roundRect(x, y, w, h, h / 2, enabled ? C.accent : C.track);
    cv.circle(x + (enabled ? 45 : 17), y + 17, 11, enabled ? C.background : C.text);
    if (cv.own) cv.target(x - 10, y - 10, w + 20, h + 20, onClick, key);
}

function drawLive(cv, data, prefs, output, needle, actions, theme, showAcceleration) {
    const C = themeFor(theme);
    const mode = data.mode === null ? null : MODES[data.mode].label;
    const gear = data.gear !== null ? [data.stage, data.gear].filter(v => v !== null).join(' ') : data.stage;
    const acceleration = data.acceleration === null ? null
        : (Math.abs(data.acceleration) < 0.05 ? '0,0' : data.acceleration.toFixed(1).replace('.', ',')) + ' m/s²';
    const live = data.rpm !== null || data.speed !== null || data.engine !== null || mode !== null;
    const h = header(cv, 'Live-Ansicht', OPERATION[data.operation] || (live ? 'Fahrzeugdaten aktiv' : null), C);
    const top = 92;
    const footer = h - 89;
    const rowSpace = footer - top - 15;
    const rightX = 770;
    const rowHeight = (rowSpace - 20) / 3;
    const width = (WIDTH - rightX - 36 - 12) / 2;
    revScale(cv, 36, top, rightX - 52, rowSpace, data.rpm, needle, C);
    const values = [
        ['Geschwindigkeit', data.speed === null ? null : Math.round(data.speed) + ' km/h'],
        ['Fahrmodus', mode],
        ['Motorstatus', ENGINE[data.engine] || null],
        ['Gang', gear],
        ['Motorleerlauf', data.idle === null ? null : data.idle ? 'Ja' : 'Nein'],
        ['Beschleunigung', acceleration]
    ];
    if (showAcceleration === false) values.pop();
    values.forEach(([label, value], i) => {
        tile(cv, rightX + (i % 2) * (width + 12), top + Math.floor(i / 2) * (rowHeight + 10), i === 4 && values.length === 5 ? 2 * width + 12 : width, rowHeight, label, value, C);
    });

    cv.roundRect(36, footer, WIDTH - 72, 66, 16, C.raised);
    cv.text('Motorsound', 64, footer + 29, 20, C.dim);
    cv.text(audioStatus(prefs, data, output), 64, footer + 51, 22, C.text, { font: 'bold' });
    toggle(cv, 394, footer + 16, prefs.enabled, actions.toggle, 'motorsound', C);
    cv.text('Klangprofil', 500, footer + 29, 20, C.dim);
    cv.text(prefs.profileLabel || '–', 500, footer + 51, 22, C.text, { font: 'bold' });
    cv.text('Lautsprecher', 834, footer + 29, 20, C.dim);
    cv.text(prefs.speaker.label, 834, footer + 51, 22, C.text, { font: 'bold' });
    cv.text('Pegel / Grenze', 1290, footer + 29, 20, C.dim);
    cv.text(Math.round(prefs.level * 100) + ' / ' + Math.round(prefs.limit * 100) + ' %', 1290, footer + 51, 22, C.text, { font: 'bold' });
}

function drawProfiles(cv, prefs, actions, theme, focus) {
    const C = themeFor(theme);
    const h = header(cv, 'Klangprofile', null, C);
    const gap = 14;
    const w = (WIDTH - 72 - 2 * gap) / 3;
    const top = 96;
    const cardHeight = (h - top - 109) / 2;
    PROFILE_CARDS.forEach((profile, i) => {
        const x = 36 + (i % 3) * (w + gap);
        const y = top + Math.floor(i / 3) * (cardHeight + gap);
        const active = profile.id === prefs.profileId;
        cv.roundRect(x, y, w, cardHeight, 18, active ? C.fill : C.panel);
        if (active || (!cv.own && focus === profile.id)) cv.strokeRoundRect(x, y, w, cardHeight, 18, 2, active ? C.accent : C.dim);
        cv.text(profile.name, x + 26, y + 58, 37, C.text, { font: 'bold' });
        cv.text(profile.description, x + 28, y + 100, 25, C.dim);
        if (active) cv.text('Aktiv', x + w - 28, y + 48, 22, C.accent, { align: 'right', font: 'bold' });
        if (cv.own) cv.target(x, y, w, cardHeight, () => actions.select(profile.id), profile.id);
    });
    const footer = h - 76;
    cv.text('Automatisch nach Fahrmodus', 48, footer + 31, 24, C.text, { font: 'bold' });
    toggle(cv, 423, footer + 8, prefs.auto, actions.auto, 'fahrmodusautomatik', C);
    cv.roundRect(WIDTH - 240, footer, 200, 51, 12, C.fill);
    cv.text('Tuning öffnen', WIDTH - 140, footer + 33, 22, C.text, { align: 'center', font: 'bold' });
    if (cv.own) cv.target(WIDTH - 240, footer, 200, 51, () => actions.tune(prefs.profileId), 'profil-tuning');
}

module.exports = { WIDTH, HEIGHT, PROFILE_CARDS, smoothGauge, audioStatus, drawLive, drawProfiles };
