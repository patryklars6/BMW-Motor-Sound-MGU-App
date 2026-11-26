'use strict';
// Derive the number of PCM blocks from elapsed time, not timer callback count.
class AudioClock {
    constructor() { this.next = null; this.skippedBlocks = 0; }
    reset() { this.next = null; }
    due(now) {
        if (this.next === null) this.next = now;
        if (now < this.next) return 0;
        let blocks = Math.floor((now - this.next) / 20) + 1;
        if (blocks > 3) { this.skippedBlocks += blocks - 3; blocks = 3; this.next = now - 40; }
        this.next += blocks * 20;
        return blocks;
    }
}
module.exports = { AudioClock };
