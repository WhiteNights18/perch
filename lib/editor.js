// SPDX-License-Identifier: GPL-3.0-only
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import {chineseFontStyle, applyChineseLanguage} from './typography.js';
export function textEditor(title, initial, limit, changed, multiline = true) {
    const dialog = new ModalDialog.ModalDialog({destroyOnClose: false});
    dialog.contentLayout.set_style(chineseFontStyle());
    dialog.contentLayout.add_child(new St.Label({text: title, style_class: 'perch-editor-title'}));
    const entry = new St.Entry({text: initial, can_focus: true, x_expand: true, style_class: 'perch-editor-entry'});
    entry.set_style(chineseFontStyle());
    entry.clutter_text.set_single_line_mode(!multiline);
    entry.clutter_text.set_activatable(!multiline);
    entry.clutter_text.set_line_wrap(multiline);
    entry.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
    entry.clutter_text.set_max_length(limit);
    const scroll = new St.ScrollView({style_class: multiline ? 'perch-editor-scroll' : 'perch-editor-single'});
    scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    box.add_child(entry); scroll.set_child(box); dialog.contentLayout.add_child(scroll);
    dialog.setInitialKeyFocus(entry.clutter_text);
    dialog.setButtons([{label: '完成', key: Clutter.KEY_Escape, default: true, action: () => dialog.close()}]);
    entry.clutter_text.connect('text-changed', () => changed(entry.get_text()));
    bindEditorKeys(entry, () => dialog.close(), multiline);
    applyChineseLanguage(dialog.contentLayout);
    return {dialog, entry, open() { dialog.open(); entry.grab_key_focus(); }, destroy() { dialog.destroy(); }};
}

// Capture before Clutter.Text inserts a newline. Ctrl+Enter explicitly inserts it.
export function bindEditorKeys(entry, finish, multiline = true) {
    const keys = new Clutter.KeyController();
    keys.connect('key-press', controller => {
        if (entry.clutter_text.has_preedit()) return Clutter.EVENT_PROPAGATE;
        const [, key] = controller.get_key();
        if (key !== Clutter.KEY_Return && key !== Clutter.KEY_KP_Enter) return Clutter.EVENT_PROPAGATE;
        const [, pressed, latched, locked] = controller.get_state();
        if (multiline && ((pressed | latched | locked) & Clutter.ModifierType.CONTROL_MASK)) {
            entry.clutter_text.delete_selection();
            entry.clutter_text.insert_text('\n', entry.clutter_text.get_cursor_position());
        } else finish();
        return Clutter.EVENT_STOP;
    });
    entry.add_action_full('perch-editor-keys', Clutter.EventPhase.CAPTURE, keys);
}
