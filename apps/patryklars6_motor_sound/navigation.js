'use strict';
const { themeFor } = require('./themes');
function navigation(cv, title, theme, actions) {
    const t = themeFor(theme);
    cv.fillRect(0, 0, 1080, 61, t.top);
    // Older profile/live headers extend to y=74; clear their remaining glyphs.
    cv.fillRect(0, 61, 1080, 14, t.bg);
    cv.text(title, 28, 42, 30, t.text, { font: 'bold' });
    if (cv.targets) cv.targets = cv.targets.filter(target => target.y >= 61 || target.x >= 1080);
    [['Zurück', 510, 150, actions.back, 'nav-back'], ['Hauptmenü', 672, 185, actions.home, 'nav-home'],
        ['BMW-Menü', 869, 185, actions.native, 'nav-native']].forEach(([label, x, width, action, key]) => {
        cv.roundRect(x, 8, width, 44, 9, t.fill);
        cv.text(label, x + width / 2, 37, 23, t.text, { align: 'center', font: 'bold' });
        if (cv.own) cv.target(x, 8, width, 44, action, key);
    });
}
function drawDiagnostics(cv, diagnostics, theme) {
    const t = themeFor(theme), h = 520 + Math.max(0, cv.extra || 0);
    cv.fillRect(0, 0, 1600, h, t.bg);
    cv.fillRect(0, 0, 1600, 61, t.top);
    cv.text(t.label, 1560, 42, 23, t.accent, { align: 'right' });
    const short = (value, length) => String(value).length > length ? String(value).slice(0, length - 1) + '…' : String(value);
    cv.text(short(diagnostics.message, 115), 30, 88, 22, t.dim);
    const rows = diagnostics.rows(), size = Math.max(4, Math.floor((h - 174) / 58));
    const from = Math.max(0, Math.min(diagnostics.offset, Math.floor((rows.length - 1) / size) * size));
    rows.slice(from, from + size).forEach((row, index) => {
        const y = 103 + index * 58;
        cv.roundRect(25, y, 1550, 51, 10, row.action ? t.fill : t.panel);
        cv.text(short(row.label, 43), 43, y + 33, 23, t.text, { font: 'bold' });
        cv.text(short(row.value, 88), 625, y + 32, 20, t.dim);
        if (cv.own && row.action) cv.target(25, y, 1550, 51, row.action, 'diag-' + row.id);
    });
    cv.text((from + 1) + '–' + Math.min(from + size, rows.length) + ' / ' + rows.length, 800, h - 24, 22, t.dim, { align: 'center' });
    [['Vorherige Seite', 28, -1], ['Weitere Einträge', 1290, 1]].forEach(([label, x, step]) => {
        cv.roundRect(x, h - 56, 280, 43, 9, t.fill);
        cv.text(label, x + 140, h - 26, 22, t.text, { align: 'center' });
        if (cv.own) cv.target(x, h - 56, 280, 43, () => diagnostics.turn(step, size), 'diag-page-' + step);
    });
}
module.exports = { navigation, drawDiagnostics };
