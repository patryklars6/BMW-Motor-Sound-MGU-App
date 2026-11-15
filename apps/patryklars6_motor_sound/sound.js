'use strict';

const RATE = 48000;
const FRAMES = 960;
const PEAK = 0.36;
const TAU = 2 * Math.PI;

const PROFILES = {
    v8: { label: 'V8 Sound', engine: 0.77, exhaust: 0.75, turbo: 0.13, bass: 0.62, lift: 0.17, voice: [1, 0.46, 0.22, 0.09], uneven: 0.19 },
    f90: { label: 'BMW M5 F90', engine: 0.82, exhaust: 0.64, turbo: 0.35, bass: 0.51, lift: 0.33, voice: [0.91, 0.55, 0.34, 0.21], uneven: 0.1 },
    m: { label: 'BMW M Sound', engine: 0.73, exhaust: 0.69, turbo: 0.22, bass: 0.39, lift: 0.27, voice: [0.78, 0.42, 0.48, 0.23], uneven: 0.065 }
};
const SPEAKERS = {
    standard: { label: 'Standard', trim: 0.76, bass: 0.3, rear: true },
    hifi: { label: 'BMW HiFi', trim: 0.82, bass: 0.4, rear: true },
    hk: { label: 'Harman Kardon', trim: 0.78, bass: 0.46, rear: true },
    bw: { label: 'Bowers & Wilkins', trim: 0.72, bass: 0.44, rear: true },
    up8: { label: 'MATCH UP 8', trim: 0.72, bass: 0.43, rear: true },
    up10: { label: 'MATCH UP 10', trim: 0.7, bass: 0.45, rear: true },
    other: { label: 'Sonstiges', trim: 0.7, bass: 0.5, rear: true }
};
const MODES = {
    eco: { label: 'ECO PRO', profile: 'v8', level: 0.35 },
    comfort: { label: 'COMFORT', profile: 'v8', level: 0.55 },
    sport: { label: 'SPORT', profile: 'f90', level: 0.8 },
    sportPlus: { label: 'SPORT PLUS', profile: 'm', level: 1 }
};

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
    const voice = individual ? Object.assign({}, preset, {
        engine: percent(get('engine'), 0.6), turbo: percent(get('turbo'), 0.3),
        exhaust: percent(get('exhaust'), 0.5), bass: percent(get('bass'), 0.5), lift: percent(get('lift'), 0.3)
    }) : preset;
    const requestedSpeaker = get('speakers');
    const speakerId = has(SPEAKERS, requestedSpeaker) ? requestedSpeaker : 'standard';
    const speaker = speakerId === 'other' ? Object.assign({}, SPEAKERS.other, {
        rear: get('rear') !== false, trim: percent(get('otherTrim'), 0.7), bass: percent(get('otherBass'), 0.5)
    }) : SPEAKERS[speakerId];
    const balance = percent(get('balance'), 0, -1);
    const fader = speaker.rear ? percent(get('fader'), 0, -1) : -1;
    const left = Math.cos((balance + 1) * Math.PI / 4);
    const right = Math.sin((balance + 1) * Math.PI / 4);
    const front = fader === 1 ? 0 : Math.cos((fader + 1) * Math.PI / 4);
    const rear = fader === -1 ? 0 : Math.sin((fader + 1) * Math.PI / 4);
    const gains = [left * front, right * front, left * rear, right * rear].map(gain => gain < 1e-8 ? 0 : gain);
    const level = percent(get('level'), 0.3);
    const limit = percent(get('limit'), 0.55);
    const ceiling = Math.min(level, limit);
    return {
        auto, profileId, profileLabel: individual ? 'Individual' : profileId ? preset.label : null,
        speaker, voice, gains, level, limit, ceiling,
        gain: ceiling * speaker.trim * (drive ? drive.level : 1),
        enabled: get('enabled') === true
    };
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
        this.pedal = null;
        this.noise = 137;
        this.low = 0;
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
                this.lift = Math.max(this.lift, this.pedal.value - data.pedal.value);
            }
            this.pedal = data.pedal;
        }
        const targetLoad = data.pedal ? data.pedal.value : data.torque !== null ? clamp(data.torque / 600, 0, 1) : 0;
        const gearFactor = data.stage === 'N' || data.stage === 'P' ? 0.73 : data.stage === 'R' ? 0.6 : 1;
        const targetGain = cfg.gain * gearFactor * (data.idle === true ? 0.75 : 1);
        const gains = channels === 4 ? cfg.gains :
            [Math.hypot(cfg.gains[0], cfg.gains[2]), Math.hypot(cfg.gains[1], cfg.gains[3])];
        if (this.rpm === 0) this.rpm = data.rpm;
        const voice = cfg.voice;
        for (let i = 0; i < FRAMES; i++) {
            this.rpm += (data.rpm - this.rpm) * 0.0005;
            this.load += (targetLoad - this.load) * 0.0008;
            this.gain = Math.min(cfg.ceiling, this.gain + (targetGain - this.gain) * 0.0014);
            const pulseHz = this.rpm / 15;
            this.phase = (this.phase + TAU * pulseHz / RATE) % (TAU * 4);
            this.whistlePhase = (this.whistlePhase + TAU * (530 + 1.2 * pulseHz + 1050 * this.load) / RATE) % TAU;
            this.noise = (Math.imul(this.noise, 1664525) + 1013904223) | 0;
            const cycling = Math.sin(this.phase * 0.5);
            const roughness = Math.sin(this.phase * 0.25) * voice.uneven;
            const harmonics = voice.voice[0] * Math.sin(this.phase + roughness)
                + voice.voice[1] * Math.sin(2 * this.phase)
                + voice.voice[2] * Math.sin(3 * this.phase + roughness)
                + voice.voice[3] * Math.sin(5 * this.phase);
            const exhaust = cycling * 0.5 + (this.noise / 2147483648) * (0.03 + 0.1 * this.load);
            this.low += (cycling - this.low) * 0.025;
            const turbo = Math.sin(this.whistlePhase) * (this.load * voice.turbo * 0.13 + this.lift * voice.lift * 0.55);
            this.lift *= 0.99992;
            const mix = harmonics * voice.engine * (0.21 + 0.56 * this.load)
                + exhaust * voice.exhaust * (0.25 + 0.3 * this.load)
                + this.low * voice.bass * cfg.speaker.bass * 0.52 + turbo;
            const sample = Math.tanh(mix) * this.gain * PEAK * 32767;
            for (let c = 0; c < channels; c++) {
                pcm.writeInt16LE(Math.round(sample * gains[c]), 2 * (i * channels + c));
            }
        }
        return pcm;
    }
}

module.exports = { RATE, FRAMES, PEAK, MODES, resolveSettings, Synth };
