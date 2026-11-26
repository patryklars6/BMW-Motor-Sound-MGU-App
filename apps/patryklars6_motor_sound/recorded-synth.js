'use strict';
const { RecordedAudio, INSTALLED_ROOT } = require('./recorded-audio');
const { SoundEvents } = require('./sound-events');
const RATE = 48000, FRAMES = 960, PEAK = .36;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

class RecordedSynth {
    constructor(matrix) {
        this.channelMatrix = matrix;
        this.audio = new RecordedAudio();
        this.error = this.audio.bank.error;
        this.currentPack = 'builtin';
        this.events = { lift: 0, upshift: 0, downshift: 0, shutdown: 0, last: null };
        this.reset();
    }
    reset() {
        this.audio.reset(); this.tracker = new SoundEvents();
        this.rpm = 0; this.gain = 0; this.load = 0; this.lift = 0; this.overrun = 0;
        this.pops = 0; this.popDelay = 0; this.bangIndex = 0; this.matrix = null; this.voicing = null;
        this.low = 0; this.exhaustLow = 0; this.turboLow = 0; this.spool = 0; this.duck = 0;
        this.wasRunning = false; this.stopLatched = false; this.tailFrames = 0;
    }
    running(data) { return data.engine === 'running' && Number.isFinite(data.rpm) && data.rpm >= 400 && data.rpm <= 12000; }
    parkedOff(data) { return data.engine === 'off' && data.rpm === 0 && data.speed === 0 && data.stage === 'P'; }
    wantsAudio(data, cfg) {
        const selected = cfg.audioPack || 'builtin';
        if (selected !== this.currentPack) {
            this.currentPack = selected; this.audio = new RecordedAudio(selected === 'installed' ? INSTALLED_ROOT : undefined, selected === 'installed');
            this.error = this.audio.bank.error; this.reset();
        }
        if (this.error || !cfg.enabled || !cfg.profileId || !(cfg.gain > 0)) return false;
        if (this.running(data)) return true;
        return cfg.voice.shutdownTailOn && this.parkedOff(data) && (this.tailFrames > 0 || (this.wasRunning && !this.stopLatched));
    }
    transition(next) {
        if (!this.voicing) {
            this.voicing = Object.assign({}, next, { character: Object.assign({}, next.character), turboStyle: Object.assign({}, next.turboStyle) });
            return this.voicing;
        }
        const voice = this.voicing;
        Object.keys(next).forEach(key => {
            if (typeof next[key] === 'number') voice[key] += (next[key] - voice[key]) * .35;
            else if (key !== 'character' && key !== 'turboStyle') voice[key] = next[key];
        });
        ['character', 'turboStyle'].forEach(group => Object.keys(next[group]).forEach(key => {
            voice[group][key] += (next[group][key] - voice[group][key]) * .35;
        }));
        return voice;
    }
    crack(strength, cfg) {
        const voice = cfg.voice;
        this.audio.trigger('crack-' + (1 + this.bangIndex++ % 3),
            strength * voice.bang * (1.4 + voice.hardness * 2.2), 'bang', (.86 + voice.hardness * .28) * voice.popPitch);
    }
    burst(strength, cfg, count) {
        if (!(cfg.voice.bang > 0) || !(cfg.voice.bangRate > 0)) return;
        this.overrun = strength; this.crack(strength, cfg);
        this.pops = Math.max(this.pops, count - 1);
        this.popDelay = Math.round(RATE * (.15 - cfg.voice.bangRate * .065));
    }
    observe(data, cfg) {
        const event = this.tracker.observe(data), voice = cfg.voice;
        if (event.release) {
            this.lift = Math.max(this.lift, event.release);
            this.events.lift++; this.events.last = this.tracker.last;
            if (voice.liftGain > 0 && voice.lift > 0) this.audio.trigger('release',
                event.release * voice.lift * 2.5, 'turbo', voice.turboStyle.pitch);
        }
        if (data.rpm >= 1400 && event.overrun) this.burst(event.overrun, cfg, 1 + Math.round(voice.bangRate * 4));
        if (event.shift) {
            this.events[event.shift]++; this.events.last = this.tracker.last;
            if (voice.shiftOn && event.suitableShift) {
                this.duck = 1;
                if (voice.shiftTurboOn && voice.liftGain > 0 && !event.release) this.audio.trigger('release',
                    voice.shiftLevel * (.7 + voice.lift), 'turbo', voice.turboStyle.pitch * 1.18);
                if (voice.shiftBangOn && !event.overrun) this.burst(voice.shiftLevel * (event.shift === 'downshift' ? .55 : .85), cfg, 1 + Math.round(voice.bangRate));
            }
        }
        this.events.lastShift = this.tracker.shiftObservation;
    }
    render(data, cfg, channels) {
        const pcm = Buffer.alloc(FRAMES * channels * 2);
        if (!this.wantsAudio(data, cfg)) { this.reset(); return pcm; }
        const running = this.running(data);
        if (running) {
            this.wasRunning = true; this.stopLatched = false; this.tailFrames = 0;
            this.observe(data, cfg);
        } else if (!this.tailFrames && !this.stopLatched) {
            this.tailFrames = Math.round(RATE * .85); this.stopLatched = true; this.wasRunning = false;
            this.events.shutdown++; this.events.last = { kind: 'shutdown', source: 'measured motor off, RPM 0, speed 0, P' };
            this.audio.clear('bang'); this.pops = 0;
            this.audio.trigger('stop', cfg.voice.shutdownLevel * .75, 'stop', 1);
            if (cfg.voice.liftGain > 0) this.audio.trigger('release', cfg.voice.shutdownLevel * .65, 'turbo', .72);
        }
        if (!(cfg.voice.bang > 0) || !(cfg.voice.bangRate > 0) || !(cfg.voice.bangVolume > 0)) { this.audio.clear('bang'); this.pops = 0; }
        if (!(cfg.voice.liftGain > 0)) this.audio.clear('turbo');
        const voice = this.transition(cfg.voice);
        this.audio.select(voice.bank);
        const targetLoad = running ? data.pedal ? data.pedal.value : data.torque !== null ? clamp(data.torque / 600, 0, 1) : 0 : 0;
        const gearFactor = data.stage === 'N' || data.stage === 'P' ? .73 : data.stage === 'R' ? .6 : 1;
        const targetGain = cfg.gain * gearFactor * (data.idle === true ? .75 : 1);
        const nextMatrix = this.channelMatrix(cfg.routes, channels);
        if (!this.matrix || this.matrix[0].length !== channels) this.matrix = nextMatrix;
        else nextMatrix.forEach((row, layer) => row.forEach((value, channel) => {
            this.matrix[layer][channel] += (value - this.matrix[layer][channel]) * .35;
        }));
        const [engineRoute, turboRoute, exhaustRoute, bangRoute] = this.matrix;
        if (!this.rpm) this.rpm = data.rpm;
        const boosting = running && data.pedal && data.pedal.value > .12 && data.rpm >= 1250;
        const cutoff = .025 + voice.character.harmonic * .09;
        const turboFilter = clamp(.03 + voice.turboStyle.pitch * .17, .03, .4);
        for (let i = 0; i < FRAMES; i++) {
            if (!running && this.tailFrames <= 0) break;
            this.rpm += ((running ? data.rpm : 450) - this.rpm) * (running ? .0005 : .00008);
            this.load += (targetLoad - this.load) * .0008;
            this.gain = Math.min(cfg.ceiling, this.gain + (targetGain - this.gain) * .0014);
            const tail = running ? 1 : this.tailFrames-- / (RATE * .85);
            const raw = this.audio.engine(this.rpm);
            this.low += (raw - this.low) * .018;
            this.exhaustLow += (raw - this.exhaustLow) * cutoff;
            const drive = 1.4 + voice.uneven * 6 + voice.character.rough;
            const engine = (raw * (.68 + voice.character.harmonic * .32)
                + this.low * voice.bass * voice.bassGain * cfg.speaker.bass * voice.character.body * (1 + voice.depth * 2))
                * voice.engine * voice.engineGain * (.55 + this.load * .8) * (1 - this.duck * .32);
            const exhaust = Math.tanh(this.exhaustLow * drive) / Math.sqrt(drive)
                * voice.exhaust * voice.exhaustGain * (.6 + this.load * .9);
            this.spool += ((boosting ? this.load : 0) - this.spool) * .00012;
            const spool = this.audio.loop('spool', .5 * clamp(.55 + this.rpm / 7500 * voice.turboStyle.pitch, .4, 1.8));
            this.turboLow += (spool - this.turboLow) * turboFilter;
            const turboBed = (this.turboLow + voice.turboStyle.second * spool) * this.spool * voice.turbo * voice.turboGain
                * (1.2 + (boosting ? voice.boost * 2 : 0));
            if (this.pops && --this.popDelay <= 0) {
                this.crack(this.overrun * (.75 + this.pops * .06), cfg); this.pops--;
                this.popDelay = Math.round(RATE * (.15 - voice.bangRate * .065 + this.pops % 2 * .025));
            }
            const shots = this.audio.effects();
            this.duck *= .99915; this.lift *= .99992;
            for (let channel = 0; channel < channels; channel++) {
                const mix = engine * engineRoute[channel] + exhaust * exhaustRoute[channel]
                    + (turboBed + shots.turbo * voice.turboGain) * turboRoute[channel] + shots.bang * voice.bangVolume * bangRoute[channel]
                    + shots.stop * (voice.engineGain * engineRoute[channel] + voice.exhaustGain * exhaustRoute[channel]) * .5;
                pcm.writeInt16LE(Math.round(Math.tanh(mix * 1.3) * this.gain * PEAK * 32767 * tail), (i * channels + channel) * 2);
            }
        }
        return pcm;
    }
}
module.exports = { RecordedSynth };
