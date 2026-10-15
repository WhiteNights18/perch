// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {noteTitle} from '../lib/workflows.js';
import {column, label, button} from './ui.js';
import {textEditor, bindEditorKeys, bindUndo} from '../lib/editor.js';
import {MAX_NOTE_LENGTH} from '../lib/layout.js';
import {chineseFontStyle} from '../lib/typography.js';

export function createNote(settings, store) {
    if (!store.state.notes.length) {
        store.state.notes.push({id: 'main', text: store.state.note, modified: store.state.noteModified, history: []});
        store.state.activeNoteId = 'main'; store.changed();
    }
    let current = store.state.notes.find(n => n.id === store.state.activeNoteId) ?? store.state.notes[0];
    let syncing = false, lastEdit = 0;
    const positions = new Map();
    const actor = column('perch-content perch-note');
    const heading = new St.BoxLayout({style_class: 'perch-note-heading'});
    heading.add_child(new St.Icon({icon_name: 'document-edit-symbolic', icon_size: 16}));
    const title = label('备忘录', 'perch-note-heading-text'); title.x_expand = true; heading.add_child(title);
    const modified = label('', 'perch-note-modified'); modified.y_align = Clutter.ActorAlign.CENTER;
    modified.visible = settings.get_boolean('note-show-date'); heading.add_child(modified); actor.add_child(heading);
    const updateDate = () => { modified.text = current.modified ? GLib.DateTime.new_from_unix_local(Math.floor(current.modified / 1000)).format('%y-%m-%d') : ''; };
    updateDate();
    const preview = label(current.text || '点击记录一点想法…', 'perch-note-preview');
    preview.clutter_text.set_line_alignment(Pango.Alignment.LEFT);
    preview.clutter_text.set_line_wrap(true); preview.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
    preview.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
    const save = text => {
        if (syncing || !store.writable || text === current.text) return;
        const now = Date.now();
        if (now - lastEdit > 800) { current.history.push(current.text); current.history = current.history.slice(-20); }
        lastEdit = now;
        current.text = text; current.modified = now;
        store.state.note = text; store.state.noteModified = now;
        preview.text = text || '点击记录一点想法…'; updateDate(); store.changed();
    };
    const undo = () => {
        if (!store.writable || !current.history.length) return;
        current.text = current.history.pop(); current.modified = Date.now(); lastEdit = 0;
        sync(); store.changed();
    };
    const editor = textEditor('备忘录', current.text, MAX_NOTE_LENGTH, save, true, undo);
    editor.dialog.connect('closed', () => { lastEdit = 0; });
    editor.entry.clutter_text.set_editable(store.writable);
    const scroll = new St.ScrollView({overlay_scrollbars: true, x_expand: true, y_expand: true, style_class: 'perch-note-scroll'});
    scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    const body = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    scroll.set_child(body); actor.add_child(scroll);
    let entry = editor.entry, open = null;
    if (settings.get_boolean('note-popup')) {
        open = new St.Button({child: preview, x_expand: true, x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.START, can_focus: true, accessible_name: '编辑备忘录'});
        preview.x_align = Clutter.ActorAlign.START;
        open.connect('clicked', () => editor.open()); body.add_child(open);
    } else {
        entry = new St.Entry({text: current.text, hint_text: '点击记录一点想法…', can_focus: true, x_expand: true, style_class: 'perch-note-entry'});
        entry.set_style(chineseFontStyle());
        entry.clutter_text.set_single_line_mode(false); entry.clutter_text.set_activatable(false);
        entry.clutter_text.set_line_wrap(true); entry.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        entry.clutter_text.set_max_length(MAX_NOTE_LENGTH); entry.clutter_text.set_editable(store.writable);
        entry.clutter_text.connect('text-changed', () => save(entry.get_text()));
        bindUndo(entry, undo);
        bindEditorKeys(entry, () => { save(entry.get_text()); global.stage.set_key_focus(null); });
        body.add_child(entry);
    }
    const toolbar = new St.BoxLayout({style_class: 'perch-note-tools'});
    const select = new St.Button({label: '', can_focus: true, x_expand: true, style_class: 'perch-note-select'});
    const menu = new PopupMenu.PopupMenu(select, 0.5, St.Side.TOP);
    Main.uiGroup.add_child(menu.actor); menu.actor.hide();
    const manager = new PopupMenu.PopupMenuManager(select); manager.addMenu(menu);
    function sync() {
        syncing = true;
        editor.entry.set_text(current.text); if (entry !== editor.entry) entry.set_text(current.text);
        preview.text = current.text || '点击记录一点想法…';
        store.state.note = current.text; store.state.noteModified = current.modified;
        store.state.activeNoteId = current.id;
        select.label = `${store.state.notes.indexOf(current) + 1} / ${store.state.notes.length}`;
        updateDate(); syncing = false;
    }
    function switchNote(id) {
        positions.set(current.id, scroll.vadjustment?.value ?? 0);
        current = store.state.notes.find(n => n.id === id) ?? current;
        lastEdit = 0; sync();
        if (scroll.vadjustment) scroll.vadjustment.value = positions.get(current.id) ?? 0;
        store.changed();
    }
    select.connect('clicked', () => {
        menu.removeAll();
        for (const n of store.state.notes) menu.addAction(noteTitle(n), () => switchNote(n.id));
        menu.toggle();
    });
    const add = () => {
        if (!store.writable || store.state.notes.length >= 20) return;
        const note = {id: GLib.uuid_string_random(), text: '', modified: 0, history: []};
        store.state.notes.push(note); switchNote(note.id);
        if (settings.get_boolean('note-popup')) editor.open(); else entry.grab_key_focus();
    };
    const addButton = button('list-add-symbolic', '新增笔记', add);
    const undoButton = button('edit-undo-symbolic', '撤销编辑', undo);
    toolbar.add_child(select); toolbar.add_child(undoButton); toolbar.add_child(addButton); actor.add_child(toolbar);
    sync();
    return {actor, entry, scroll, select, add, addButton, undo, undoButton, switchNote, get current() { return current; }, openButton: open, openEditor: () => { lastEdit = 0; editor.open(); }, editor, modified, setEditing(editing) { if (editing) menu.close(); }, destroy() { menu.destroy(); editor.destroy(); }};
}
