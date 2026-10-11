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
        const date = label('', 'perch-muted');
        actor.add_child(time);
        actor.add_child(date);
        const update = () => {
            const now = GLib.DateTime.new_now_local();
            time.text = now.format(settings.get_boolean('show-seconds') ? '%H:%M:%S' : '%H:%M');
            time.set_style(settings.get_boolean('show-seconds') ? 'font-size: 27pt;' : null);
            const weekday = ['一', '二', '三', '四', '五', '六', '日'][now.get_day_of_week() - 1];
            date.text = `${now.format('%m 月 %d 日')} · 星期${weekday}`;
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
        actor.add_child(label(store.writable ? '本地自动保存' : '只读保护 · 未覆盖原文件', 'perch-caption'));
        entry.clutter_text.connect('text-changed', () => {
            store.state.note = entry.get_text();
            store.changed();
        });
        return {actor, destroy() {}};
    }
    const cpu = label('—', 'perch-value');
    const ram = label('—', 'perch-value');
    const detail = label('正在读取…', 'perch-caption');
    actor.add_child(label('处理器', 'perch-caption'));
    actor.add_child(cpu);
    actor.add_child(label('内存', 'perch-caption'));
    actor.add_child(ram);
    actor.add_child(detail);
    const sampler = new SystemSampler(settings.get_int('sample-seconds'), sample => {
        if (sample.error) {
            cpu.text = '—';
            ram.text = '—';
            detail.text = '暂时无法读取系统数据';
            return;
        }
        cpu.text = sample.cpu === null ? '采样中…' : `${Math.round(sample.cpu)}%`;
        ram.text = `${Math.round(sample.memory.percent)}%`;
        detail.text = `${sample.memory.usedGiB.toFixed(1)} / ${sample.memory.totalGiB.toFixed(1)} GiB`;
    });
    return {actor, destroy() { sampler.destroy(); }};
}
