// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {MediaPlayers} from '../lib/mpris.js';
import {column, label, button, sensitive} from './ui.js';

export function createMusic() {
    const actor = column('perch-content perch-music');
    const top = new St.BoxLayout({style_class: 'perch-music-top', y_expand: true});
    const art = new St.Icon({icon_name: 'audio-x-generic-symbolic', icon_size: 40, style_class: 'perch-music-art', y_align: Clutter.ActorAlign.CENTER});
    top.add_child(art);
    const text = column('perch-music-text');
    text.y_align = Clutter.ActorAlign.CENTER;
    const eyebrow = label('现在播放', 'perch-music-eyebrow');
    const title = label('让音乐陪伴你', 'perch-music-title');
    const artist = label('打开支持 MPRIS 的播放器', 'perch-music-artist');
    text.add_child(eyebrow);
    text.add_child(title);
    text.add_child(artist);
    top.add_child(text);
    actor.add_child(top);
    const controls = new St.BoxLayout({style_class: 'perch-music-controls', x_align: Clutter.ActorAlign.CENTER});
    const previous = button('media-skip-backward-symbolic', '上一首', () => service.command('Previous'));
    const toggle = button('media-playback-start-symbolic', '播放或暂停', () => service.command('PlayPause'), 'perch-music-play');
    const next = button('media-skip-forward-symbolic', '下一首', () => service.command('Next'));
    [previous, toggle, next].forEach(b => { controls.add_child(b); sensitive(b, false); });
    actor.add_child(controls);
    const source = new St.Button({label: '等待播放器', style_class: 'perch-music-source', can_focus: false, reactive: false, accessible_name: '切换播放器'});
    actor.add_child(source);
    const service = new MediaPlayers((state, error) => {
        title.text = state?.title || '让音乐陪伴你';
        artist.text = error || state?.artist || (state ? '未知艺术家' : '打开支持 MPRIS 的播放器');
        eyebrow.text = state?.playing ? '正在播放' : state ? '已暂停' : '现在播放';
        source.label = state ? `${state.name.slice('org.mpris.MediaPlayer2.'.length)}${state.count > 1 ? ' · 点击切换' : ''}` : '等待播放器';
        sensitive(source, Boolean(state && state.count > 1));
        source.opacity = 255;
        toggle.child.icon_name = state?.playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        sensitive(previous, state?.previous);
        sensitive(toggle, state?.toggle);
        sensitive(next, state?.next);
    });
    source.connect('clicked', () => service.cycle());
    return {actor, title, artist, toggle, next, previous, service, destroy() { service.destroy(); }};
}
