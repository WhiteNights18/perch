// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import Cogl from 'gi://Cogl';
import GdkPixbuf from 'gi://GdkPixbuf';
import {MediaPlayers} from '../lib/mpris.js';
import {launchApp} from '../lib/apps.js';
import {loadPhoto, renderPhoto} from '../lib/photos.js';
import {readText} from '../lib/io.js';
import {parseLyrics, lyricAt} from '../lib/lyrics.js';
import {column, label, button, sensitive} from './ui.js';

export function createMusic(settings) {
    const actor = new St.BoxLayout({style_class: 'perch-content perch-music', x_expand: true, y_expand: true});
    const main = column('perch-music-main'); actor.add_child(main);
    const top = new St.BoxLayout({style_class: 'perch-music-top', y_expand: true});
    const art = new St.Widget({width: 72, height: 72, y_align: Clutter.ActorAlign.CENTER, layout_manager: new Clutter.BinLayout()});
    const fallback = new St.Icon({icon_name: 'audio-x-generic-symbolic', icon_size: 36, style_class: 'perch-music-art'}); art.add_child(fallback);
    const artButton = new St.Button({child: art, can_focus: true, accessible_name: '打开音乐播放器'});
    top.add_child(artButton);
    const text = column('perch-music-text'); text.y_align = Clutter.ActorAlign.CENTER;
    const title = label('打开音乐播放器', 'perch-music-title');
    const artist = label('', 'perch-music-artist');
    [title, artist].forEach(c => text.add_child(c)); top.add_child(text); main.add_child(top);
    const lyric = label('', 'perch-music-lyric'); lyric.visible = false; lyric.y_align = Clutter.ActorAlign.CENTER; lyric.x_expand = true; lyric.clutter_text.set_line_wrap(true); actor.add_child(lyric);
    const controls = new St.BoxLayout({style_class: 'perch-music-controls', x_align: Clutter.ActorAlign.CENTER});
    const previous = button('media-skip-backward-symbolic', '上一首', () => service.command('Previous'));
    const toggle = button('media-playback-start-symbolic', '播放或打开播放器', () => service.state ? service.command('PlayPause') : launch());
    const next = button('media-skip-forward-symbolic', '下一首', () => service.command('Next'));
    [previous, toggle, next].forEach(b => controls.add_child(b)); main.add_child(controls);
    const source = new St.Button({label: '打开播放器', style_class: 'perch-music-source', can_focus: true}); main.add_child(source);
    const playerId = settings.get_string('music-player');
    const appName = GioUnix.DesktopAppInfo.new(playerId)?.get_display_name() ?? '播放器';
    const launch = () => launchApp(playerId);
    artButton.connect('clicked', launch);
    let closed = false, mediaKey = '', coverKey = '', lines = [], cancel = new Gio.Cancellable();
    async function media(state) {
        const key = `${state?.url ?? ''}\n${state?.lyrics ?? ''}`;
        const cover = state?.artUrl ?? '';
        if (key === mediaKey && cover === coverKey) return;
        mediaKey = key; coverKey = cover;
        cancel.cancel(); cancel = new Gio.Cancellable(); const request = cancel;
        lines = parseLyrics(state?.lyrics ?? '');
        lyric.text = lines[0]?.text || state?.lyrics?.split('\n').find(s => s.trim()) || '';
        lyric.visible = Boolean(lyric.text);
        fallback.visible = true; art.content = null; actor.get_parent()?.set_style('');
        if (cover.startsWith('file://')) {
            try {
                const file = Gio.File.new_for_uri(cover);
                const pixbuf = await loadPhoto(file.get_path(), request);
                if (closed || request !== cancel) return;
                const rendered = renderPhoto(pixbuf, 72, 72, 'cover', 14);
                const content = St.ImageContent.new_with_preferred_size(72, 72);
                content.set_bytes(global.stage.context.get_backend().get_cogl_context(), rendered.bytes, Cogl.PixelFormat.RGBA_8888, 72, 72, rendered.stride);
                art.content = content; fallback.visible = false;
                const average = pixbuf.scale_simple(1, 1, GdkPixbuf.InterpType.BILINEAR).read_pixel_bytes().get_data();
                const color = factor => `rgb(${Array.from(average.slice(0, 3), c => Math.round(c * factor + 14)).join(',')})`;
                actor.get_parent()?.set_style(`background-gradient-direction: vertical; background-gradient-start: ${color(0.42)}; background-gradient-end: ${color(0.16)};`);
            } catch (_) { /* Keep the neutral cover and palette. */ }
        }
        if (!state?.lyrics && state?.url?.startsWith('file://')) {
            try {
                const file = Gio.File.new_for_uri(state.url);
                const lrc = file.get_parent().get_child(file.get_basename().replace(/\.[^.]+$/, '') + '.lrc');
                const info = await new Promise((resolve, reject) => lrc.query_info_async('standard::size', Gio.FileQueryInfoFlags.NONE, 0, request, (f, r) => { try { resolve(f.query_info_finish(r)); } catch(e) { reject(e); } }));
                if (info.get_size() > 200000) return;
                const value = await readText(lrc.get_path(), request);
                if (closed || request !== cancel) return;
                lines = parseLyrics(value); lyric.text = lines[0]?.text || value.split('\n').find(s => s.trim()) || ''; lyric.visible = Boolean(lyric.text);
            } catch (_) { /* Local lyrics are optional. */ }
        }
    }
    const service = new MediaPlayers((state, error) => {
        if (closed) return;
        title.text = state?.title || `打开 ${appName}`;
        artist.text = error || state?.artist || (state ? '未知艺术家' : '点击封面或播放按钮');
        source.label = state && state.count > 1 ? '切换播放器' : `打开 ${appName}`;
        toggle.child.icon_name = state?.playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        sensitive(previous, state?.previous); sensitive(next, state?.next); sensitive(toggle, !state || state.toggle);
        media(state);
    });
    source.connect('clicked', () => service.state?.count > 1 ? service.cycle() : launch());
    const timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        const key = mediaKey;
        if (lines.length && actor.mapped) service.position(position => { if (!closed && key === mediaKey) lyric.text = lyricAt(lines, position) || lines[0].text; });
        return GLib.SOURCE_CONTINUE;
    });
    title.text = `打开 ${appName}`; artist.text = '点击封面或播放按钮'; source.label = `打开 ${appName}`;
    sensitive(previous, false); sensitive(next, false);
    return {actor, title, artist, lyric, art, artButton, toggle, next, previous, service, destroy() { closed = true; cancel.cancel(); GLib.Source.remove(timer); service.destroy(); }};
}
