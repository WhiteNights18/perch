// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function readText(path, cancellable = null) {
    return new Promise((resolve, reject) => {
        Gio.File.new_for_path(path).load_contents_async(cancellable, (file, result) => {
            try {
                const [, bytes] = file.load_contents_finish(result);
                resolve(new TextDecoder().decode(bytes));
            } catch (error) {
                reject(error);
            }
        });
    });
}

export function writeText(file, text) {
    return new Promise((resolve, reject) => {
        file.replace_contents_async(new TextEncoder().encode(text), null, false,
            Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION,
            null, (target, result) => {
                try {
                    target.replace_contents_finish(result);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
    });
}

export function ensureDirectory(file) {
    return new Promise((resolve, reject) => {
        file.make_directory_async(GLib.PRIORITY_DEFAULT, null, (target, result) => {
            try {
                target.make_directory_finish(result);
                resolve();
            } catch (error) {
                if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                    resolve();
                else
                    reject(error);
            }
        });
    });
}
