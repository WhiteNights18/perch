// SPDX-License-Identifier: GPL-3.0-only
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import {column, label, button} from './ui.js';
import {textEditor} from '../lib/editor.js';
export function createTask(store) {
    const actor = column('perch-content perch-tasks');
    const header = new St.BoxLayout();
    const title = label('任务清单', 'perch-widget-heading'); title.x_expand = true;
    header.add_child(title);
    const list = column('perch-task-list'); list.y_expand = false;
    const summary = new St.Button({can_focus: true, style_class: 'perch-completed-toggle', x_align: Clutter.ActorAlign.START});
    summary.connect('clicked', () => { store.state.tasksExpanded = !store.state.tasksExpanded; store.changed(); draw(); });
    const completed = column('perch-task-list'); completed.y_expand = false;
    const undoButton = new St.Button({label: '撤销删除', can_focus: true, style_class: 'perch-undo-delete'});
    const undoDelete = () => {
        if (!store.writable || !store.state.deletedTasks.length || store.state.tasks.length >= 100) return;
        const saved = store.state.deletedTasks.pop();
        if (!store.state.tasks.some(t => t.id === saved.task.id)) store.state.tasks.splice(Math.min(saved.index, store.state.tasks.length), 0, saved.task);
        store.changed(); draw();
    };
    undoButton.connect('clicked', undoDelete);
    let editor = null;
    function draw() {
        list.destroy_all_children(); completed.destroy_all_children();
        const tasks = store.state.tasks;
        const count = tasks.filter(t => t.done).length;
        summary.label = `${store.state.tasksExpanded ? '▾' : '▸'} 已完成 ${count} 项`;
        summary.visible = count > 0; completed.visible = count > 0 && store.state.tasksExpanded;
        undoButton.visible = store.state.deletedTasks.length > 0; undoButton.reactive = store.writable && tasks.length < 100;
        if (!tasks.length) list.add_child(label('给今天安排一件小事', 'perch-caption'));
        for (const task of [...tasks].sort((a, b) => Number(a.done) - Number(b.done))) {
            const row = new St.BoxLayout({style_class: 'perch-task-row'});
            const toggle = new St.Button({child: label(`${task.done ? '☑' : '☐'}  ${task.text}`), can_focus: true, x_expand: true, style_class: task.done ? 'perch-task-done' : 'perch-task-text'});
            toggle.x_align = Clutter.ActorAlign.START;
            toggle.child.x_align = Clutter.ActorAlign.START;
            toggle.connect('clicked', () => { if (!store.writable) return; task.done = !task.done; store.changed(); draw(); });
            row.add_child(toggle);
            row.add_child(button('window-close-symbolic', '删除任务', () => { if (!store.writable) return; store.state.deletedTasks.push({task: {...task}, index: tasks.findIndex(t => t.id === task.id)}); store.state.deletedTasks = store.state.deletedTasks.slice(-20); store.state.tasks = tasks.filter(t => t.id !== task.id); store.changed(); draw(); }));
            (task.done ? completed : list).add_child(row);
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
    const scroll = new St.ScrollView({x_expand: true, y_expand: true}); scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC); const body = column(); body.y_expand = false; body.add_child(list); body.add_child(summary); body.add_child(completed); scroll.set_child(body);
    actor.add_child(scroll); actor.add_child(undoButton); draw();
    return {actor, list, completed, summary, undoButton, undoDelete, addButton, add, get editor() { return editor; }, destroy() { editor?.destroy(); }};
}
