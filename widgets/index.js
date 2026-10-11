// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {MAX_NOTE_LENGTH} from '../lib/layout.js';
import {SystemSampler} from '../lib/system.js';

export const TITLES = {clock: '时钟与日期', note: '随手记', system: '系统状态'};
export const ICONS = {clock: 'preferences-system-time-symbolic', note: 'document-edit-symbolic', system: 'system-run-symbolic'};

function column(style = '') {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: style, x_expand: true, y_expand: true, clip_to_allocation: true});
}

function label(text, style) {
    return new St.Label({text, style_class: style, x_align: Clutter.ActorAlign.START});
}

export function createWidget(type, settings, store) {
    const actor = column(`perch-content perch-${type}`);
    if (type === 'clock') {
        const time = label('', 'perch-time');
        const date = label('', 'perch-clock-date');
        actor.add_child(time);
        actor.add_child(date);
        const update = () => {
            const now = GLib.DateTime.new_now_local();
            time.text = now.format(settings.get_boolean('show-seconds') ? '%H:%M:%S' : '%H:%M');
            time.set_style(settings.get_boolean('show-seconds') ? 'font-size: 26pt;' : null);
            const weekday = ['一', '二', '三', '四', '五', '六', '日'][now.get_day_of_week() - 1];
            date.text = `${now.get_month()} 月 ${now.get_day_of_month()} 日  ·  星期${weekday}`;
            return GLib.SOURCE_CONTINUE;
        };
        update();
        const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, settings.get_boolean('show-seconds') ? 1 : 15, update);
        return {actor, destroy() { GLib.Source.remove(id); }};
    }
    if (type === 'note') {
        const entry = new St.Entry({
            text: store.state.note,
            hint_text: '留下一点想法…',
            style_class: 'perch-note-entry',
            can_focus: true,
            x_expand: true,
            y_expand: false,
            y_align: Clutter.ActorAlign.START,
            accessible_name: '便签内容，自动保存',
        });
        entry.clutter_text.set_single_line_mode(false);
        entry.clutter_text.set_activatable(false);
        entry.clutter_text.set_line_wrap(true);
        entry.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        entry.clutter_text.set_max_length(MAX_NOTE_LENGTH);
        entry.clutter_text.set_editable(store.writable);
        if (!store.writable)
            entry.hint_text = '原数据暂不可用，请查看顶栏提示';
        const scroll = new St.ScrollView({x_expand: true, y_expand: true, overlay_scrollbars: true});
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        const body = column();
        body.add_child(entry);
        scroll.set_child(body);
        actor.add_child(scroll);
        actor.add_child(label(store.writable ? '自动保存' : '只读保护 · 未覆盖原文件', 'perch-caption perch-note-status'));
        entry.clutter_text.connect('text-changed', () => {
            store.state.note = entry.get_text();
            store.changed();
        });
        return {actor, destroy() {}};
    }
    const gauges = new St.BoxLayout({style_class: 'perch-gauges', x_expand: true});
    const cpu = gauge('处理器', 'perch-cpu');
    const ram = gauge('内存', 'perch-memory');
    const detail = label('正在读取…', 'perch-caption');
    gauges.add_child(cpu.actor);
    gauges.add_child(ram.actor);
    actor.add_child(gauges);
    actor.add_child(detail);
    detail.x_align = Clutter.ActorAlign.CENTER;
    const sampler = new SystemSampler(settings.get_int('sample-seconds'), sample => {
        if (sample.error) {
            cpu.update(null);
            ram.update(null);
            detail.text = '暂时无法读取系统数据';
            return;
        }
        cpu.update(sample.cpu);
        ram.update(sample.memory.percent);
        detail.text = `${sample.memory.usedGiB.toFixed(1)} / ${sample.memory.totalGiB.toFixed(1)} GiB`;
    });
    return {actor, destroy() { sampler.destroy(); }};
}

function gauge(title, style) {
    const actor = column(`perch-gauge ${style}`);
    actor.y_expand = false;
    const dial = new St.Widget({layout_manager: new Clutter.BinLayout(), x_align: Clutter.ActorAlign.CENTER});
    const ring = new St.DrawingArea({style_class: 'perch-ring'});
    const value = new St.Label({text: '—', style_class: 'perch-gauge-value', x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
    let percent = null;
    ring.connect('repaint', area => {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const thickness = Math.min(w, h) * 0.075;
        const radius = (Math.min(w, h) - thickness) / 2;
        cr.setLineWidth(thickness);
        cr.setSourceRGBA(0.5, 0.5, 0.5, 0.16);
        cr.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
        cr.stroke();
        if (percent !== null && percent > 0) {
            const color = area.get_theme_node().get_foreground_color();
            cr.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, 1);
            cr.arc(w / 2, h / 2, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * percent / 100);
            cr.stroke();
        }
        cr.$dispose();
    });
    dial.add_child(ring);
    dial.add_child(value);
    actor.add_child(dial);
    const caption = label(title, 'perch-caption');
    caption.x_align = Clutter.ActorAlign.CENTER;
    actor.add_child(caption);
    return {
        actor,
        update(next) {
            percent = next;
            value.text = next === null ? '—' : `${Math.round(next)}%`;
            ring.queue_repaint();
        },
    };
}
