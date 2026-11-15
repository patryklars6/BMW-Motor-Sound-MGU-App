'use strict';

const { PROFILE_CARDS, WIDTH, HEIGHT } = require('./view');
const { MODES } = require('./sound');
const { themeFor } = require('./themes');

const NAV = [
    ['home', 'Hauptmenü'], ['profiles', 'Soundprofile'], ['individual', 'Individual'],
    ['modes', 'Fahrmodus'], ['speakers', 'Lautsprecher'], ['design', 'Design'], ['settings', 'Einstellungen'],
    ['live', 'Live-Daten'], ['info', 'Info']
];
const ROWS = [
    ['turbo', 'Turbosound'], ['exhaust', 'Auspuffklang'], ['bang', 'Pop & Bangs']
];

function icon(cv, name, x, y, color) {
    if (name === 'home') {
        cv.polyline([[x, y + 11], [x + 13, y], [x + 26, y + 11]], 2.5, color);
        cv.polyline([[x + 4, y + 8], [x + 4, y + 23], [x + 11, y + 23], [x + 11, y + 16],
            [x + 16, y + 16], [x + 16, y + 23], [x + 22, y + 23], [x + 22, y + 8]], 2, color);
        return;
    }
    if (name === 'live' || name === 'profiles') {
        cv.polyline([[x, y + 13], [x + 6, y + 13], [x + 10, y + 4], [x + 15, y + 21],
            [x + 20, y + 8], [x + 23, y + 13], [x + 27, y + 13]], 2.4, color);
        return;
    }
    if (name === 'speakers') {
        cv.polyline([[x + 1, y + 9], [x + 7, y + 9], [x + 14, y + 3], [x + 14, y + 22],
            [x + 7, y + 17], [x + 1, y + 17], [x + 1, y + 9]], 2, color);
        cv.arc(x + 12, y + 12, 8, 10, -59, 59, color);
        cv.arc(x + 12, y + 12, 12, 14, -55, 55, color);
        return;
    }
    if (name === 'modes') {
        cv.arc(x + 13, y + 12, 10, 12, 0, 360, color);
        cv.line(x + 3, y + 9, x + 23, y + 9, 2, color);
        cv.line(x + 13, y + 10, x + 13, y + 21, 2, color);
        return;
    }
    cv.arc(x + 13, y + 12, 10, 12, 0, 360, color);
    if (name === 'info') {
        cv.circle(x + 13, y + 7, 1.5, color);
        cv.line(x + 13, y + 10, x + 13, y + 18, 2, color);
    } else {
        cv.arc(x + 13, y + 12, 3.5, 5, 0, 360, color);
        for (let n = 0; n < 8; n++) {
            const a = n * Math.PI / 4, dx = Math.cos(a), dy = Math.sin(a);
            cv.line(x + 13 + 10 * dx, y + 12 + 10 * dy, x + 13 + 14 * dx, y + 12 + 14 * dy, 2, color);
        }
    }
}

function interactive(cv, x, y, w, h, action, key) {
    if (cv.own) cv.target(x, y, w, h, action, key);
}

function card(cv, x, y, w, h, color, edge) {
    cv.roundRect(x, y, w, h, 11, color);
    cv.strokeRoundRect(x, y, w, h, 11, 1.4, edge);
}

function pill(cv, x, y, w, h, text, selected, action, key, accent) {
    card(cv, x, y, w, h, selected ? accent.fill : accent.panel, selected ? accent.accent : accent.line);
    cv.text(text, x + w / 2, y + h / 2 + 8, 22, selected ? accent.light : accent.text,
        { align: 'center', font: 'bold' });
    if (action) interactive(cv, x, y, w, h, action, key);
}

function paintTop(cv, height, active, nav, accent) {
    cv.fillRect(0, 0, WIDTH, height, accent.bg);
    cv.fillRect(0, 0, WIDTH, 57, accent.top);
    cv.line(0, 57, WIDTH, 57, 1, accent.line);
    cv.line(318, 57, 1015, 57, 2, accent.accent);
    if (accent.secondary) cv.line(1015, 57, 1190, 57, 2, accent.secondary);
    icon(cv, 'home', 32, 14, accent.text);
    cv.line(82, 8, 82, 48, 1, accent.line);
    cv.text('BMW Motor Sound', 103, 39, 38, accent.text, { font: 'bold' });
    cv.text('MGU App', 488, 39, 38, accent.accent, { font: 'bold' });

    const left = 15, top = 74, w = 277, part = (height - top - 19) / NAV.length;
    card(cv, left, top, w, part * NAV.length, accent.panel, accent.line);
    NAV.forEach(([key, label], index) => {
        const y = top + part * index;
        const selected = active === key;
        if (selected) {
            card(cv, left, y, w, part, accent.fill, accent.accent);
            cv.roundRect(left, y + 3, 4, part - 6, 2, accent.accent);
        } else if (index > 0) cv.line(left + 12, y, left + w - 12, y, 1, accent.line);
        icon(cv, key, left + 19, y + part / 2 - 12, selected ? accent.light : accent.dim);
        cv.text(label, left + 62, y + part / 2 + 9, 25, accent.text, { font: selected ? 'bold' : 'label' });
        interactive(cv, left, y, w, part, () => nav(key), 'nav-' + key);
    });
    interactive(cv, 15, 5, 60, 45, () => nav('home'), 'home-button');
}

function heroWave(cv, x, y, w, h, accent) {
    for (let wave = 0; wave < 4; wave++) {
        const points = [];
        for (let at = 0; at <= 60; at++) {
            const t = at / 60;
            const envelope = h * t * (0.4 + 0.22 * Math.sin(t * 11));
            points.push([x + w * t, y + 11 - 24 * t + envelope * Math.sin(t * 27 + wave * 0.55)]);
        }
        cv.polyline(points, wave === 0 ? 2 : 1, wave === 0 ? accent.wave : accent.waveSoft);
    }
}

function hero(cv, x, y, w, h, values, toggle, accent) {
    card(cv, x, y, w, h, accent.hero, accent.line);
    heroWave(cv, x + w - 420, y + h / 2 + 10, 399, Math.min(42, h / 2 - 4), accent);
    const px = x + 75, py = y + h / 2;
    const powerColor = values.enabled ? accent.accent : accent.subdued;
    cv.arc(px, py, 38, 42, 0, 360, values.enabled ? accent.ring : '#30292c');
    cv.arc(px, py, 34, 37, 0, 360, powerColor);
    cv.arc(px, py + 2, 15, 19, -49, 229, powerColor, { round: true });
    cv.line(px, py - 17, px, py - 1, 4, powerColor);
    cv.text('Motor Sound', x + 142, py - 3, 35, accent.text, { font: 'bold' });
    cv.text(values.enabled ? 'Eingeschaltet' : 'Ausgeschaltet', x + 142, py + 29, 28, powerColor, { font: 'bold' });
    cv.line(x + 481, y + 15, x + 481, y + h - 15, 1, accent.line);
    cv.text(values.status, x + 511, py + 6, 24, accent.dim);
    interactive(cv, x + 23, y + 5, 427, h - 10, toggle, 'sound-power');
}

function toneRow(cv, x, y, w, h, label, name, setting, actions, accent) {
    const fill = setting.on ? accent.accent : accent.subdued;
    const start = x + 346;
    const stop = x + w - 269;
    const py = y + h / 2;
    const thumb = start + (stop - start) * setting.level / 100;
    cv.line(x + 12, y + h, x + w - 12, y + h, 1, accent.line);
    cv.text(label, x + 30, py + 8, 24, accent.text);
    cv.text('−', start - 27, py + 8, 24, accent.dim, { align: 'center' });
    cv.roundRect(start, py - 3, stop - start, 6, 3, accent.track);
    if (thumb > start) cv.roundRect(start, py - 3, thumb - start, 6, 3, fill);
    cv.circle(thumb, py, 9, accent.text);
    cv.circle(thumb, py, 6, fill);
    cv.text('+', stop + 27, py + 8, 24, accent.dim, { align: 'center' });
    cv.text(setting.level + ' %', x + w - 122, py + 8, 24, accent.text, { align: 'right' });
    const switchX = x + w - 77;
    cv.roundRect(switchX, py - 13, 55, 26, 13, setting.on ? accent.accent : accent.track);
    cv.circle(switchX + (setting.on ? 41 : 14), py, 9, accent.text);
    interactive(cv, start - 50, y + 1, 42, h - 2, () => actions.adjust(name, -10), name + '-down');
    interactive(cv, stop + 7, y + 1, 42, h - 2, () => actions.adjust(name, 10), name + '-up');
    interactive(cv, switchX - 8, y + 1, 71, h - 2, () => actions.flip(name), name + '-switch');
    return { name, start, stop, top: y, bottom: y + h };
}

function drawHome(cv, data, values, actions) {
    const height = HEIGHT + Math.max(0, cv.extra || 0);
    const accent = themeFor(values.theme);
    paintTop(cv, height, 'home', actions.nav, accent);
    const x = 315, w = WIDTH - x - 20;
    const extra = height - HEIGHT;
    const heroHeight = 99 + 0.12 * extra;
    hero(cv, x, 74, w, heroHeight, values, actions.power, accent);
    const profileY = 74 + heroHeight + 12;
    cv.text('Soundprofile', x + 6, profileY + 23, 27, accent.text, { font: 'bold' });
    const cw = (w - (PROFILE_CARDS.length - 1) * 10) / PROFILE_CARDS.length;
    PROFILE_CARDS.forEach((profile, i) => pill(cv, x + i * (cw + 10), profileY + 33, cw, 43 + 0.03 * extra,
        profile.name, profile.id === values.selected, () => actions.select(profile.id), 'home-' + profile.id, accent));

    const toneY = profileY + 87 + 0.03 * extra;
    cv.text('Klang-Einstellungen', x + 6, toneY + 25, 27, accent.text, { font: 'bold' });
    cv.text(values.label, x + w - 5, toneY + 24, 21, accent.subdued, { align: 'right' });
    const rowsY = toneY + 35;
    const rowHeight = 36 + 0.12 * extra;
    card(cv, x, rowsY, w, 3 * rowHeight, accent.panel, accent.line);
    const sliders = ROWS.map(([key, label], i) =>
        toneRow(cv, x, rowsY + i * rowHeight, w, rowHeight, label, key, values.effects[key], actions, accent));

    const footerY = rowsY + 3 * rowHeight + 13;
    const footerHeight = height - footerY - 14;
    card(cv, x, footerY, w - 148, footerHeight, accent.panel, accent.line);
    cv.text('Fahrmodus-Anpassung', x + 19, footerY + 22, 22, accent.text, { font: 'bold' });
    cv.text(values.auto ? 'Automatisch' : 'Manuelles Klangprofil', x + 20, footerY + 47, 19, accent.dim);
    interactive(cv, x, footerY, 285, footerHeight, actions.auto, 'auto-mode');
    const modeKeys = ['sport', 'comfort', 'eco', 'sportPlus', 'individualMode'];
    modeKeys.forEach((mode, i) => {
        const width = (w - 456) / modeKeys.length;
        pill(cv, x + 288 + i * (width + 6), footerY + 9, width, footerHeight - 18,
            MODES[mode].label, mode === data.mode, () => actions.nav('modes'), 'home-mode-' + mode, accent);
    });
    pill(cv, x + w - 134, footerY, 134, footerHeight, 'Reset', false, actions.reset, 'profile-reset', accent);
    return sliders;
}

function drawInfo(cv, nav, version, accentName) {
    const height = HEIGHT + Math.max(0, cv.extra || 0);
    const accent = themeFor(accentName);
    paintTop(cv, height, 'info', nav, accent);
    const x = 315, y = 75, w = WIDTH - x - 20;
    card(cv, x, y, w, height - y - 18, accent.panel, accent.line);
    cv.text('BMW Motor Sound', x + 33, y + 64, 39, accent.text, { font: 'bold' });
    cv.text('iDrive 7  ·  Version ' + version, x + 35, y + 107, 25, accent.dim);
    const help = [
        ['1. Klangprofil wählen', 'Im Hauptmenü oder unter Soundprofile auswählen. Änderungen werden gespeichert.'],
        ['2. Sound einstellen', 'Tuning pro Profil öffnen, Pegelgrenze einstellen und das Soundsystem wählen.'],
        ['3. Fahrzeugdaten prüfen', 'Unter Live-Daten erscheinen die von deiner MGU gelieferten Werte.'],
        ['4. Wenn der Ton fehlt', 'Motorsound einschalten. Der Fahrzeugmotor und ein freigegebener Audiopfad sind erforderlich.']
    ];
    help.forEach(([title, description], i) => {
        const line = y + 155 + 63 * i;
        cv.text(title, x + 36, line, 22, accent.text, { font: 'bold' });
        cv.text(description, x + 36, line + 25, 19, accent.dim);
    });
}

module.exports = { drawHome, drawInfo };
