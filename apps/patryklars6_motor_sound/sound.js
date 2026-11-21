'use strict';

const RATE = 48000;
const FRAMES = 960;
const PEAK = 0.36;
const TAU = 2 * Math.PI;

const PROFILES = {
    v6: { label: 'V6 Sound', engine: 0.75, exhaust: 0.56, turbo: 0.23, bass: 0.43, lift: 0.25, voice: [0.85, 0.5, 0.32, 0.13], uneven: 0.08, pulses: 3 },
    v8: { label: 'V8 Sound', engine: 0.77, exhaust: 0.75, turbo: 0.13, bass: 0.62, lift: 0.17, voice: [1, 0.46, 0.22, 0.09], uneven: 0.19 },
    f90: { label: 'BMW M5 F90', engine: 0.82, exhaust: 0.64, turbo: 0.35, bass: 0.51, lift: 0.33, voice: [0.91, 0.55, 0.34, 0.21], uneven: 0.1 },
    m: { label: 'BMW M Sound', engine: 0.73, exhaust: 0.69, turbo: 0.22, bass: 0.39, lift: 0.27, voice: [0.78, 0.42, 0.48, 0.23], uneven: 0.065 },
    diesel: { label: 'Sport Diesel', engine: 0.66, exhaust: 0.6, turbo: 0.43, bass: 0.7, lift: 0.36, voice: [0.9, 0.28, 0.16, 0.07], uneven: 0.26, pulses: 3 }
};
const SPEAKERS = {
    standard: { label: 'Standard', trim: 0.76, bass: 0.3, rear: true },
    hifi: { label: 'BMW HiFi', trim: 0.82, bass: 0.4, rear: true },
    hk: { label: 'Harman Kardon', trim: 0.78, bass: 0.46, rear: true },
    bw: { label: 'Bowers & Wilkins', trim: 0.72, bass: 0.44, rear: true },
    up8: { label: 'MATCH UP 8', trim: 0.72, bass: 0.43, rear: true },
    up10: { label: 'MATCH UP 10', trim: 0.7, bass: 0.45, rear: true },
    other: { label: 'Sonstiges / Aftermarket', trim: 0.7, bass: 0.5, rear: true }
};
const MODES = {
    eco: { label: 'ECO PRO', profile: 'v8', level: 0.35 },
    comfort: { label: 'COMFORT', profile: 'v8', level: 0.55 },
    sport: { label: 'SPORT', profile: 'f90', level: 0.8 },
    sportPlus: { label: 'SPORT PLUS', profile: 'm', level: 1 },
    individualMode: { label: 'INDIVIDUAL', profile: 'individual', level: 0.8 }
};

const CHARACTERS = {
    natural: { harmonic: 1, body: 1, rough: 1 },
    deep: { harmonic: 0.55, body: 1.4, rough: 0.85 },
    balanced: { harmonic: 0.83, body: 0.85, rough: 0.72 },
    sport: { harmonic: 1.24, body: 0.9, rough: 1.15 },
    mperformance: { harmonic: 1.45, body: 1.08, rough: 1.32 }
};
const TURBOS = {
    soft: { base: 360, pitch: 0.9, second: 0.03 },
    classic: { base: 530, pitch: 1, second: 0.06 },
    high: { base: 720, pitch: 1.2, second: 0.13 },
    twin: { base: 570, pitch: 1.08, second: 0.31 }
};
const ROUTES = [
    { id: 'engine', balance: 0, fader: -0.85, center: 0.55 },
    { id: 'turbo', balance: 0.7, fader: -0.8, center: 0 },
    { id: 'exhaust', balance: 0, fader: 0.8, center: 0 },
    { id: 'bang', balance: 0, fader: 0.9, center: 0 }
];

const LEVEL_KEYS = new Set(['engine', 'turbo', 'exhaust', 'bass', 'lift']);

function profileSetting(profile, key) {
    return profile === 'individual' && LEVEL_KEYS.has(key) ? key : profile + '_' + key;
}

function position(value, fallback) {
    if (Number.isFinite(value)) return percent(value, fallback, -1);
    if (typeof value !== 'string' || value === 'global' || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? percent(number, fallback, -1) : fallback;
}

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
function percent(value, fallback, low) {
    return Number.isFinite(value) ? clamp(value / 100, low || 0, 1) : fallback;
}

function resolveSettings(get, mode) {
    const auto = get('autoMode') !== false;
    const drive = auto && has(MODES, mode) ? MODES[mode] : null;
    const requested = get(drive ? mode : 'manualProfile');
    const profileId = auto && !drive ? null :
        (requested === 'individual' || has(PROFILES, requested) ? requested : (drive ? drive.profile : 'v8'));
    const individual = profileId === 'individual';
    const base = get('individualBase');
    const preset = PROFILES[individual && has(PROFILES, base) ? base : (has(PROFILES, profileId) ? profileId : 'v8')];
    const source = profileId || 'v8';
    const value = key => get(profileSetting(source, key));
    const voice = Object.assign({}, preset);
    for (const key of LEVEL_KEYS) voice[key] = percent(value(key), preset[key]);
    for (const layer of ['engine', 'turbo', 'exhaust']) {
        const level = percent(value(layer + 'Volume'), 1);
        voice[layer + 'Gain'] = value(layer + 'On') === false ? 0 : level;
    }
    voice.liftGain = value('liftOn') === false ? 0 : voice.turboGain;
    voice.bang = value('bangOn') === true ? percent(value('bang'), 0.5) : 0;
    voice.bassGain = value('bassOn') === false ? 0 : 1;
    voice.depth = percent(value('depth'), 0.5);
    voice.boost = value('boostOn') === false ? 0 : percent(value('boost'), 0.4);
    voice.bangRate = percent(value('bangRate'), 0.3);
    const turboStyle = value('turboStyle');
    voice.turboStyle = has(TURBOS, turboStyle) ? TURBOS[turboStyle] : TURBOS.classic;
    const character = value('character');
    voice.character = has(CHARACTERS, character) ? CHARACTERS[character] : CHARACTERS.natural;
    const requestedSpeaker = get('speakers');
    const speakerId = has(SPEAKERS, requestedSpeaker) ? requestedSpeaker : 'standard';
    const speaker = speakerId === 'other' ? Object.assign({}, SPEAKERS.other, {
        rear: get('rear') !== false, trim: percent(get('otherTrim'), 0.7), bass: percent(get('otherBass'), 0.5)
    }) : SPEAKERS[speakerId];
    const balance = position(value('balance'), percent(get('balance'), 0, -1));
    const fader = speaker.rear ? position(value('fader'), percent(get('fader'), 0, -1)) : -1;
    const routes = ROUTES.map(route => ({
        balance: panOffset(position(value(route.id + 'Pan'), route.balance), balance),
        fader: speaker.rear ? panOffset(position(value(route.id + 'Fader'), route.fader), fader) : -1,
        center: route.id === 'engine' ? percent(value('engineCenter'), route.center) : 0,
        trim: percent(value(route.id + 'RouteGain'), 1)
    }));
    const level = percent(get('level'), 0.3);
    const limit = percent(get('limit'), 0.55);
    const ceiling = Math.min(level, limit);
    return {
        auto, profileId, profileLabel: individual ? 'Individual' : profileId ? preset.label : null,
        speaker, voice, routes, level, limit, ceiling,
        gain: ceiling * speaker.trim * (drive ? drive.level : 1),
        enabled: get('enabled') === true
    };
}

function panOffset(local, global) {
    return local + global * (global < 0 ? 1 + local : 1 - local);
}

function channelMatrix(routes, channels) {
    return routes.map(route => {
        const left = Math.cos((route.balance + 1) * Math.PI / 4);
        const right = Math.sin((route.balance + 1) * Math.PI / 4);
        if (channels === 2) return [left, right].map(gain => gain < 1e-8 ? 0 : gain * route.trim);
        const front = Math.cos((route.fader + 1) * Math.PI / 4);
        const rear = Math.sin((route.fader + 1) * Math.PI / 4);
        const center = channels === 5 ? route.center * front * (1 - Math.abs(route.balance)) : 0;
        const spread = Math.sqrt(1 - center * center);
        const gains = [front * left * spread, front * right * spread, rear * left, rear * right];
        if (channels === 5) gains.push(center);
        return gains.map(gain => gain < 1e-8 ? 0 : gain * route.trim);
    });
}

class Synth {
    constructor() {
        this.reset();
    }

    reset() {
        this.phase = 0;
        this.whistlePhase = 0;
        this.rpm = 0;
        this.gain = 0;
        this.load = 0;
        this.lift = 0;
        this.overrun = 0;
        this.pops = 0;
        this.popDelay = 0;
        this.matrix = null;
        this.voicing = null;
        this.pedal = null;
        this.noise = 137;
        this.low = 0;
    }

    transition(next) {
        if (this.voicing === null) {
            this.voicing = Object.assign({}, next, { character: Object.assign({}, next.character), turboStyle: Object.assign({}, next.turboStyle), voice: next.voice.slice() });
            return this.voicing;
        }
        const voice = this.voicing;
        for (const key of ['engine', 'exhaust', 'turbo', 'bass', 'lift', 'bang', 'engineGain', 'turboGain',
            'exhaustGain', 'liftGain', 'uneven', 'bassGain', 'depth', 'boost']) {
            voice[key] += (next[key] - voice[key]) * 0.35;
        }
        voice.pulses = (voice.pulses || 4) + ((next.pulses || 4) - (voice.pulses || 4)) * 0.35;
        for (const key of ['harmonic', 'body', 'rough']) {
            voice.character[key] += (next.character[key] - voice.character[key]) * 0.35;
        }
        for (const key of ['base', 'pitch', 'second']) voice.turboStyle[key] += (next.turboStyle[key] - voice.turboStyle[key]) * 0.35;
        for (let i = 0; i < voice.voice.length; i++) voice.voice[i] += (next.voice[i] - voice.voice[i]) * 0.35;
        return voice;
    }

    render(data, cfg, channels) {
        const pcm = Buffer.alloc(FRAMES * channels * 2);
        if (!cfg.enabled || !cfg.profileId || data.engine !== 'running' || data.rpm === null || data.rpm < 400) {
            this.reset();
            return pcm;
        }
        if (!data.pedal) this.pedal = null;
        else if (!this.pedal || this.pedal.sequence !== data.pedal.sequence) {
            if (this.pedal && data.pedal.at - this.pedal.at <= 1100 && this.pedal.value - data.pedal.value >= 0.16) {
                const release = this.pedal.value - data.pedal.value;
                this.lift = Math.max(this.lift, release);
                if (data.rpm >= 1400 && release >= 0.35 && cfg.voice.bang > 0 && cfg.voice.bangRate > 0) {
                    this.overrun = Math.max(this.overrun, release);
                    this.pops = Math.round(cfg.voice.bangRate * 3);
                    this.popDelay = 5100 - Math.round(cfg.voice.bangRate * 2300);
                }
            }
            this.pedal = data.pedal;
        }
        const targetLoad = data.pedal ? data.pedal.value : data.torque !== null ? clamp(data.torque / 600, 0, 1) : 0;
        const gearFactor = data.stage === 'N' || data.stage === 'P' ? 0.73 : data.stage === 'R' ? 0.6 : 1;
        const targetGain = cfg.gain * gearFactor * (data.idle === true ? 0.75 : 1);
        const nextMatrix = channelMatrix(cfg.routes, channels);
        if (!this.matrix || this.matrix[0].length !== channels) this.matrix = nextMatrix;
        else for (let i = 0; i < nextMatrix.length; i++) {
            for (let ch = 0; ch < channels; ch++) this.matrix[i][ch] += (nextMatrix[i][ch] - this.matrix[i][ch]) * 0.35;
        }
        const [engineRoute, turboRoute, exhaustRoute, bangRoute] = this.matrix;
        if (!cfg.voice.bang || !cfg.voice.bangRate) this.pops = 0;
        const boosting = data.pedal && data.pedal.value > 0.12 && data.rpm >= 1250;
        if (this.rpm === 0) this.rpm = data.rpm;
        const voice = this.transition(cfg.voice);
        for (let i = 0; i < FRAMES; i++) {
            this.rpm += (data.rpm - this.rpm) * 0.0005;
            this.load += (targetLoad - this.load) * 0.0008;
            this.gain = Math.min(cfg.ceiling, this.gain + (targetGain - this.gain) * 0.0014);
            const pulseHz = this.rpm * (voice.pulses || 4) / 60;
            this.phase = (this.phase + TAU * pulseHz / RATE) % (TAU * 4);
            this.whistlePhase = (this.whistlePhase + TAU * (voice.turboStyle.base + 1.2 * pulseHz + 1050 * this.load * voice.turboStyle.pitch) / RATE) % TAU;
            this.noise = (Math.imul(this.noise, 1664525) + 1013904223) | 0;
            const cycling = Math.sin(this.phase * 0.5);
            const roughness = Math.sin(this.phase * 0.25) * voice.uneven * voice.character.rough;
            const harmonics = voice.voice[0] * Math.sin(this.phase + roughness)
                + voice.character.harmonic * (voice.voice[1] * Math.sin(2 * this.phase)
                + voice.voice[2] * Math.sin(3 * this.phase + roughness)
                + voice.voice[3] * Math.sin(5 * this.phase));
            const exhaust = cycling * 0.5 + (this.noise / 2147483648) * (0.03 + 0.1 * this.load);
            this.low += (cycling - this.low) * 0.025;
            const whistle = Math.sin(this.whistlePhase) + voice.turboStyle.second * Math.sin(this.whistlePhase * 2);
            const boost = boosting ? voice.boost * 0.18 : 0;
            const turbo = whistle * (this.load * voice.turbo * voice.turboGain * (0.13 + boost)
                + this.lift * voice.lift * voice.liftGain * 0.55);
            this.lift *= 0.99992;
            if (this.pops && --this.popDelay <= 0) {
                this.overrun = 0.2 + 0.09 * this.pops;
                this.pops--;
                this.popDelay = 3300;
            }
            const overrun = this.overrun * voice.bang * (0.64 * this.noise / 2147483648 + 0.36 * cycling);
            this.overrun *= 0.99905;
            const engine = harmonics * voice.engine * voice.engineGain * (0.21 + 0.56 * this.load)
                + this.low * voice.bass * voice.bassGain * cfg.speaker.bass * voice.character.body
                    * voice.engineGain * (0.32 + 0.4 * voice.depth);
            const tailpipe = exhaust * voice.exhaust * voice.exhaustGain * (0.25 + 0.3 * this.load);
            for (let c = 0; c < channels; c++) {
                const mix = engine * engineRoute[c] + turbo * turboRoute[c] + tailpipe * exhaustRoute[c] + overrun * bangRoute[c];
                const sample = Math.tanh(mix) * this.gain * PEAK * 32767;
                pcm.writeInt16LE(Math.round(sample), 2 * (i * channels + c));
            }
        }
        return pcm;
    }
}

module.exports = { RATE, FRAMES, PEAK, MODES, profileSetting, resolveSettings, channelMatrix, Synth };
