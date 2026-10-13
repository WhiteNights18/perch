// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {photoFiles, loadPhoto, renderPhoto} from '../lib/photos.js';
import {column, label, button, sensitive} from './ui.js';

const positions = new Map();
export function createPhoto(settings) {
    const actor = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true, style_class: 'perch-photo'});
    const picture = new St.Widget({x_expand: true, y_expand: true, content_gravity: Clutter.ContentGravity.RESIZE_FILL});
    actor.add_child(picture);
    const empty = column('perch-photo-empty');
    empty.x_align = empty.y_align = Clutter.ActorAlign.CENTER;
    empty.add_child(new St.Icon({icon_name: 'image-x-generic-symbolic', icon_size: 44}));
    const message = label('把喜欢的画面放在桌面', 'perch-photo-message');
    message.x_align = Clutter.ActorAlign.CENTER;
    empty.add_child(message);
    const choose = new St.Button({label: '选择图片或文件夹', style_class: 'perch-photo-choose', can_focus: true});
    choose.connect('clicked', () => Extension.lookupByURL(import.meta.url)?.openPreferences());
    empty.add_child(choose);
    actor.add_child(empty);
    const controls = new St.BoxLayout({style_class: 'perch-photo-controls', x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.END});
    const previous = button('go-previous-symbolic', '上一张照片', () => show(-1));
    const pause = button('media-playback-pause-symbolic', '暂停轮播', () => settings.set_boolean('photo-paused', !settings.get_boolean('photo-paused')));
    const next = button('go-next-symbolic', '下一张照片', () => show(1));
    const count = label('', 'perch-photo-count');
    [previous, pause, next, count].forEach(c => controls.add_child(c));
    controls.visible = false;
    actor.add_child(controls);
    const path = settings.get_string('photo-source');
    const positionKey = `${settings.instanceId ?? 'photo'}:${path}`;
    let files = [];
    let index = -1;
    let pixbuf = null;
    let current = '';
    let closed = false;
    let loading = false;
    let monitor = null;
    let reloadTimer = 0;
    let renderTimer = 0;
    let target = [244, 244, 1];
    let scanCancel = new Gio.Cancellable();
    let loadCancel = new Gio.Cancellable();
    let limited = false;
    const failed = new Set();
    function paint() {
        if (closed || !pixbuf) return;
        const [width, height, scale] = target;
        const image = renderPhoto(pixbuf, width, height, settings.get_string('photo-fit'), 23 * scale);
        const content = St.ImageContent.new_with_preferred_size(image.width, image.height);
        const context = global.stage.context.get_backend().get_cogl_context();
        content.set_bytes(context, image.bytes, Cogl.PixelFormat.RGBA_8888, image.width, image.height, image.stride);
        picture.content = content;
    }
    function clear(text) {
        pixbuf = null;
        picture.content = null;
        empty.visible = true;
        message.text = text;
        controls.visible = false;
    }
    async function show(step = 1) {
        if (closed || loading || !files.length) return;
        loading = true;
        sensitive(previous, false);
        sensitive(next, false);
        const cancel = loadCancel;
        try {
            for (let attempt = 0; attempt < Math.min(files.length, 8); attempt++) {
                index = (index + step + files.length) % files.length;
                if (failed.has(files[index])) continue;
                try {
                    const result = await loadPhoto(files[index], cancel);
                    if (closed || cancel !== loadCancel) return;
                    pixbuf = result;
                    current = files[index];
                    positions.set(positionKey, current);
                    if (positions.size > 16) positions.delete(positions.keys().next().value);
                    paint();
                    empty.visible = false;
                    controls.visible = files.length > 1;
                    count.text = `${index + 1} / ${files.length}${limited ? '+' : ''}`;
                    return;
                } catch (error) {
                    if (closed || cancel.is_cancelled()) return;
                    failed.add(files[index]);
                }
            }
            clear('图片无法读取，请检查文件');
            controls.visible = files.length > 1;
            count.text = '读取失败';
        } finally {
            if (!closed && cancel === loadCancel) {
                loading = false;
                sensitive(previous, files.length > 1);
                sensitive(next, files.length > 1);
            }
        }
    }
    async function reload() {
        if (!path || closed) return;
        scanCancel.cancel();
        scanCancel = new Gio.Cancellable();
        const cancel = scanCancel;
        loadCancel.cancel();
        loadCancel = new Gio.Cancellable();
        loading = false;
        try {
            const result = await photoFiles(path, cancel);
            if (closed || cancel !== scanCancel) return;
            files = result.files;
            limited = result.limited;
            failed.clear();
            if (!monitor) {
                try {
                    const file = Gio.File.new_for_path(path);
                    monitor = result.directory ? file.monitor_directory(Gio.FileMonitorFlags.NONE, null) : file.monitor_file(Gio.FileMonitorFlags.NONE, null);
                    monitor.connect('changed', () => {
                        if (closed) return;
                        if (reloadTimer) GLib.Source.remove(reloadTimer);
                        reloadTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => { reloadTimer = 0; reload(); return GLib.SOURCE_REMOVE; });
                    });
                } catch (_) { /* Manual reselect still refreshes on filesystems without monitors. */ }
            }
            if (!files.length) { clear('文件夹里还没有可用图片'); return; }
            const remembered = current || positions.get(positionKey);
            index = Math.max(0, files.indexOf(remembered)) - 1;
            await show(1);
        } catch (_error) {
            if (!closed && cancel === scanCancel && !cancel.is_cancelled()) clear('图片路径不可用，请重新选择');
        }
    }
    const paused = settings.get_boolean('photo-paused');
    pause.child.icon_name = paused ? 'media-playback-start-symbolic' : 'media-playback-pause-symbolic';
    pause.accessible_name = paused ? '继续轮播' : '暂停轮播';
    const timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, settings.get_int('photo-interval'), () => {
        if (!paused && actor.mapped && files.length > 1) show(1);
        return GLib.SOURCE_CONTINUE;
    });
    reload();
    return {actor, next, previous, pause, count, message, reload,
        get current() { return current; },
        get loaded() { return pixbuf !== null; },
        resize(width, height, scale) {
            target = [width, height, scale];
            if (renderTimer) GLib.Source.remove(renderTimer);
            renderTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => { renderTimer = 0; paint(); return GLib.SOURCE_REMOVE; });
        },
        destroy() {
            closed = true;
            scanCancel.cancel();
            loadCancel.cancel();
            monitor?.cancel();
            for (const id of [timer, renderTimer, reloadTimer]) if (id) GLib.Source.remove(id);
            pixbuf = null;
            picture.content = null;
        }};
}
