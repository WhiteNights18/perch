// Test-only wrapper to show the new page and launch its native file chooser.
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Preferences from './perch-prefs.js';
export default class TestPreferences extends Preferences {
    fillPreferencesWindow(window) {
        super.fillPreferencesWindow(window);
        window.visible_page_name = 'components';
        if (GLib.getenv('PERCH_PREFS_ONLY')) {
            const all = [];
            const visit = widget => {
                if (widget instanceof Adw.ExpanderRow || widget instanceof Adw.SwitchRow) all.push(widget);
                for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) visit(child);
            };
            visit(window);
            const note = all.find(w => w instanceof Adw.ExpanderRow && w.title === '随手记');
            const popup = all.find(w => w instanceof Adw.SwitchRow && w.title === '在弹窗中编辑');
            if (!note || !popup) throw new Error('note settings hierarchy missing');
            const settings = this.getSettings();
            settings.set_boolean('show-note', false);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                if (popup.sensitive || note.enable_expansion) throw new Error('disabled note has active subsettings');
                settings.set_boolean('show-note', true);
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                    if (!popup.sensitive || !note.enable_expansion) throw new Error('enabled note subsettings insensitive');
                    note.expanded = true;
                    GLib.file_set_contents(`${GLib.getenv('PERCH_TEST_OUTPUT')}/prefs-check.txt`, 'PASS');
                    return GLib.SOURCE_REMOVE;
                });
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        function find(widget) {
            if (widget instanceof Adw.ExpanderRow && widget.title === '照片') widget.expanded = true;
            if (widget instanceof Gtk.Button && widget.label === '选择图片') return widget;
            for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) {
                const result = find(child);
                if (result) return result;
            }
            return null;
        }
        const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 4000, () => {
            find(window)?.emit('clicked');
            return GLib.SOURCE_REMOVE;
        });
        window.connect('close-request', () => { if (GLib.MainContext.default().find_source_by_id(timer)) GLib.Source.remove(timer); return false; });
    }
}
