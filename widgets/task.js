// SPDX-License-Identifier: GPL-3.0-only
import St from 'gi://St';
import GLib from 'gi://GLib';
import {column, label, button} from './ui.js';
import {textEditor} from '../lib/editor.js';
export function createTask(store) {
    const actor = column('perch-content perch-tasks');
    const header = new St.BoxLayout();
    const title = label('任务清单', 'perch-widget-heading'); title.x_expand = true;
    header.add_child(title);
    const list = column('perch-task-list');
    const summary = label('', 'perch-caption');
    let editor = null;
    function draw() {
        list.destroy_all_children();
        const tasks = store.state.tasks;
        summary.text = `${tasks.filter(t => t.done).length} / ${tasks.length} 已完成`;
        if (!tasks.length) list.add_child(label('给今天安排一件小事', 'perch-caption'));
        for (const task of tasks) {
            const row = new St.BoxLayout({style_class: 'perch-task-row'});
            const toggle = new St.Button({child: label(`${task.done ? '☑' : '☐'}  ${task.text}`), can_focus: true, x_expand: true, style_class: task.done ? 'perch-task-done' : 'perch-task-text'});
            toggle.connect('clicked', () => { if (!store.writable) return; task.done = !task.done; store.changed(); draw(); });
            row.add_child(toggle);
            row.add_child(button('window-close-symbolic', '删除任务', () => { if (!store.writable) return; store.state.tasks = tasks.filter(t => t.id !== task.id); store.changed(); draw(); }));
            list.add_child(row);
        }
    }
    function add() {
        if (!store.writable || store.state.tasks.length >= 100) return;
        editor?.destroy();
        let draft = '';
        editor = textEditor('新任务', '', 500, text => { draft = text; }, false);
        editor.dialog.connect('closed', () => {
            if (draft.trim()) { store.state.tasks.push({id: GLib.uuid_string_random(), text: draft.trim(), done: false}); store.changed(); draw(); }
            draft = '';
        });
        editor.open();
    }
    const addButton = button('list-add-symbolic', '添加任务', add); header.add_child(addButton);
    actor.add_child(header);
    const scroll = new St.ScrollView({x_expand: true, y_expand: true}); scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC); scroll.set_child(list);
    actor.add_child(scroll); actor.add_child(summary); draw();
    return {actor, list, addButton, add, get editor() { return editor; }, destroy() { editor?.destroy(); }};
}
