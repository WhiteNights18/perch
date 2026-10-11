// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {defaultState, decodeState} from './layout.js';
import {readText, writeText, ensureDirectory} from './io.js';

// Serial writes prevent an older note snapshot from replacing a newer one.
// The queue owns only immutable text and files, never Shell actors.
let writeQueue = Promise.resolve();

export class Store {
    constructor(onStatus, directory = GLib.build_filenamev([GLib.get_user_data_dir(), 'perch'])) {
        this.state = defaultState();
        this._directory = Gio.File.new_for_path(directory);
        this._file = this._directory.get_child('state.json');
        this._onStatus = onStatus;
        this._timer = 0;
        this._closed = false;
        this._writable = false;
        this._dirty = false;
        this._loadCancel = new Gio.Cancellable();
    }

    async load() {
        await writeQueue;
        try {
            this.state = decodeState(await readText(this._file.get_path(), this._loadCancel));
            this._writable = true;
        } catch (error) {
            if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                this._writable = true;
            else if (!this._closed)
                this._onStatus(`无法读取数据：${error.message}。本次不会覆盖原文件。`);
        }
        return this.state;
    }

    get writable() {
        return this._writable;
    }

    changed() {
        if (!this._writable || this._closed)
            return;
        this._dirty = true;
        if (this._timer)
            GLib.Source.remove(this._timer);
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this._timer = 0;
            this.flush();
            return GLib.SOURCE_REMOVE;
        });
    }

    flush() {
        if (!this._dirty || !this._writable)
            return writeQueue;
        this._dirty = false;
        const text = JSON.stringify(this.state, null, 2);
        const directory = this._directory;
        const file = this._file;
        writeQueue = writeQueue.then(async () => {
            await ensureDirectory(directory);
            await writeText(file, text);
            if (!this._closed)
                this._onStatus('');
        }).catch(error => {
            this._dirty = true;
            if (!this._closed)
                this._onStatus(`保存失败：${error.message}`);
            console.error(`[Perch] 保存失败：${error.message}`);
        });
        return writeQueue;
    }

    close() {
        this._closed = true;
        this._onStatus = null;
        this._loadCancel.cancel();
        if (this._timer)
            GLib.Source.remove(this._timer);
        this._timer = 0;
        this.flush();
    }
}
