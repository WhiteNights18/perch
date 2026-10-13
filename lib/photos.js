// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import {PHOTO_PATTERN, photoOrder, photoTransform} from './photo-model.js';
const LIMIT = 500;
const MAX_BYTES = 64 * 1024 * 1024;
export async function photoFiles(path, cancel) {
    if (!GLib.path_is_absolute(path)) throw new Error('请在设置中选择本地图片或文件夹');
    const file = Gio.File.new_for_path(path);
    const info = await new Promise((resolve, reject) => file.query_info_async('standard::type,standard::size', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
        GLib.PRIORITY_DEFAULT, cancel, (f, result) => { try { resolve(f.query_info_finish(result)); } catch (e) { reject(e); } }));
    if (info.get_file_type() === Gio.FileType.REGULAR) {
        if (!PHOTO_PATTERN.test(file.get_basename())) throw new Error('请选择 PNG、JPEG、WebP、BMP 或 GIF');
        if (info.get_size() > MAX_BYTES) throw new Error('图片超过 64 MB，请选择较小图片');
        return {files: [path], directory: false, limited: false};
    }
    if (info.get_file_type() !== Gio.FileType.DIRECTORY) throw new Error('请选择本地图片或文件夹');
    const enumerator = await new Promise((resolve, reject) => file.enumerate_children_async('standard::name,standard::type,standard::size',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, cancel, (f, result) => {
            try { resolve(f.enumerate_children_finish(result)); } catch (e) { reject(e); }
        }));
    const names = [];
    let scanned = 0;
    let limited = false;
    try {
        while (true) {
            const batch = await new Promise((resolve, reject) => enumerator.next_files_async(100, GLib.PRIORITY_DEFAULT, cancel, (e, result) => {
                try { resolve(e.next_files_finish(result)); } catch (error) { reject(error); }
            }));
            if (!batch.length) break;
            for (const entry of batch) {
                if (entry.get_file_type() === Gio.FileType.REGULAR && entry.get_size() <= MAX_BYTES && !entry.get_name().startsWith('.') && PHOTO_PATTERN.test(entry.get_name())) names.push(entry.get_name());
            }
            scanned += batch.length;
            if (scanned >= 5000 || names.length >= LIMIT) { limited = true; break; }
        }
    } finally {
        await new Promise(resolve => enumerator.close_async(GLib.PRIORITY_DEFAULT, null, (e, result) => { try { e.close_finish(result); } catch (_) { /* Cancellation still closes the enumerator. */ } resolve(); }));
    }
    return {files: photoOrder(names).slice(0, LIMIT).map(n => file.get_child(n).get_path()), directory: true, limited};
}
export async function loadPhoto(path, cancel) {
    const sourceFile = Gio.File.new_for_path(path);
    const info = await new Promise((resolve, reject) => sourceFile.query_info_async('standard::type,standard::size', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, cancel, (f, result) => { try { resolve(f.query_info_finish(result)); } catch (e) { reject(e); } }));
    if (info.get_file_type() !== Gio.FileType.REGULAR || info.get_size() > MAX_BYTES) throw new Error('图片过大或不是普通文件');
    const stream = await new Promise((resolve, reject) => sourceFile.read_async(GLib.PRIORITY_DEFAULT, cancel, (file, result) => {
        try { resolve(file.read_finish(result)); } catch (error) { reject(error); }
    }));
    try {
        const pixbuf = await new Promise((resolve, reject) => GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, 1600, 1600, true, cancel, (_source, result) => {
            try { resolve(GdkPixbuf.Pixbuf.new_from_stream_finish(result)); } catch (error) { reject(error); }
        }));
        return pixbuf.apply_embedded_orientation();
    } finally {
        await new Promise(resolve => stream.close_async(GLib.PRIORITY_DEFAULT, null, (s, result) => { try { s.close_finish(result); } catch (_) { /* Best-effort close after cancellation. */ } resolve(); }));
    }
}
// Bound rendering memory, preserve aspect ratio, and mask only the corner pixels.
export function renderPhoto(pixbuf, width, height, fit, radius) {
    const ratio = Math.min(1, 1600 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    const r = Math.min(Math.round(radius * ratio), w / 2, h / 2);
    const t = photoTransform(pixbuf.width, pixbuf.height, w, h, fit);
    // Crop before scaling so extreme panorama aspect ratios cannot allocate huge buffers.
    let source = pixbuf;
    if (fit === 'cover') {
        const aspect = w / h;
        const cw = Math.max(1, Math.min(source.width, Math.round(source.height * aspect)));
        const ch = Math.max(1, Math.min(source.height, Math.round(source.width / aspect)));
        source = source.new_subpixbuf(Math.floor((source.width - cw) / 2), Math.floor((source.height - ch) / 2), cw, ch);
    }
    const scaled = source.scale_simple(fit === 'cover' ? w : t.width, fit === 'cover' ? h : t.height, GdkPixbuf.InterpType.BILINEAR).add_alpha(false, 0, 0, 0);
    const canvas = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, w, h);
    canvas.fill(0x151a22ff);
    scaled.copy_area(0, 0, scaled.width, scaled.height, canvas, fit === 'cover' ? 0 : t.x, fit === 'cover' ? 0 : t.y);
    const bytes = canvas.read_pixel_bytes().get_data();
    const stride = canvas.rowstride;
    for (let y = 0; y < Math.ceil(r); y++) {
        for (let x = 0; x < Math.ceil(r); x++) {
            const alpha = Math.max(0, Math.min(1, r - Math.hypot(r - x - 0.5, r - y - 0.5)));
            for (const [px, py] of [[x, y], [w - 1 - x, y], [x, h - 1 - y], [w - 1 - x, h - 1 - y]])
                bytes[py * stride + px * 4 + 3] = Math.round(bytes[py * stride + px * 4 + 3] * alpha);
        }
    }
    return {bytes: new GLib.Bytes(bytes), width: w, height: h, stride};
}
