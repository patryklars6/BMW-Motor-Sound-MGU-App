'use strict';
// Small, local PCM bank. No network, model inference or recording download on MGU.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, 'audio');
const INSTALLED_ROOT = '/var/opt/luxo-soundpack/current/audio';
const cache = new Map();
function recordings(directory, reload) {
    directory = directory || ROOT;
    if (reload) cache.delete(directory);
    if (cache.has(directory)) return cache.get(directory);
    const result = { sounds: {}, motors: {}, error: null, sampleRate: 24000,
        quality: { status: 'unverified', productionReady: false } };
    try {
        const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
        result.quality = manifest.quality || result.quality;
        if (manifest.schema !== 1 || manifest.sampleRate !== 24000 || manifest.channels !== 1 || manifest.format !== 'S16LE') throw Error('Unsupported audio bank format');
        let total = 0;
        Object.keys(manifest.sounds).forEach(name => {
            const row = manifest.sounds[name];
            if (!/^[a-z0-9-]+\.pcm$/.test(row.file) || !Number.isInteger(row.frames) || row.frames < 16 || row.frames > 240000) throw Error('Invalid sample entry');
            if (row.referenceRpm !== null && (!Number.isFinite(row.referenceRpm) || row.referenceRpm < 400 || row.referenceRpm > 12000)) throw Error('Invalid playback RPM calibration');
            const bytes = fs.readFileSync(path.join(directory, row.file));
            total += bytes.length;
            if (total > 12000000 || bytes.length !== row.frames * 2 || crypto.createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw Error('Audio bank checksum mismatch: ' + name);
            const values = new Float32Array(row.frames);
            for (let i = 0; i < values.length; i++) values[i] = bytes.readInt16LE(i * 2) / 32768;
            result.sounds[name] = { values, referenceRpm: row.referenceRpm, loop: row.loop };
        });
        ['v6', 'v8', 'f90', 'm', 'diesel'].forEach(id => {
            if (!result.sounds[id + '-low'] || !result.sounds[id + '-high']) throw Error('Missing motor recording: ' + id);
            if (!result.sounds[id + '-low'].referenceRpm || !result.sounds[id + '-high'].referenceRpm) throw Error('Missing motor playback calibration: ' + id);
            result.motors[id] = { lowName: id + '-low', highName: id + '-high',
                low: result.sounds[id + '-low'], high: result.sounds[id + '-high'] };
        });
        ['spool', 'release', 'stop', 'crack-1', 'crack-2', 'crack-3'].forEach(id => {
            if (!result.sounds[id]) throw Error('Missing effect recording: ' + id);
        });
    } catch (error) { result.error = String(error.message || error); result.sounds = {}; }
    if (cache.size >= 4) cache.delete(cache.keys().next().value);
    cache.set(directory, result);
    return result;
}
function interpolate(values, position, loop) {
    const index = Math.floor(position), fraction = position - index;
    if (index >= values.length) return 0;
    const a = values[index], b = values[index + 1] === undefined ? loop ? values[0] : 0 : values[index + 1];
    return a + (b - a) * fraction;
}
class RecordedAudio {
    constructor(directory, reload) { this.bank = recordings(directory, reload); this.reset(); }
    reset() {
        this.positions = Object.create(null); this.shots = []; this.current = null; this.previous = null; this.fade = 0;
        this.effectValues = { bang: 0, turbo: 0, stop: 0 };
    }
    loop(name, step) {
        const sound = this.bank.sounds[name];
        if (!sound) return 0;
        const position = this.positions[name] || 0;
        const sample = interpolate(sound.values, position, true);
        this.positions[name] = (position + step) % sound.values.length;
        return sample;
    }
    select(id) {
        if (id === this.current) return;
        this.previous = this.current; this.current = id; this.fade = this.previous ? 1 : 0;
    }
    motor(id, rpm) {
        const motor = this.bank.motors[id];
        if (!motor) return 0;
        const { low, high } = motor;
        const blend = Math.max(0, Math.min(1, (rpm - 1200) / 2300));
        const a = this.loop(motor.lowName, .5 * Math.max(.45, Math.min(2.8, rpm / low.referenceRpm)));
        const b = this.loop(motor.highName, .5 * Math.max(.45, Math.min(2.4, rpm / high.referenceRpm)));
        return a * (1 - blend) + b * blend;
    }
    engine(rpm) {
        const now = this.motor(this.current, rpm);
        if (!this.fade || !this.previous) return now;
        const before = this.motor(this.previous, rpm);
        const value = before * this.fade + now * (1 - this.fade);
        this.fade = Math.max(0, this.fade - 1 / 7680); // 160 ms at 48 kHz
        return value;
    }
    trigger(name, gain, layer, speed) {
        if (!this.bank.sounds[name] || !(gain > 0)) return;
        if (this.shots.length >= 12) this.shots.shift();
        this.shots.push({ name, gain, layer, position: 0, step: .5 * (speed || 1) });
    }
    clear(layer) { this.shots = this.shots.filter(shot => shot.layer !== layer); }
    effects() {
        const values = this.effectValues;
        values.bang = 0; values.turbo = 0; values.stop = 0;
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const shot = this.shots[i], sound = this.bank.sounds[shot.name];
            values[shot.layer] += interpolate(sound.values, shot.position, false) * shot.gain;
            shot.position += shot.step;
            if (shot.position >= sound.values.length) this.shots.splice(i, 1);
        }
        return values;
    }
}
module.exports = { RecordedAudio, recordings, INSTALLED_ROOT };
