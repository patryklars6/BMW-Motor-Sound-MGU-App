'use strict';
// Preview-only signal fixtures. This tool is never shipped as vehicle telemetry.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const packageRoot = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const source = path.join(packageRoot, 'javascript');
const { Synth, resolveSettings, RATE, FRAMES } = require(path.join(source, 'sound'));
const spec = require(path.join(source, 'kit/app-spec.json'));
const defaults = Object.fromEntries(spec.settings.map(row => [row.key, row.default]));
const names = [['v6', 'V6'], ['v8', 'V8'], ['f90', 'M5-F90-Klangabstimmung'], ['m', 'M-Sound-Klangabstimmung'], ['diesel', 'Sport-Diesel'], ['individual', 'Individual']];
function fixture(t, block) {
    let rpm = 820, speed = 0, stage = 'P', gear = null, pedal = 0, epoch = 0;
    if (t >= 2 && t < 5.5) { rpm = 1200 + (t - 2) / 3.5 * 3600; speed = 5 + (t - 2) / 3.5 * 45; stage = 'D'; gear = 1; pedal = .78; epoch = 1; }
    else if (t >= 5.5 && t < 8) { rpm = 3100 + (t - 5.5) / 2.5 * 800; speed = 50 + (t - 5.5) * 8; stage = 'D'; gear = 2; pedal = .78; epoch = 2; }
    else if (t >= 8 && t < 11) { rpm = 3200; speed = 70; stage = 'D'; gear = 2; pedal = .45; epoch = 2; }
    else if (t >= 11 && t < 12) { rpm = 3200 - (t - 11) * 1300; speed = 70 - (t - 11) * 25; stage = 'D'; gear = 2; pedal = Math.max(0, .45 - (t - 11) * 4); epoch = 2; }
    else if (t >= 12 && t < 14) { rpm = 3000 - (t - 12) * 250; speed = 45 - (t - 12) * 8.5; stage = 'D'; gear = 1; epoch = 3; }
    else if (t >= 14 && t < 17) { rpm = 2500 + (t - 14) / 3 * 2000; speed = 28 + (t - 14) / 3 * 32; stage = 'D'; gear = 1; pedal = .8; epoch = 3; }
    else if (t >= 17 && t < 19) { rpm = 3000 + (t - 17) * 250; speed = 60 + (t - 17) * 5; stage = 'D'; gear = 2; pedal = .8; epoch = 4; }
    else if (t >= 19 && t < 21) { rpm = 3500 - (t - 19) / 2 * 2680; speed = Math.max(0, 70 - (t - 19) * 35); stage = 'D'; gear = 2; pedal = Math.max(0, .8 - (t - 19) * 4); epoch = 4; }
    const off = t >= 22;
    return { engine: off ? 'off' : 'running', rpm: off ? 0 : rpm, speed, stage, gear, idle: !off && stage === 'P', torque: pedal > 0 ? pedal * 220 : stage === 'D' ? -60 : 0,
        pedal: { value: pedal, sequence: block + 1, at: block * 20 },
        gearSignal: gear === null ? null : { gear, stage, source: 'preview-only-fixture', sequence: epoch, at: epoch * 100 } };
}
function wav(pcm) {
    const h = Buffer.alloc(44); h.write('RIFF'); h.writeUInt32LE(pcm.length + 36, 4); h.write('WAVEfmt ', 8);
    h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(RATE, 24);
    h.writeUInt32LE(RATE * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([h, pcm]);
}
fs.mkdirSync(out, { recursive: true });
const clips = [];
for (const [id, name] of names) {
    const values = Object.assign({}, defaults, { enabled: true, autoMode: false, manualProfile: id, speakers: 'up10', level: 60, limit: 60 });
    Object.assign(values, { [id + '_bangOn']: true, [id + '_bang']: 70, [id + '_bangHardness']: 95, [id + '_bangRate']: 60,
        [id + '_turbo']: 45, [id + '_lift']: 70, [id + '_boost']: 65, [id + '_shutdownLevel']: 55 });
    if (id === 'individual') Object.assign(values, { individualBase: 'v6', individual_character: 'deep', engine: 85, exhaust: 85 });
    const cfg = resolveSettings(key => values[key], null), synth = new Synth();
    assert.equal(synth.error, null);
    const blocks = [];
    for (let block = 0; block < 1200; block++) blocks.push(synth.render(fixture(block / 50, block), cfg, 2));
    assert.equal(synth.events.upshift, 2); assert.equal(synth.events.downshift, 1); assert.equal(synth.events.shutdown, 1);
    const pcm = Buffer.concat(blocks);
    // 40 ms file-edge fade only. No EQ, compression, normalization or added effects.
    for (let frame = 0; frame < 1200 * FRAMES; frame++) {
        const gain = Math.max(0, Math.min(1, frame / (RATE * .04), (1200 * FRAMES - 1 - frame) / (RATE * .04)));
        if (gain >= 1) continue;
        for (let channel = 0; channel < 2; channel++) pcm.writeInt16LE(Math.round(pcm.readInt16LE(frame * 4 + channel * 2) * gain), frame * 4 + channel * 2);
    }
    const bytes = wav(pcm), file = 'LUXO-' + spec.version + '-' + name + '.wav';
    fs.writeFileSync(path.join(out, file), bytes);
    clips.push({ profile: id, file, seconds: 24, events: synth.events, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), settings: values });
}
fs.writeFileSync(path.join(out, 'previews.json'), JSON.stringify({ version: spec.version,
    origin: 'actual packaged recording-based engine', vehicleConnected: false,
    input: 'preview-only invented RPM/pedal/gear/stop trajectory, never a vehicle trace', normalization: false,
    timelineSeconds: { idle: [0, 2], steadyRpm: [8, 11], upshift: [5.5, 17], lift: [11, 19], downshift: 12, engineOffParked: 22 }, clips }, null, 2) + '\n');
console.log('Rendered six 24-second profile previews from package ' + spec.version + ' with idle, steady RPM, shifts, lift and measured-off fixture.');
