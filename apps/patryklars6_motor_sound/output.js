'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const { FRAMES } = require('./sound');

const SOCKET = '/run/luxo-motor-sound/pcm.sock';
const HELLO = 'LUXO/1 S16LE 48000\n';
const RETRY_MS = 3500;
const HANDSHAKE_MS = 18000;
const HEADER_LIMIT = 160;
const ERRORS = {
    ALSA_UNAVAILABLE: 'ALSA-Bibliothek des Audio-Dienstes ist nicht verfügbar',
    ALSA_ROUTE_MISSING: 'Audio-Dienst vorhanden · bestätigter ALSA-Mischpfad fehlt',
    ALSA_OPEN_FAILED: 'Audio-Mischpfad lässt sich nicht öffnen · Dienstprotokoll prüfen',
    ALSA_FORMAT_UNSUPPORTED: 'Audio-Mischpfad unterstützt das PCM-Format nicht',
    CONFIG_INVALID: 'Konfiguration des Audio-Dienstes ist ungültig',
    AUDIO_WRITE_FAILED: 'Schreibfehler am Audio-Mischpfad · Dienstprotokoll prüfen'
};
Object.assign(ERRORS, {
    MEDIA_UNSUPPORTED: 'BMW-Medienquelle auf dieser MGU nicht vollständig verfügbar · Diagnosebericht prüfen',
    MEDIA_SOURCE_BUSY: 'BMW-Medienquelle wird bereits von einer anderen Sitzung verwendet',
    MEDIA_CONNECT_FAILED: 'BMW-Audiomanager hat die Medienverbindung nicht bestätigt',
    MEDIA_CONNECT_TIMEOUT: 'BMW-Quelle erreicht keinen bestätigten Verbindungszustand',
    MEDIA_MANAGER_UNAVAILABLE: 'BMW-Audiodienste sind nicht erreichbar',
    MEDIA_SOURCE_LOST: 'Andere BMW-Audioquelle gewählt · Medienmodus zum Fortsetzen erneut auswählen',
    MEDIA_LOCK_UNSAFE: 'SmartX-Laufzeitrechte unerwartet · Ausgang wird nicht geöffnet',
    ENOENT: 'Audio-Socket fehlt · Dienstinstallation und Start prüfen',
    EACCES: 'Zugriff auf Audio-Dienst verweigert · UID und Socketrechte prüfen',
    ECONNREFUSED: 'Audio-Socket vorhanden, aber Dienst nimmt keine Verbindung an',
    UNTRUSTED_ENDPOINT: 'Audio-Socket oder sein Verzeichnis ist nicht vertrauenswürdig',
    DIAG_TIMEOUT: 'Audio-Diagnose antwortet nicht rechtzeitig',
    NO_RESPONSE: 'Audio-Dienst hat keine Diagnoseantwort gesendet',
    TEST_REQUIRED: 'Passender abgeschlossener Kanaltest fehlt oder ist abgelaufen',
    HEARING_CONFIRMATION_REQUIRED: 'Gehörte Zuordnung aller Kanäle muss ausdrücklich bestätigt werden',
    NO_APPROVED_ROUTE: 'Kein separat freigegebener Mischpfad ausgewählt', ROUTE_MISSING: 'Ausgewähltes ALSA-Gerät fehlt',
    ROUTE_CHANGED: 'Audioaufbau geändert · Pfadfreigabe erneut prüfen', PEER_DENIED: 'App-UID vom Audio-Dienst abgewiesen',
    ALSA_OPEN_TIMEOUT: 'Audiogerät antwortet beim Öffnen nicht', AUDIO_BUSY: 'Ein Audiostream ist bereits aktiv',
    AUDIO_WORKER_EXITED: 'ALSA-Ausgabeprozess beendet', PARK_REQUIRED: 'Audiotest benötigt Motor aus, P und Stillstand',
    ROUTE_NOT_SELECTABLE: 'Diese OEM- oder Standardquelle ist kein freigegebener Mischpfad',
    APPROVAL_REQUIRED: 'Separate Mischroute muss ausdrücklich freigegeben sein', NO_USB: 'Kein beschreibbarer USB-Datenträger erkannt'
});

function inspectSocket(socketPath) {
    try {
        const dir = fs.lstatSync(path.dirname(socketPath)), socket = fs.lstatSync(socketPath);
        const trusted = dir.isDirectory() && dir.uid === 0 && (dir.mode & 0o022) === 0 && socket.isSocket() && socket.uid === 0;
        return { exists: true, trusted, uid: socket.uid, gid: socket.gid, mode: (socket.mode & 0o777).toString(8),
            error: trusted ? null : 'UNTRUSTED_ENDPOINT' };
    } catch (error) { return { exists: error.code === 'ENOENT' ? false : null, trusted: false, error: error.code || 'STAT_FAILED' }; }
}

function trustedSocket(socketPath) {
    try {
        return inspectSocket(socketPath).trusted;
    } catch (e) {
        return false;
    }
}

class PcmOutput {
    constructor(clock, endpoint) {
        this.clock = clock;
        this.endpoint = endpoint || { trusted: () => trustedSocket(SOCKET), open: () => net.createConnection(SOCKET) };
        this.nextAttempt = 0;
        this.socket = null;
        this.channels = 0;
        this.blockedAt = null;
        this.state = 'waiting';
        this.detail = 'Audio-Dienst wird geprüft';
        this.timer = null;
        this.probing = false;
        this.acceptedBytes = 0;
        this.blocks = 0;
    }

    tick(active) {
        active = active !== false;
        const now = this.clock();
        if (this.socket && this.probing === active) this.close('waiting');
        if (this.socket) {
            if (this.blockedAt !== null && now - this.blockedAt > 40) {
                this.detail = 'Audioausgabe überlastet · Verbindung wird erneuert';
                this.close('waiting');
            }
            return;
        }
        if (now < this.nextAttempt) return;
        this.nextAttempt = now + RETRY_MS;
        if (!this.endpoint.trusted()) {
            this.detail = 'Audio-Dienst nicht erreichbar · luxo-motor-audio im Store prüfen';
            return;
        }
        try {
            const socket = this.endpoint.open();
            this.socket = socket;
            this.probing = !active;
            let header = '';
            this.timer = setTimeout(() => {
                if (this.socket === socket && this.channels === 0) {
                    this.detail = 'Audio-Dienst antwortet nicht rechtzeitig';
                    this.close('waiting');
                }
            }, HANDSHAKE_MS);
            const disconnected = error => {
                if (this.socket === socket) {
                    this.detail = error && error.code ? 'Audio-Socket: ' + error.code : 'Verbindung zum Audio-Dienst unterbrochen';
                    this.close('waiting');
                }
            };
            socket.on('error', disconnected);
            socket.on('end', disconnected);
            socket.on('close', disconnected);
            socket.on('connect', () => {
                if (this.socket === socket) socket.write(active ? HELLO : 'PROBE\n');
            });
            socket.on('drain', () => {
                if (this.socket === socket) this.blockedAt = null;
            });
            socket.on('data', chunk => {
                if (this.socket !== socket) return;
                if (header.length + chunk.length > HEADER_LIMIT) return this.close('waiting');
                header += chunk.toString('ascii');
                if (header.indexOf('\n') < 0) return;
                const error = /^ERROR ([A-Z_]+)\n$/.exec(header);
                if (error) {
                    this.detail = ERRORS[error[1]] || 'Audio-Dienst meldet einen Fehler';
                    return this.close('unavailable');
                }
                if (!active && /^STATUS available [245]\n$/.test(header)) {
                    this.detail = 'ALSA-Mischpfad vorhanden · Lautsprecherverbindung im Fahrzeug prüfen';
                    return this.close('available');
                }
                if (this.channels || !/^READY [245]\n$/.test(header)) {
                    this.detail = 'Audio-Dienst verwendet ein unbekanntes Protokoll';
                    return this.close('unavailable');
                }
                clearTimeout(this.timer);
                this.channels = Number(header[6]);
                header = '';
                this.state = 'connected';
                this.detail = 'PCM verbunden · ' + this.channels + ' Kanäle · Fahrzeugausgabe prüfen';
            });
            this.state = 'connecting';
        } catch (e) {
            this.close('waiting');
        }
    }

    write(pcm) {
        if (!this.socket || !this.channels || this.blockedAt !== null || pcm.length !== FRAMES * this.channels * 2) return;
        try {
            if (!this.socket.write(pcm)) this.blockedAt = this.clock();
            this.acceptedBytes += pcm.length;
            this.blocks++;
        } catch (e) {
            this.close('waiting');
        }
    }

    close(state) {
        clearTimeout(this.timer);
        this.timer = null;
        const socket = this.socket;
        if (socket) {
            this.nextAttempt = this.clock() + RETRY_MS;
            this.socket = null;
            socket.destroy();
        }
        this.channels = 0;
        this.blockedAt = null;
        this.state = state || 'waiting';
    }

    retry() {
        this.close();
        this.nextAttempt = 0;
    }
}

module.exports = { PcmOutput, inspectSocket, SOCKET, audioErrorText: code => ERRORS[code] || code };
