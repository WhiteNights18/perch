// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Cairo from 'cairo';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {newFocus, focusRemaining, toggleFocus} from '../lib/widget-models.js';
import {column, label, button, sensitive} from './ui.js';

export function createFocus(settings, store) {
    const actor = column('perch-content perch-focus');
    const caption = label('专注片刻', 'perch-focus-heading');
    actor.add_child(caption);
    const dial = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true});
    const ring = new St.DrawingArea({x_expand: true, y_expand: true});
    const time = label('', 'perch-focus-time');
    time.x_expand = time.y_expand = true;
    time.x_align = time.y_align = Clutter.ActorAlign.CENTER;
    dial.add_child(ring);
    dial.add_child(time);
    actor.add_child(dial);
    const controls = new St.BoxLayout({style_class: 'perch-focus-controls', x_align: Clutter.ActorAlign.CENTER});
    const reset = button('view-refresh-symbolic', '重置本轮计时', () => {
        save(newFocus(store.state.focus.phase, settings.get_int(store.state.focus.phase === 'work' ? 'focus-minutes' : 'break-minutes')));
    });
    const toggle = button('media-playback-start-symbolic', '开始专注', () => {
        if (!focusRemaining(store.state.focus)) {
            const phase = store.state.focus.phase === 'work' ? 'break' : 'work';
            save(newFocus(phase, settings.get_int(phase === 'work' ? 'focus-minutes' : 'break-minutes')));
        }
        save(toggleFocus(store.state.focus));
    }, 'perch-focus-start');
    controls.add_child(reset);
    controls.add_child(toggle);
    const choose = button('pan-down-symbolic', '选择专注时长', () => menu.toggle());
    controls.add_child(choose);
    const menu = new PopupMenu.PopupMenu(choose, 0.5, St.Side.TOP);
    Main.uiGroup.add_child(menu.actor); menu.actor.hide();
    const manager = new PopupMenu.PopupMenuManager(choose); manager.addMenu(menu);
    [5, 10, 15, 25, 30, 50].forEach(minutes => {
        menu.addAction(`${minutes} 分钟`, () => {
            if (!store.writable) return;
            settings.set_int('focus-minutes', minutes); save(newFocus('work', minutes));
        });
    });
    actor.add_child(controls);
    const fitTime = () => {
        if (!dial.get_stage()) return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const diameter = Math.min(dial.width, dial.height);
        const size = Math.max(6, Math.min(36, Math.floor((diameter - 16 * scale) / (time.text.length * 0.68) / scale)));
        const style = `font-size: ${size}px;`;
        if (time.get_style() !== style) time.set_style(style);
    };
    dial.connect('notify::allocation', fitTime);
    sensitive(reset, store.writable);
    sensitive(toggle, store.writable);
    function save(state) {
        if (!store.writable) return;
        store.state.focus = state;
        store.changed();
        render();
    }
    ring.connect('repaint', area => {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const r = Math.max(1, Math.min(w, h) / 2 - 5);
        cr.setLineWidth(5);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setSourceRGBA(0.9, 0.45, 0.25, 0.16);
        cr.arc(w / 2, h / 2, r, 0, Math.PI * 2);
        cr.stroke();
        const remaining = focusRemaining(store.state.focus);
        if (remaining > 0) {
            cr.setSourceRGB(0.96, 0.43, 0.25);
            cr.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remaining / store.state.focus.duration);
            cr.stroke();
        }
        cr.$dispose();
    });
    function render() {
        const state = store.state.focus;
        const remaining = focusRemaining(state);
        if (!remaining && state.deadline) {
            state.deadline = 0;
            state.remaining = 0;
            store.changed();
            if (settings.get_boolean('focus-sound')) global.display.get_sound_player().play_from_theme('complete', '栖格计时完成', null);
            Main.notify('栖格 · 番茄钟', state.phase === 'work' ? '这一轮专注完成，休息一下吧。' : '休息结束，可以开始下一轮专注。');
        }
        caption.text = !store.writable ? '计时数据只读' : !remaining ? (state.phase === 'work' ? '专注完成 · 开始休息' : '休息完成 · 继续专注') : state.phase === 'work' ? '专注片刻' : '休息一下';
        time.text = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
        toggle.child.icon_name = state.deadline ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        toggle.accessible_name = state.deadline ? '暂停计时' : remaining ? '开始或继续计时' : '开始下一阶段';
        fitTime();
        ring.queue_repaint();
    }
    render();
    const timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => { render(); return GLib.SOURCE_CONTINUE; });
    return {actor, toggle, reset, time, dial, choose, menu, setEditing(editing) { if (editing) menu.close(); }, destroy() { menu.destroy(); GLib.Source.remove(timer); }};
}
