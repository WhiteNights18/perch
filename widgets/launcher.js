// SPDX-License-Identifier: GPL-3.0-only
import St from 'gi://St';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import Clutter from 'gi://Clutter';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {column, label, button} from './ui.js';
import {launchApp} from '../lib/apps.js';
// Allocate children directly; changing actor sizes inside allocation signals
// causes stale hitboxes and non-centred rows on subsequent frames.
const LauncherLayout = GObject.registerClass(class PerchLauncherLayout extends Clutter.LayoutManager {
    vfunc_get_preferred_width() { return [0, 0]; }
    vfunc_get_preferred_height() { return [0, 0]; }
    vfunc_allocate(container, box) { this.arrange?.(box.get_width(), box.get_height()); }
});
export function createLauncher(settings) {
    const actor = column('perch-content perch-launcher');
    const heading = new St.BoxLayout();
    const title = label('常用应用', 'perch-widget-heading'); title.x_expand = true; heading.add_child(title);
    heading.add_child(button('emblem-system-symbolic', '配置常用应用', () => Extension.lookupByURL(import.meta.url)?.openPreferences()));
    actor.add_child(heading);
    const layout = new LauncherLayout();
    const grid = new St.Widget({layout_manager: layout, x_expand: true, y_expand: true});
    const apps = settings.get_strv('launcher-apps').slice(0, 9);
    const showLabels = settings.get_boolean('launcher-labels');
    const icons = [];
    const items = apps.map(id => {
        const info = GioUnix.DesktopAppInfo.new(id);
        const item = new St.Button({can_focus: true, style_class: 'perch-launcher-app', accessible_name: info?.get_display_name() ?? id});
        const body = column(); body.x_expand = body.y_expand = false; body.y_align = Clutter.ActorAlign.CENTER;
        const icon = new St.Icon({gicon: info?.get_icon() ?? Gio.ThemedIcon.new('application-x-executable'), icon_size: 36, x_align: Clutter.ActorAlign.CENTER});
        body.add_child(icon); icons.push(icon);
        const text = label(info?.get_display_name() ?? '未安装', 'perch-launcher-name'); text.x_align = Clutter.ActorAlign.CENTER; text.visible = showLabels;
        body.add_child(text); item.child = body;
        item.connect('clicked', () => launchApp(id)); grid.add_child(item);
        return item;
    });
    let widgetScale = settings.get_double('widget-scale');
    let iconIdle = 0;
    function arrange(width, height) {
        if (!items.length || width <= 0 || height <= 0) return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const zoom = widgetScale;
        const cols = Math.min(items.length, Math.max(1, Math.min(3, Math.floor(width / (54 * scale * zoom)))));
        const rows = Math.ceil(items.length / cols);
        const gap = Math.round(8 * scale * zoom);
        const cellW = Math.floor(Math.min(90 * scale * zoom, (width - gap * (cols - 1)) / cols));
        const cellH = Math.floor(Math.min(90 * scale * zoom, (height - gap * (rows - 1)) / rows));
        const top = Math.round((height - rows * cellH - (rows - 1) * gap) / 2);
        const iconSize = Math.max(12, Math.floor(Math.min(showLabels ? 48 : 60, (cellW - 12 * scale * zoom) / scale, (cellH - (showLabels ? 28 : 12) * scale * zoom) / scale)));
        items.forEach((item, i) => {
            const row = Math.floor(i / cols), col = i % cols;
            const count = Math.min(cols, items.length - row * cols);
            const left = Math.round((width - count * cellW - (count - 1) * gap) / 2);
            const x = left + col * (cellW + gap), y = top + row * (cellH + gap);
            item.allocate(new Clutter.ActorBox({x1: x, y1: y, x2: x + cellW, y2: y + cellH}));
        });
        if (!iconIdle && icons.some(icon => icon.icon_size !== iconSize)) {
            iconIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                iconIdle = 0; icons.forEach(icon => { icon.icon_size = iconSize; });
                return GLib.SOURCE_REMOVE;
            });
        }
    }
    layout.arrange = arrange;
    actor.add_child(grid);
    if (!apps.length) actor.add_child(label('在设置中添加常用应用', 'perch-caption'));
    return {actor, grid, resize() { widgetScale = settings.get_double('widget-scale'); layout.layout_changed(); }, destroy() { if (iconIdle) GLib.Source.remove(iconIdle); layout.arrange = null; }};
}
