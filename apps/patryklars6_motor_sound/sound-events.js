'use strict';
// Events use observed signal identities. No gear estimation from speed or RPM.
class SoundEvents {
    constructor() { this.reset(); }
    reset() {
        this.pedal = null; this.gear = null; this.elapsed = 0; this.lastShift = -10000;
        this.anchor = null; this.releaseArmed = true; this.bangArmed = true;
        this.previousRpm = null; this.shiftObservation = null; this.shiftFollow = 0; this.lastRelease = -10000;
        this.counts = { lift: 0, upshift: 0, downshift: 0, shutdown: 0 };
        this.last = null;
    }
    observe(data) {
        this.elapsed += 20;
        let release = 0, overrun = 0, shift = null;
        if (this.shiftFollow > 0 && Number.isFinite(data.rpm)) {
            this.shiftObservation.rpmAfter = data.rpm; this.shiftFollow--;
        }
        const pedal = data.pedal;
        if (!pedal) { this.pedal = null; this.anchor = null; }
        else if (!this.pedal || pedal.sequence !== this.pedal.sequence) {
            if (this.pedal && pedal.at >= this.pedal.at && pedal.at - this.pedal.at <= 1100 && pedal.value >= 0 && pedal.value <= 1) {
                if (!this.anchor || pedal.value >= this.anchor.value || pedal.value > this.pedal.value + .02) this.anchor = pedal;
                if (pedal.value >= .3 && pedal.value > this.pedal.value + .02) this.releaseArmed = this.bangArmed = true;
                const drop = this.anchor.value - pedal.value;
                if (pedal.at - this.anchor.at <= 650) {
                    if (drop >= .16 && this.releaseArmed) { release = drop; this.releaseArmed = false; }
                    if (drop >= .35 && this.bangArmed) { overrun = drop; this.bangArmed = false; }
                }
            } else { this.anchor = pedal; this.releaseArmed = this.bangArmed = true; }
            this.pedal = pedal;
        }
        const gear = data.gearSignal;
        if (!gear || data.stage !== 'D' || !Number.isInteger(data.gear) || data.gear < 1 || data.gear > 10) this.gear = null;
        else if (!this.gear || gear.sequence !== this.gear.sequence) {
            if (this.gear && this.gear.source === gear.source && gear.sequence > this.gear.sequence && gear.at >= this.gear.at
                && gear.gear !== this.gear.gear && data.speed !== null && data.speed > 1 && data.rpm >= 1400
                && this.elapsed - this.lastShift >= 120) {
                shift = gear.gear > this.gear.gear ? 'upshift' : 'downshift';
                this.lastShift = this.elapsed; this.counts[shift]++;
                this.shiftObservation = { kind: shift, from: this.gear.gear, to: gear.gear, source: gear.source,
                    rpmBefore: this.previousRpm, rpmAtShift: data.rpm, rpmAfter: null,
                    pedal: pedal ? pedal.value : null, torque: data.torque };
                this.shiftFollow = 20; this.last = this.shiftObservation;
            }
            this.gear = gear;
        }
        if (release) { this.counts.lift++; this.lastRelease = this.elapsed; this.last = { kind: 'lift', source: 'accelerator pedal', amount: release }; }
        const loaded = (pedal && pedal.value >= .18) || (Number.isFinite(data.torque) && data.torque >= 40);
        const coast = pedal && pedal.value <= .12 && ((Number.isFinite(data.torque) && data.torque < 0) || this.elapsed - this.lastRelease <= 1200);
        const suitableShift = shift === 'upshift' ? loaded && data.rpm >= 1800 : shift === 'downshift' ? coast && data.rpm >= 1600 : false;
        this.previousRpm = Number.isFinite(data.rpm) ? data.rpm : null;
        return { release, overrun, shift, suitableShift: !!suitableShift };
    }
}
module.exports = { SoundEvents };
