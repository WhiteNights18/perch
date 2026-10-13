// Test-only wrapper to show the new page and launch its native file chooser.
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Preferences from './perch-prefs.js';
export default class TestPreferences extends Preferences {
    fillPreferencesWindow(window) {
        super.fillPreferencesWindow(window);
        window.visible_page_name = 'photos';
        function find(widget) {
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
