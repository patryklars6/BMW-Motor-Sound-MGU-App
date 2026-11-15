'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const { FRAMES } = require('./sound');

const SOCKET = '/run/luxo-motor-sound/pcm.sock';
const HELLO = 'LUXO/1 S16LE 48000\n';
const RETRY_MS = 3500;
const HANDSHAKE_MS = 500;
const HEADER_LIMIT = 32;

function trustedSocket(socketPath) {
    try {
        const dir = fs.lstatSync(path.dirname(socketPath));
        const socket = fs.lstatSync(socketPath);
        return dir.isDirectory() && dir.uid === 0 && (dir.mode & 0o022) === 0 &&
            socket.isSocket() && socket.uid === 0 && (socket.mode & 0o002) === 0;
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
    }

    tick() {
        const now = this.clock();
        if (this.socket) {
            if (this.blockedAt !== null && now - this.blockedAt > 40) this.close('waiting');
            return;
        }
        if (now < this.nextAttempt) return;
        this.nextAttempt = now + RETRY_MS;
        if (!this.endpoint.trusted()) return;
        try {
            const socket = this.endpoint.open();
            this.socket = socket;
            let header = '';
            const timer = setTimeout(() => {
                if (this.socket === socket && this.channels === 0) this.close('waiting');
            }, HANDSHAKE_MS);
            const disconnected = () => {
                clearTimeout(timer);
                if (this.socket === socket) this.close('waiting');
            };
            socket.on('error', disconnected);
            socket.on('end', disconnected);
            socket.on('close', disconnected);
            socket.on('connect', () => {
                if (this.socket === socket) socket.write(HELLO);
            });
            socket.on('drain', () => {
                if (this.socket === socket) this.blockedAt = null;
            });
            socket.on('data', chunk => {
                if (this.socket !== socket) return;
                if (this.channels || header.length + chunk.length > HEADER_LIMIT) return this.close('waiting');
                header += chunk.toString('ascii');
                if (header.indexOf('\n') < 0) return;
                if (header !== 'READY 2\n' && header !== 'READY 4\n') return this.close('waiting');
                clearTimeout(timer);
                this.channels = Number(header[6]);
                this.state = 'connected';
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
        } catch (e) {
            this.close('waiting');
        }
    }

    close(state) {
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
}

module.exports = { PcmOutput };
