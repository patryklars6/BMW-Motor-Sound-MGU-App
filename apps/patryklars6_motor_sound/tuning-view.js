'use strict';

const { WIDTH, HEIGHT } = require('./view');
const { themeFor } = require('./themes');

const EFFECTS = [
    { id: 'engine', name: 'Motor', route: 'Vorn · Center bei 5 Kanälen', settings: ['engine', 'engineOn', 'engineVolume', 'bass',
        'bassOn', 'depth', 'character', 'shutdownTailOn', 'shutdownLevel', 'enginePan', 'engineFader', 'engineCenter', 'engineRouteGain'] },
    { id: 'turbo', name: 'Turbo', route: 'Vorn rechts', settings: ['turbo', 'turboOn', 'turboVolume', 'turboStyle',
        'boostOn', 'boost', 'liftOn', 'lift', 'shiftOn', 'shiftTurboOn', 'shiftLevel', 'turboPan', 'turboFader', 'turboRouteGain'] },
    { id: 'exhaust', name: 'Auspuff', route: 'Hinten', settings: ['exhaust', 'exhaustOn', 'exhaustVolume',
        'exhaustPan', 'exhaustFader', 'exhaustRouteGain'] },
    { id: 'bang', name: 'Pop & Bangs', route: 'Hinten', settings: ['bang', 'bangOn', 'bangVolume', 'bangHardness', 'bangRate', 'shiftOn', 'shiftBangOn', 'shiftLevel',
        'bangPan', 'bangFader', 'bangRouteGain'] }
];

function channelStatus(count) {
    if (count === 2) return '2 PCM-Kanäle · Lautsprecher ungeprüft';
    if (count === 4) return '4 PCM-Kanäle · Lautsprecher ungeprüft';
    if (count === 5) return '5 PCM-Kanäle · Lautsprecher ungeprüft';
    return 'PCM: noch nicht geöffnet';
}

function drawTuning(cv, model, actions) {
    const t = themeFor(model.theme);
    const height = HEIGHT + Math.max(0, cv.extra || 0);
    cv.fillRect(0, 0, WIDTH, height, t.bg);
    cv.fillRect(0, 0, WIDTH, 61, t.top);
    if (t.secondary) cv.line(40, 60, 200, 60, 2, t.secondary);
    cv.text('Sound-Tuning', 40, 43, 36, t.text, { font: 'bold' });
    cv.text(channelStatus(model.channels), WIDTH - 43, 41, 23, t.accent, { align: 'right' });
    cv.text(model.label, 42, 107, 31, t.text, { font: 'bold' });
    cv.text('Effekt auswählen und einstellen', WIDTH - 42, 104, 22, t.dim, { align: 'right' });

    const w = 758, h = (height - 164) / 2;
    EFFECTS.forEach((effect, index) => {
        const row = model.effects[index];
        const x = 40 + (index % 2) * 770;
        const y = 126 + Math.floor(index / 2) * (h + 12);
        const focused = model.focus === index;
        cv.roundRect(x, y, w, h, 16, focused ? t.fill : t.panel);
        cv.strokeRoundRect(x, y, w, h, 16, 1.4, focused ? t.accent : t.line);
        cv.text(effect.name, x + 27, y + 49, 34, t.text, { font: 'bold' });
        cv.text('Intensität', x + 28, y + 82, 22, t.dim);
        cv.text(row.level + ' %', x + w - 31, y + 89, 24, t.text, { align: 'right', font: 'bold' });
        const span = w - 58;
        cv.roundRect(x + 29, y + 100, span, 6, 3, t.track);
        if (row.level !== 0) cv.roundRect(x + 29, y + 100, span * row.level / 100, 6, 3, row.on ? t.accent : t.subdued);
        cv.text('Vorgabe · ' + effect.route, x + 29, y + 143, 20, t.dim);
        cv.roundRect(x + w - 86, y + 24, 57, 27, 14, row.on ? t.accent : t.track);
        cv.circle(x + w - (row.on ? 44 : 72), y + 37, 9, row.on ? t.bg : t.text);
        if (cv.own) {
            cv.target(x, y, w - 98, h, () => actions.open(index), effect.id + '-tune');
            cv.target(x + w - 97, y + 14, 85, 47, () => actions.flip(index), effect.id + '-enabled');
        }
    });
}

module.exports = { EFFECTS, channelStatus, drawTuning };
