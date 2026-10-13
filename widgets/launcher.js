// SPDX-License-Identifier: GPL-3.0-only
import St from 'gi://St';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import Clutter from 'gi://Clutter';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {column, label, button} from './ui.js';
import {launchApp} from '../lib/apps.js';
export function createLauncher(settings) {
    const actor = column('perch-content perch-launcher');
    const heading = new St.BoxLayout();
    const title = label('常用应用', 'perch-widget-heading'); title.x_expand = true; heading.add_child(title);
    heading.add_child(button('emblem-system-symbolic', '配置常用应用', () => Extension.lookupByURL(import.meta.url)?.openPreferences()));
    actor.add_child(heading);
    const grid = new St.Widget({layout_manager: new Clutter.GridLayout(), x_expand: true, y_expand: true});
    const apps = settings.get_strv('launcher-apps').slice(0, 9);
    apps.forEach((id, index) => {
        const info = GioUnix.DesktopAppInfo.new(id);
        const item = new St.Button({can_focus: true, style_class: 'perch-launcher-app', accessible_name: info?.get_display_name() ?? id});
        const body = column(); body.add_child(new St.Icon({gicon: info?.get_icon() ?? Gio.ThemedIcon.new('application-x-executable'), icon_size: 36, x_align: Clutter.ActorAlign.CENTER}));
        const text = label(info?.get_display_name() ?? '未安装', 'perch-launcher-name'); text.x_align = Clutter.ActorAlign.CENTER; body.add_child(text); item.child = body;
        item.connect('clicked', () => launchApp(id)); grid.layout_manager.attach(item, index % 3, Math.floor(index / 3), 1, 1);
    });
    actor.add_child(grid);
    if (!apps.length) actor.add_child(label('在设置中添加常用应用', 'perch-caption'));
    return {actor, grid, destroy() {}};
}
