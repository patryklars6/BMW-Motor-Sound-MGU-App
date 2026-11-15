'use strict';

const { WIDTH, HEIGHT } = require('./view');
const { themeFor } = require('./themes');

function drawSettings(cv, page, actions) {
    const t = themeFor(page.theme);
    const height = HEIGHT + Math.max(0, cv.extra || 0);
    cv.fillRect(0, 0, WIDTH, height, t.bg);
    cv.fillRect(0, 0, WIDTH, 61, t.top);
    if (t.secondary) cv.line(40, 60, 200, 60, 2, t.secondary);
    cv.text('Einstellungen', 38, 43, 36, t.text, { font: 'bold' });
    cv.text(t.label, WIDTH - 43, 41, 24, t.accent, { align: 'right' });

    const top = 76, menuWidth = 308;
    const rowHeight = Math.min(48, (height - top - 20) / page.groups.length);
    cv.roundRect(20, top, menuWidth, rowHeight * page.groups.length, 13, t.panel);
    page.groups.forEach((group, index) => {
        const y = top + rowHeight * index;
        if (page.group === group) {
            cv.roundRect(20, y, menuWidth, rowHeight, 9, t.fill);
            cv.roundRect(20, y + 2, 4, rowHeight - 4, 2, t.accent);
        } else if (index > 0) cv.line(33, y, 315, y, 1, t.line);
        cv.text(group, 43, y + rowHeight / 2 + 8, 24, t.text, { font: page.group === group ? 'bold' : 'label' });
        if (cv.own) cv.target(20, y, menuWidth, rowHeight, () => actions.group(group), 'settings-' + group);
    });

    const x = 348, w = WIDTH - x - 26;
    cv.text(page.title || page.group, x + 17, top + 31, 29, t.text, { font: 'bold' });
    if (page.status) cv.text(page.status, x + w - 10, top + 28, 20, t.dim, { align: 'right' });
    const first = top + 50;
    const h = 53, gap = 6;
    const count = Math.max(3, Math.floor((height - first - 25) / (h + gap)));
    const from = Math.max(0, Math.min(page.index, page.rows.length - count));
    page.rows.slice(from, from + count).forEach((row, local) => {
        const index = from + local;
        const y = first + (h + gap) * local;
        const selected = page.index === index;
        cv.roundRect(x, y, w, h, 12, selected ? t.fill : t.panel);
        if (selected) cv.strokeRoundRect(x, y, w, h, 12, 1.4, t.accent);
        cv.text(row.label, x + 19, y + 35, 24, t.text, { font: selected ? 'bold' : 'label' });
        cv.text(row.value, x + w - 117, y + 35, 24, t.text, { align: 'right', font: 'bold' });
        cv.text('−', x + w - 79, y + 36, 28, t.accent, { align: 'center' });
        cv.text('+', x + w - 31, y + 36, 28, t.accent, { align: 'center' });
        if (cv.own) {
            cv.target(x, y, w - 104, h, () => actions.change(index, 1), row.key);
            cv.target(x + w - 103, y, 48, h, () => actions.change(index, -1), row.key + '-down');
            cv.target(x + w - 54, y, 54, h, () => actions.change(index, 1), row.key + '-up');
        }
    });
    if (page.rows.length > count) {
        const bottom = height - 14;
        cv.text('‹', x + w - 237, bottom, 24, t.accent, { align: 'center' });
        cv.text('›', x + w - 30, bottom, 24, t.accent, { align: 'center' });
        cv.text((from + 1) + '–' + Math.min(from + count, page.rows.length) + ' / ' + page.rows.length,
            x + w - 130, bottom, 18, t.dim, { align: 'center' });
        if (cv.own) {
            cv.target(x + w - 270, bottom - 26, 66, 36, () => actions.page(-count), 'settings-page-up');
            cv.target(x + w - 63, bottom - 26, 66, 36, () => actions.page(count), 'settings-page-down');
        }
    }
}

module.exports = { drawSettings };
