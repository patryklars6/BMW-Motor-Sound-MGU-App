'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const cp = require('child_process');
const { SOCKET, inspectSocket, audioErrorText } = require('./output');
const { FRAMES } = require('./sound');

function parked(data) { return data.speed !== null && data.speed === 0 && data.stage === 'P' && data.engine === 'off'; }
function readComponent() {
    try { return { installed: true, version: JSON.parse(fs.readFileSync('/var/opt/luxo-motor-audio/current/component.json', 'utf8')).version }; }
    catch (error) { return { installed: error.code === 'ENOENT' ? false : null, error: error.code || 'INVALID_JSON' }; }
}
function request(value, connect) {
    return new Promise((resolve, reject) => {
        if (!connect) {
            const endpoint = inspectSocket(SOCKET);
            if (!endpoint.trusted) return reject(Object.assign(Error('Audio-Socket nicht zugänglich oder nicht vertrauenswürdig'), { code: endpoint.error || 'UNTRUSTED_ENDPOINT' }));
        }
        const socket = connect ? connect() : net.createConnection(SOCKET);
        let data = '', finished = false;
        function finish(error, result) {
            if (finished) return; finished = true; clearTimeout(timer); socket.destroy();
            if (error) reject(error); else resolve(result);
        }
        const timer = setTimeout(() => finish(Object.assign(Error('Audio-Diagnose: Zeitüberschreitung'), { code: 'DIAG_TIMEOUT' })), 12000);
        socket.on('connect', () => socket.write('LUXO/2 ' + JSON.stringify(value) + '\n'));
        socket.on('error', error => finish(error));
        socket.on('end', () => { if (!finished) finish(Object.assign(Error('Keine Diagnoseantwort'), { code: 'NO_RESPONSE' })); });
        socket.on('data', chunk => {
            data += chunk.toString('utf8');
            if (data.length > 131072) return finish(Object.assign(Error('Diagnoseantwort zu groß'), { code: 'REPORT_LIMIT' }));
            if (data.indexOf('\n') < 0) return;
            try {
                if (data.indexOf('ERROR ') === 0) throw Object.assign(Error(audioErrorText(data.trim().slice(6))), { code: data.trim().slice(6) });
                const result = JSON.parse(data);
                if (!result.ok) throw Object.assign(Error(audioErrorText(result.error)), { code: result.error, detail: result.detail });
                finish(null, result.data);
            } catch (error) { finish(error); }
        });
    });
}
function unitStatus() {
    return new Promise(resolve => cp.execFile('systemctl', ['show', 'luxo-motor-audio.socket', 'luxo-motor-audio.service',
        '--property=Id,LoadState,ActiveState,SubState,Result,MainPID', '--no-pager'], { timeout: 2000, maxBuffer: 16384, encoding: 'utf8' },
        (error, stdout) => resolve(error ? { error: error.code || String(error.message).slice(0, 160) } : { observations: stdout.slice(0, 16384) })));
}

class AudioDiagnostics {
    constructor(options) {
        Object.assign(this, options);
        this.page = 'root'; this.offset = 0; this.version = 0; this.busy = false;
        this.message = 'Noch nicht geprüft'; this.service = null; this.error = null; this.local = null;
        this.selected = null; this.channelChoice = 2; this.testResult = null; this.testing = false; this.cancelTest = () => {};
        this.rpc = options.rpc || (value => request(value));
    }
    async refresh(extended) {
        if (this.busy) return;
        this.busy = true; this.message = 'Audio-Diagnose läuft'; this.version++;
        try {
            this.local = { component: readComponent(), socket: inspectSocket(SOCKET),
                uid: process.getuid ? process.getuid() : null, gid: process.getgid ? process.getgid() : null,
                groups: process.getgroups ? process.getgroups() : [], systemd: extended !== false || !this.local ? await unitStatus() : this.local.systemd };
            const next = await this.rpc({ op: 'diagnose', extended: extended !== false });
            if (extended === false && this.service) {
                next.systemd = this.service.systemd; next.audioManager = this.service.audioManager;
            }
            this.service = next;
            this.error = null;
            this.message = this.service.routeError ? audioErrorText(this.service.routeError.code) : 'Dienst erreichbar · Fahrzeugausgabe separat prüfen';
        } catch (error) {
            this.service = null; this.error = { code: error.code || 'DIAG_FAILED', message: error.message };
            this.message = audioErrorText(this.error.code) || error.message;
        } finally { this.busy = false; this.version++; }
    }
    maybeRefresh() {
        if (!this.busy && Date.now() >= (this.nextRefresh || 0)) {
            this.nextRefresh = Date.now() + 5000; void this.refresh(false);
        }
    }
    snapshot() {
        const data = this.vehicle.snapshot(), cfg = this.effective ? this.effective(data.mode) : null;
        return { schema: 1, appId: this.spec.id, appVersion: this.spec.version, createdAt: new Date().toISOString(),
            local: this.local, service: this.service, error: this.error,
            engine: this.engine ? Object.assign({}, this.engine) : null,
            transport: { state: this.output.state, pcmChannels: this.output.channels,
                bytesQueuedToSocket: this.output.acceptedBytes || 0, blocks: this.output.blocks || 0 },
            vehicle: data, configuration: cfg ? { enabled: cfg.enabled, profileId: cfg.profileId, automatic: cfg.auto,
                level: cfg.level, limit: cfg.limit, voice: cfg.voice, routes: cfg.routes } : null,
            applicationGate: this.gate(), amplifierSelection: { value: this.settings.get('speakers'), source: 'user setting', automaticallyVerified: false },
            testResult: this.testResult, audibleOutputAutomaticallyVerified: false };
    }
    gate() {
        const data = this.vehicle.snapshot(), cfg = this.effective ? this.effective(data.mode) : null;
        if (!cfg) return 'Konfiguration nicht erfasst';
        if (!cfg.enabled) return 'Motorsound ausgeschaltet';
        if (!cfg.profileId) return 'Automatik wartet auf Fahrmodus · Profil manuell wählen';
        if (!(cfg.gain > 0)) return 'App-Pegel oder Pegelgrenze ist null';
        if (cfg.voice && !cfg.voice.engineGain && !cfg.voice.turboGain && !cfg.voice.exhaustGain && !cfg.voice.bang) return 'Alle Klangebenen sind stumm';
        if (data.engine !== 'running') return 'Motor nicht als laufend gemeldet';
        if (data.rpm === null) return 'Frische Drehzahl fehlt';
        if (data.rpm < 400) return 'Drehzahl unter Wiedergabeschwelle';
        return 'Motor- und Profilfreigabe vorhanden';
    }
    async save() {
        if (!this.dataDir) { this.message = 'App-Datenverzeichnis nicht verfügbar'; this.version++; return; }
        try {
        const directory = path.join(this.dataDir, 'diagnostics');
        if (!fs.existsSync(directory)) fs.mkdirSync(directory);
        const file = path.join(directory, 'audio-report.json'), temp = file + '.tmp';
        fs.writeFileSync(temp, JSON.stringify(this.snapshot(), null, 2) + '\n', { mode: 0o600 });
        fs.renameSync(temp, file);
        this.saved = file; this.message = 'Diagnosebericht in App-Daten gespeichert'; this.version++;
        return file;
        } catch (error) { this.message = 'Bericht nicht gespeichert: ' + (error.code || error.message); this.version++; return null; }
    }
    async operation(value) {
        try { const result = await this.rpc(value); this.message = 'Gespeichert'; this.version++; return result; }
        catch (error) { this.message = audioErrorText(error.code) || error.message; this.version++; return null; }
    }
    async select() {
        if (await this.operation({ op: 'select', device: this.selected, channels: this.channelChoice, approvedOverlay: true })) {
            this.page = 'root'; this.offset = 0; this.output.retry(); await this.refresh();
        }
    }
    backSub() { if (this.page === 'root') return false; this.page = 'root'; this.offset = 0; this.version++; return true; }
    turn(step, size) {
        size = size || 5;
        const max = Math.floor((this.rows().length - 1) / size) * size;
        this.offset = Math.max(0, Math.min(max, this.offset + step * size)); this.version++;
    }
    rows() {
        this.maybeRefresh();
        const row = (id, label, value, action) => ({ id, label, value: String(value === undefined || value === null ? 'Nicht verfügbar' : value), action });
        const service = this.service || {}, inventory = service.inventory || {}, route = service.route || {}, negotiated = service.negotiated || {};
        const usable = route.approvedOverlay && !service.routeError;
        const open = page => { this.page = page; this.offset = 0; this.version++; };
        if (this.page === 'devices') return (inventory.devices || []).map((item, index) => row('device-' + index, item.name,
            item.selectable ? 'Sichtbar · Mischfunktion und Lautsprecher ungeprüft' : 'OEM-/Standardquelle · nicht als Overlay freigegeben', item.selectable ? () => {
                this.selected = item.name; this.channelChoice = 2; open('approve');
            } : null)).concat([row('device-note', 'Kein Gerät auswählbar?', 'Diagnosebericht exportieren; OEM-Quelle wird nicht automatisch übernommen')]);
        if (this.page === 'approve') return [row('chosen-device', 'ALSA-Gerät', this.selected),
            row('route-note', 'Voraussetzung', 'Separater Mischpfad muss vor Ort bereits freigegeben sein'),
            row('channels', 'Angeforderte PCM-Kanäle', this.channelChoice, () => { this.channelChoice = ({ 2: 4, 4: 5, 5: 2 })[this.channelChoice]; this.version++; }),
            row('approve', 'Freigegebenen Mischpfad verwenden', 'Bestätigt keine hörbare oder unabhängige Ausgabe', () => this.select())];
        if (this.page === 'usb') return (service.usbMounts || []).map((target, i) => row('usb-' + i, target, 'Diagnosebericht hier ablegen', async () => {
            await this.save(); const result = await this.operation({ op: 'export', target, report: this.snapshot() });
            if (result) { this.message = 'USB-Bericht: ' + result.path; this.exported = result.path; this.version++; }
        })).concat([row('usb-note', 'USB-Erkennung', 'Nur vorhandene beschreibbare USB-Mounts; kein Datenträger wird formatiert')]);
        const mapping = route.speakerMappingVerified ? 'Vom Benutzer nach Kanaltest bestätigt' : 'Nicht am Lautsprecher überprüft';
        const local = this.local || {}, component = local.component || {}, socketInfo = local.socket || {};
        return [row('refresh', 'Diagnose aktualisieren', this.busy ? 'Läuft' : this.message, () => this.refresh()),
            row('installed', 'Audio-Dienst installiert', component.installed === true ? component.version : component.installed === false ? 'Nicht gefunden' : 'Unbekannt · ' + (component.error || 'noch nicht geprüft')),
            row('started', 'Audio-Dienst gestartet / erreichbar', service.serviceStarted ? 'Ja · PID ' + service.pid : 'Nicht bestätigt · ' + (this.error ? this.error.code : 'noch nicht geprüft')),
            row('socket', 'Socket-Verbindung', service.serviceStarted ? 'Erfolgreich' : socketInfo.error || 'Noch nicht geprüft'),
            row('engine', 'PCM-Engine', this.engine ? this.engine.blocks + ' erzeugte Blöcke · Motorstatus ' + (this.vehicle.snapshot().engine || 'unbekannt') : 'Nicht geprüft'),
            row('gate', 'Motor- und Profilfreigabe', this.gate()),
            row('route', 'Audiopfad', route.device ? (service.stream ? 'Aktiv: ' : 'Ausgewählt, kein Stream: ') + route.device : 'Kein freigegebener Mischpfad'),
            row('devices', 'Audiogeräte anzeigen / auswählen', (inventory.devices || []).length + ' sichtbare ALSA-PCMs', () => open('devices')),
            row('pcm-channels', 'ALSA-PCM-Kanäle', negotiated.channels ? negotiated.channels + ' angenommen · Angebote ' + (negotiated.supportedChannels || []).join(', ') : 'Erst nach erfolgreichem Öffnen bekannt'),
            row('mapping', 'Lautsprecherzuordnung', mapping),
            row('stream', 'PCM-Ausgabe an ALSA', service.stream ? service.stream.writtenFrames + ' angenommene Frames' : 'Kein aktiver Stream'),
            row('ram', 'RAM-Modul / Verstärker', 'Nicht automatisch identifiziert · Auswahl ist Benutzervorgabe'),
            row('manager', 'BMW-Audiomanager', service.audioManager ? service.audioManager.available ? 'Lesend erreichbar · Details im Bericht' : service.audioManager.error : 'Nicht geprüft'),
            row('music', 'Parallele Musik / BMW-Lautstärke', 'Am Fahrzeug nicht bestätigt; App-Pegel betrifft nur eigene PCM-Daten'),
            row('test-stereo', 'Leisen Stereo-Test starten', parked(this.vehicle.snapshot()) ? 'Nur freigegebener Pfad · maximal 2 % PCM-Peak' : 'Gesperrt · benötigt Motor aus, P, Geschwindigkeit 0', usable && parked(this.vehicle.snapshot()) && !this.testing ? () => this.test(2) : null),
            row('test-multi', 'Leisen Mehrkanaltest starten', route.channels > 2 ? route.channels + ' angeforderte Kanäle; ALSA prüft Unterstützung' : 'Nur bei ausgewähltem Mehrkanalpfad', usable && route.channels > 2 && parked(this.vehicle.snapshot()) && !this.testing ? () => this.test(route.channels) : null),
            row('heard', 'Gehörte Kanalzuordnung bestätigen', 'Nur nach tatsächlich gehörtem Test aller angeforderten Kanäle', this.testResult && this.testResult.writtenFrames > 0 && this.testResult.channels === route.channels && parked(this.vehicle.snapshot()) ? async () => {
                if (await this.operation({ op: 'confirm', testId: this.testResult.id, heardAllChannels: true })) await this.refresh();
            } : null),
            row('stop-test', 'Audiotest stoppen', this.testing ? 'Test läuft' : 'Kein Test aktiv', this.testing ? () => this.cancelTest() : null),
            row('save', 'Diagnosebericht speichern', this.saved || 'JSON in den bestehenden App-Daten', () => this.save()),
            row('usb', 'Diagnosebericht auf USB exportieren', (service.usbMounts || []).length ? 'Beschreibbaren USB-Datenträger wählen' : 'Kein beschreibbarer USB-Mount bestätigt', () => open('usb')),
            row('error', 'Ausgabehindernis', service.lastError ? audioErrorText(service.lastError.code) : service.routeError ? audioErrorText(service.routeError.code) : this.message)];
    }
    test(channels, connect) {
        if (this.testing || !parked(this.vehicle.snapshot())) return;
        if (!connect && !inspectSocket(SOCKET).trusted) { this.message = 'Audiotest: kein vertrauenswürdiger Socket'; this.version++; return; }
        this.testing = true; this.testResult = null; this.output.close(); this.version++;
        const socket = connect ? connect() : net.createConnection(SOCKET);
        let text = '', timer, ticks = 0, count = 0, complete = false;
        const timeout = setTimeout(() => finish('Audiotest: Zeitüberschreitung'), 15000);
        const finish = message => { if (complete) return; complete = true; clearTimeout(timeout); clearInterval(timer); socket.destroy(); this.testing = false; this.message = message; this.version++; };
        this.cancelTest = () => finish('Audiotest gestoppt');
        socket.on('error', error => finish('Audiotest: ' + (error.code || error.message)));
        socket.on('end', () => finish(this.testResult ? 'Testdaten an ALSA übertragen · hörbare Zuordnung noch bestätigen' : 'Test ohne Übertragungsbestätigung beendet'));
        socket.on('connect', () => socket.write('LUXO/2 ' + JSON.stringify({ op: 'test', stationary: true, park: true, engineOff: true, channels }) + '\n'));
        socket.on('data', chunk => {
            text += chunk.toString('utf8');
            if (text.length > 8192) return finish('Ungültige Testantwort');
            while (text.indexOf('\n') >= 0) {
                const at = text.indexOf('\n'), line = text.slice(0, at); text = text.slice(at + 1);
                if (/^ERROR /.test(line)) return finish(audioErrorText(line.slice(6)));
                if (/^READY [245]$/.test(line) && !timer) {
                    count = Number(line.slice(6));
                    timer = setInterval(() => {
                        if (!parked(this.vehicle.snapshot())) return finish('Audiotest abgebrochen · Fahrzeug nicht sicher abgestellt');
                        if (ticks >= count * 50) { clearInterval(timer); return socket.end(); }
                        const channel = Math.floor(ticks / 50), part = ticks % 50, frame = Buffer.alloc(FRAMES * count * 2);
                        if (part === 0) { this.message = 'Audiotest ' + (channel + 1) + '/' + count + ': ' + ['Vorn links', 'Vorn rechts', 'Hinten links', 'Hinten rechts', 'Center'][channel] + ' erwartet'; this.version++; }
                        if (part < 30) for (let i = 0; i < FRAMES; i++) {
                            const sample = part * FRAMES + i, edge = Math.min(1, sample / 480, (30 * FRAMES - sample) / 480);
                            const value = Math.round(491 * edge * Math.sin(2 * Math.PI * (440 + channel * 110) * sample / 48000));
                            frame.writeInt16LE(value, (i * count + channel) * 2);
                        }
                        ticks++;
                        if (!socket.write(frame)) finish('Audiotest gestoppt · Ausgabestau');
                    }, 20);
                } else if (line.indexOf('TEST_DONE ') === 0) {
                    try { this.testResult = JSON.parse(line.slice(10)); }
                    catch (error) { return finish('Ungültiger Testbericht'); }
                    finish('PCM-Test beendet · hörbare Kanalzuordnung nicht automatisch bestätigt');
                }
            }
        });
    }
}
module.exports = { AudioDiagnostics, request, parked };
