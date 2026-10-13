// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import PangoCairo from 'gi://PangoCairo';
import Cairo from 'cairo';
import {MAX_NOTE_LENGTH} from '../lib/layout.js';
import {SystemSampler} from '../lib/system.js';

import {createCalendar} from './calendar.js';
import {createFocus} from './focus.js';
import {createMusic} from './music.js';
import {createWeather} from './weather.js';

export const TITLES = {clock: '时钟与日期', note: '随手记', system: '系统状态', calendar: '月历', focus: '番茄钟', music: '音乐', weather: '天气'};
export const ICONS = {clock: 'preferences-system-time-symbolic', note: 'document-edit-symbolic', system: 'system-run-symbolic', calendar: 'x-office-calendar-symbolic', focus: 'alarm-symbolic', music: 'audio-x-generic-symbolic', weather: 'weather-clear-symbolic'};

function column(style = '') {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: style, x_expand: true, y_expand: true, clip_to_allocation: true});
}

function label(text, style) {
    return new St.Label({text, style_class: style, x_align: Clutter.ActorAlign.START});
}

export function createWidget(type, settings, store) {
    if (type === 'calendar') return createCalendar();
    if (type === 'focus') return createFocus(settings, store);
    if (type === 'music') return createMusic();
    if (type === 'weather') return createWeather(settings);
    const actor = column(`perch-content perch-${type}`);
    if (type === 'clock') {
        const face = new St.DrawingArea({x_expand: true, y_expand: true, style_class: 'perch-clock-face'});
        const date = label('', 'perch-clock-date');
        date.x_align = Clutter.ActorAlign.CENTER;
        actor.add_child(face);
        actor.add_child(date);
        const seconds = settings.get_boolean('show-seconds');
        face.connect('repaint', area => {
            const cr = area.get_context();
            const [w, h] = area.get_surface_size();
            const r = Math.max(1, Math.min(w, h) / 2 - 2);
            cr.translate(w / 2, h / 2);
            cr.setSourceRGB(0.98, 0.976, 0.96);
            cr.arc(0, 0, r, 0, Math.PI * 2);
            cr.fill();
            for (let i = 0; i < 60; i++) {
                const a = i * Math.PI / 30;
                const major = i % 5 === 0;
                cr.setSourceRGBA(0.12, 0.13, 0.14, major ? 0.9 : 0.35);
                cr.setLineWidth(major ? 2 : 1);
                cr.moveTo(Math.sin(a) * r * 0.94, -Math.cos(a) * r * 0.94);
                cr.lineTo(Math.sin(a) * r * (major ? 0.85 : 0.9), -Math.cos(a) * r * (major ? 0.85 : 0.9));
                cr.stroke();
            }
            const layout = PangoCairo.create_layout(cr);
            const font = Pango.FontDescription.from_string('Noto Sans Medium');
            font.set_absolute_size(r * 0.23 * Pango.SCALE);
            layout.set_font_description(font);
            cr.setSourceRGB(0.1, 0.11, 0.12);
            for (let i = 1; i <= 12; i++) {
                layout.set_text(String(i), -1);
                const [tw, th] = layout.get_pixel_size();
                const a = i * Math.PI / 6;
                cr.moveTo(Math.sin(a) * r * 0.7 - tw / 2, -Math.cos(a) * r * 0.7 - th / 2);
                PangoCairo.show_layout(cr, layout);
            }
            const now = GLib.DateTime.new_now_local();
            const hand = (angle, length, width) => {
                cr.setLineWidth(width);
                cr.setLineCap(Cairo.LineCap.ROUND);
                cr.moveTo(-Math.sin(angle) * r * 0.1, Math.cos(angle) * r * 0.1);
                cr.lineTo(Math.sin(angle) * r * length, -Math.cos(angle) * r * length);
                cr.stroke();
            };
            hand((now.get_hour() % 12 + now.get_minute() / 60) * Math.PI / 6, 0.45, r * 0.075);
            hand((now.get_minute() + now.get_second() / 60) * Math.PI / 30, 0.77, r * 0.05);
            cr.setSourceRGB(0.97, 0.38, 0.12);
            if (seconds)
                hand(now.get_second() * Math.PI / 30, 0.83, r * 0.018);
            cr.arc(0, 0, r * 0.045, 0, Math.PI * 2);
            cr.fill();
            cr.$dispose();
        });
        const update = () => {
            const now = GLib.DateTime.new_now_local();
            const weekday = ['一', '二', '三', '四', '五', '六', '日'][now.get_day_of_week() - 1];
            date.text = `${now.get_month()}月${now.get_day_of_month()}日  周${weekday}`;
            face.accessible_name = now.format('%H:%M:%S');
            face.queue_repaint();
            return GLib.SOURCE_CONTINUE;
        };
        update();
        const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds ? 1 : 15, update);
        return {actor, date, destroy() { GLib.Source.remove(id); }};
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
        const heading = new St.BoxLayout({style_class: 'perch-note-heading'});
        heading.add_child(new St.Icon({icon_name: 'document-edit-symbolic', icon_size: 18}));
        heading.add_child(label('备忘录', 'perch-note-heading-text'));
        actor.add_child(heading);
        scroll.style_class = 'perch-note-paper';
        actor.add_child(scroll);
        if (!store.writable)
            actor.add_child(label('只读保护 · 未覆盖原文件', 'perch-caption perch-note-status'));
        entry.clutter_text.connect('text-changed', () => {
            store.state.note = entry.get_text();
            store.changed();
        });
        return {actor, entry, destroy() {}};
    }
    const gauges = new St.BoxLayout({style_class: 'perch-gauges', x_expand: true});
    const cpu = gauge('处理器', 'perch-cpu');
    const ram = gauge('内存', 'perch-memory');
    const detail = label('正在读取…', 'perch-caption');
    gauges.add_child(cpu.actor);
    gauges.add_child(ram.actor);
    actor.add_child(label('系统状态', 'perch-system-title'));
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
    dial.add_child(new St.Icon({icon_name: style === 'perch-cpu' ? 'computer-chip-symbolic' : 'drive-harddisk-symbolic', icon_size: 28, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, style_class: 'perch-device-icon'}));
    actor.add_child(dial);
    actor.add_child(value);
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
