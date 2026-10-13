// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {monthGrid} from '../lib/widget-models.js';
import {column, label, button} from './ui.js';

export function createCalendar() {
    const actor = column('perch-content perch-calendar');
    const heading = new St.BoxLayout({style_class: 'perch-calendar-heading'});
    const title = label('', 'perch-calendar-month');
    title.x_expand = true;
    let offset = 0;
    const previous = button('go-previous-symbolic', '上个月', () => { offset--; render(); }, 'perch-calendar-nav');
    const next = button('go-next-symbolic', '下个月', () => { offset++; render(); }, 'perch-calendar-nav');
    heading.add_child(title);
    heading.add_child(previous);
    heading.add_child(next);
    actor.add_child(heading);
    const today = new St.Button({can_focus: true, style_class: 'perch-calendar-today', accessible_name: '回到今天'});
    today.connect('clicked', () => { offset = 0; render(); });
    actor.add_child(today);
    const grid = new St.Widget({layout_manager: new Clutter.GridLayout(), x_expand: true, y_expand: true});
    actor.add_child(grid);
    const cells = [];
    for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 7; col++) {
            const cell = new St.Label({text: row === 0 ? '一二三四五六日'[col] : '',
                style_class: row === 0 ? 'perch-calendar-weekday' : 'perch-calendar-day',
                x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
            grid.layout_manager.attach(cell, col, row, 1, 1);
            if (row) cells.push(cell);
        }
    }
    function render() {
        const now = new Date();
        const month = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        title.text = `${month.getFullYear()}年 ${month.getMonth() + 1}月`;
        today.label = `${now.getDate()}  ·  星期${'日一二三四五六'[now.getDay()]}`;
        const numbers = monthGrid(month.getFullYear(), month.getMonth());
        cells.forEach((cell, i) => {
            cell.text = numbers[i] ? String(numbers[i]) : '';
            const isToday = offset === 0 && numbers[i] === now.getDate();
            cell.style_class = `perch-calendar-day${isToday ? ' perch-calendar-selected' : ''}`;
        });
    }
    render();
    const timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => { render(); return GLib.SOURCE_CONTINUE; });
    return {actor, previous, next, today, title, cells, destroy() { GLib.Source.remove(timer); }};
}
