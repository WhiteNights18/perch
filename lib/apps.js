// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
export function launchApp(id) {
    const app = Shell.AppSystem.get_default().lookup_app(id);
    if (app) { app.activate(); return true; }
    try {
        const info = GioUnix.DesktopAppInfo.new(id);
        if (!info) throw new Error('应用未安装');
        info.launch([], global.create_app_launch_context(0, -1));
        return true;
    } catch (_) { Main.notify('栖格', '无法打开应用，请在设置中重新选择'); return false; }
}
