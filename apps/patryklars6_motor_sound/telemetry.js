'use strict';

const { languageOf } = require('./i18n');
const UNITS = 'de.bmw.infotainment.vehicle.Vehicle';
const CDS = 'de.bmw.infotainment.vehicle.CDS';
const CDS2 = 'de.bmw.infotainment.vehicle.CDS2';
const VEHICLE = 'de.bmw.infotainment.vehicle.Vehicle2';
const GEAR = 'de.bmw.infrastructure.VehicleInformation';
const FES = 'de.bmw.infotainment.drivingexcitement.FES';
const PEDAL = 'de.bmw.powertrain.AcceleratorPedal';
const RPM_MAX_AGE = 1000;
const STATE_MAX_AGE = 8000;
const MOVING_MAX_AGE = 1500;

const ENGINE = {
    0: 'off', 1: 'starting', 2: 'running',
    MOTOR_AUS: 'off', MOTOR_STARTET: 'starting', MOTOR_LAEUFT: 'running'
};
const MODE = {
    1: 'sport', 2: 'sportPlus', 3: 'individualMode', 4: 'comfort', 5: 'comfort', 6: 'individualMode',
    7: 'eco', 8: 'eco', 9: 'individualMode',
    SPORT: 'sport', SPORT_DYNAMIC: 'sport', SPORT_EXPERT: 'sportPlus', SPORT_PLUS: 'sportPlus', SPORT_INDIVIDUAL: 'individualMode',
    COMFORT: 'comfort', COMFORT_STANDARD: 'comfort', COMFORT_PLUS: 'comfort', COMFORT_INDIVIDUAL: 'individualMode',
    ECO_PRO: 'eco', ECO_PRO_EFFICIENT: 'eco', ECO_PRO_PLUS: 'eco', ECO_PRO_INDIVIDUAL: 'individualMode', INDIVIDUAL: 'individualMode'
};
const NOTIFY_ONLY_STATES = new Set(['engine', 'mode', 'gearbox', 'gearSelection', 'speed', 'language']);
const SELECTOR = { 1: 'P', 2: 'R', 3: 'N', 4: 'D', P: 'P', R: 'R', N: 'N', D: 'D' };

function lookup(table, key) {
    return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
}

function scaled(raw, max, factor, offset) {
    return Number.isInteger(raw) && raw >= 0 && raw <= max ? raw * factor + (offset || 0) : null;
}

function gearbox(v) {
    const raw = v.statusActualGearDrive;
    const stage = lookup(SELECTOR, v.statusActualStageDrive);
    if (stage === 'P' || stage === 'N' || stage === 'R') return { stage, gear: null };
    const n = typeof raw === 'number' ? raw : /^G([1-9]|10)$/.test(raw) ? Number(raw.slice(1)) + 2 : null;
    if (n === 1 || raw === 'R') return { stage: stage || 'R', gear: null };
    if (n === 2 || raw === 'N_OR_P') return { stage, gear: null };
    if (Number.isInteger(n) && n >= 3 && n <= 12) return { stage, gear: n - 2 };
    return stage ? { stage, gear: null } : null;
}

function selection(v) {
    const raw = v.statusGearSelectionDrive;
    const named = lookup({ N: 1, R: 2, P: 3, NP: 4 }, raw);
    const n = typeof raw === 'number' ? raw : named || (/^_[1-9]$/.test(raw) ? Number(raw.slice(1)) + 4 : null);
    if (n === 1 || n === 2 || n === 3) return { stage: ['N', 'R', 'P'][n - 1], gear: null };
    if (n === 4) return { stage: null, gear: null };
    if (Number.isInteger(n) && n >= 5 && n <= 13) return { stage: 'D', gear: n - 4 };
    return null;
}

class Telemetry {
    constructor(clock) {
        this.clock = clock;
        this.samples = Object.create(null);
        this.nextSequence = 0;
    }

    put(key, value, retainWhileAvailable) {
        if (value === null) delete this.samples[key];
        else this.samples[key] = { value, at: this.clock(), retained: !!retainWhileAvailable && NOTIFY_ONLY_STATES.has(key), sequence: this.nextSequence++ };
    }

    watchGroups() {
        const put = (key, decode) => ({ key, decode: (v, retain) => this.put(key, v ? decode(v) : null, retain) });
        return {
            [UNITS]: { statusNewCurrentUnitsStatusExt: put('language', v => languageOf(v.language)) },
            [CDS]: {
                statusEngineSpeed2: put('rpm', v => scaled(v.actualValueRPMEngineCrankshaft, 48000, 0.25)),
                statusEngineStatus: put('engine', v => lookup(ENGINE, v.statusEngineRunDrive))
            },
            [CDS2]: { statusLongitudinalAccelerationMassCenter: put('acceleration', v => {
                const value = scaled(v.longitudinalAccelerationCentreOfGravity, 65534, 0.002, -65);
                return value !== null && Math.abs(value) <= 30 ? value : null;
            }) },
            [VEHICLE]: { statusCarSpeed2: put('speed', v => scaled(v.speedVehicleCentreOfGravity, 25600, 0.015625)) },
            [GEAR]: { statusGearboxDrive: put('gearbox', gearbox), DataPowerTrain2: put('gearSelection', selection) },
            [FES]: {
                statusFESVehicleDynamicSwitchHMI: put('mode', v => lookup(MODE, v.actualValueModeDrivingExperience)),
                statusActualValueTorque2: put('torque', v => scaled(v.actualValueTorqueCrankshaft, 4094, 0.5, -1023.5))
            },
            [PEDAL]: { AngleAcceleratorPedal: put('pedal', v => scaled(v.actualValueAngleAcceleratorPedal, 4000, 0.00025)) }
        };
    }

    latest(key, age) {
        const sample = this.samples[key];
        const elapsed = sample ? this.clock() - sample.at : Infinity;
        return sample && elapsed >= 0 && (sample.retained || elapsed <= age) ? sample : null;
    }

    snapshot() {
        const val = (key, age) => {
            const sample = this.latest(key, age);
            return sample ? sample.value : null;
        };
        const first = this.latest('gearbox', STATE_MAX_AGE);
        const second = this.latest('gearSelection', STATE_MAX_AGE);
        let current = first;
        if (second && (!first || (second.value.stage !== null && second.sequence > first.sequence))) current = second;
        const stage = current ? current.value.stage : null;
        const gear = current ? current.value.gear : null;
        const engine = val('engine', STATE_MAX_AGE);
        const rpm = val('rpm', RPM_MAX_AGE);
        const speed = val('speed', MOVING_MAX_AGE);
        const acceleration = val('acceleration', MOVING_MAX_AGE);
        const pedal = this.latest('pedal', MOVING_MAX_AGE);
        const neutral = stage === null ? null : stage === 'N';
        const idle = engine === 'running' && rpm !== null && speed !== null && stage !== null && pedal
            ? (stage === 'N' || stage === 'P') && speed < 1 && pedal.value <= 0.03 && rpm >= 400 && rpm <= 1200
            : null;
        return { language: val('language', STATE_MAX_AGE), rpm, engine, speed, acceleration, stage, gear, neutral, idle, pedal, mode: val('mode', STATE_MAX_AGE), torque: val('torque', MOVING_MAX_AGE) };
    }
}

module.exports = { Telemetry, CDS, CDS2, VEHICLE, GEAR, FES, PEDAL };
