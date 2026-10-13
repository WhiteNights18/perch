// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {column, label} from './ui.js';
import {textEditor, bindEditorKeys} from '../lib/editor.js';
import {MAX_NOTE_LENGTH} from '../lib/layout.js';
import {chineseFontStyle} from '../lib/typography.js';

export function createNote(settings, store) {
    const actor = column('perch-content perch-note');
    const heading = new St.BoxLayout({style_class: 'perch-note-heading'});
    heading.add_child(new St.Icon({icon_name: 'document-edit-symbolic', icon_size: 16}));
    const title = label('备忘录', 'perch-note-heading-text'); title.x_expand = true; heading.add_child(title);
    const modified = label('', 'perch-note-modified'); modified.y_align = Clutter.ActorAlign.CENTER;
    modified.visible = settings.get_boolean('note-show-date'); heading.add_child(modified); actor.add_child(heading);
    const updateDate = () => { modified.text = store.state.noteModified ? GLib.DateTime.new_from_unix_local(Math.floor(store.state.noteModified / 1000)).format('%y-%m-%d') : ''; };
    updateDate();
    const preview = label(store.state.note || '点击记录一点想法…', 'perch-note-preview');
    preview.clutter_text.set_line_wrap(true); preview.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
    preview.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
    const save = text => {
        if (!store.writable || text === store.state.note) return;
        store.state.note = text; store.state.noteModified = Date.now();
        preview.text = text || '点击记录一点想法…'; updateDate(); store.changed();
    };
    const editor = textEditor('备忘录 · 回车完成 / Ctrl+回车换行', store.state.note, MAX_NOTE_LENGTH, save);
    editor.entry.clutter_text.set_editable(store.writable);
    const scroll = new St.ScrollView({x_expand: true, y_expand: true, style_class: 'perch-note-scroll'});
    scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    const body = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    scroll.set_child(body); actor.add_child(scroll);
    let entry = editor.entry, open = null;
    if (settings.get_boolean('note-popup')) {
        open = new St.Button({child: preview, x_expand: true, can_focus: true, accessible_name: '编辑备忘录'});
        preview.x_align = Clutter.ActorAlign.START;
        open.connect('clicked', () => editor.open()); body.add_child(open);
    } else {
        entry = new St.Entry({text: store.state.note, hint_text: '点击记录一点想法…', can_focus: true, x_expand: true, style_class: 'perch-note-entry'});
        entry.set_style(chineseFontStyle());
        entry.clutter_text.set_single_line_mode(false); entry.clutter_text.set_activatable(false);
        entry.clutter_text.set_line_wrap(true); entry.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        entry.clutter_text.set_max_length(MAX_NOTE_LENGTH); entry.clutter_text.set_editable(store.writable);
        entry.clutter_text.connect('text-changed', () => save(entry.get_text()));
        bindEditorKeys(entry, () => { save(entry.get_text()); global.stage.set_key_focus(null); });
        body.add_child(entry);
    }
    return {actor, entry, openButton: open, openEditor: () => editor.open(), editor, modified, destroy() { editor.destroy(); }};
}
