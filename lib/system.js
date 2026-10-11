// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {readText} from './io.js';
import {parseCpu, cpuPercent, parseMemory} from './metrics.js';

export class SystemSampler {
    constructor(seconds, publish) {
        this._publish = publish;
        this._cancel = new Gio.Cancellable();
        this._closed = false;
        this._busy = false;
        this._previous = null;
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this.sample();
            return GLib.SOURCE_CONTINUE;
        });
        this.sample();
    }

    async sample() {
        if (this._closed || this._busy)
            return;
        this._busy = true;
        try {
            const [cpuText, memoryText] = await Promise.all([
                readText('/proc/stat', this._cancel), readText('/proc/meminfo', this._cancel),
            ]);
            const cpu = parseCpu(cpuText);
            const usage = this._previous ? cpuPercent(this._previous, cpu) : null;
            this._previous = cpu;
            if (!this._closed)
                this._publish({cpu: usage, memory: parseMemory(memoryText)});
        } catch (error) {
            if (!this._closed)
                this._publish({error: error.message});
        } finally {
            this._busy = false;
        }
    }

    destroy() {
        this._closed = true;
        this._cancel.cancel();
        GLib.Source.remove(this._timer);
        this._timer = 0;
        this._publish = null;
    }
}
