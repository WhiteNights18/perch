// SPDX-License-Identifier: GPL-3.0-only
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import {WeatherClient} from './lib/weather.js';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {chineseFontStyle} from './lib/typography.js';

export default class PerchPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.add_css_class('perch-preferences');
        const provider = new Gtk.CssProvider();
        provider.load_from_string(`.perch-preferences { ${chineseFontStyle()} }`);
        const display = window.get_display();
        Gtk.StyleContext.add_provider_for_display(display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        window.connect('close-request', () => {
            Gtk.StyleContext.remove_provider_for_display(display, provider);
            return false;
        });
        window.set_default_size(620, 700);
        const page = new Adw.PreferencesPage({title: '栖格', icon_name: 'view-grid-symbolic'});
        window.add(page);
        const appearance = new Adw.PreferencesGroup({title: '你的桌面，一目了然', description: '栖格 Perch · 轻盈、清晰的桌面组件'});
        page.add(appearance);
        const themes = ['system', 'light', 'dark'];
        const theme = new Adw.ComboRow({title: '卡片主题', model: Gtk.StringList.new(['跟随系统', '浅色', '深色']), selected: Math.max(0, themes.indexOf(settings.get_string('theme')))});
        theme.connect('notify::selected', () => settings.set_string('theme', themes[theme.selected]));
        appearance.add(theme);
        const addSwitch = (group, key, title, subtitle = '') => {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        };
        addSwitch(appearance, 'translucent', '通透卡片', '让壁纸颜色轻轻透入卡片');
        const widgets = new Adw.PreferencesGroup({title: '桌面组件', description: '关闭组件会保留便签内容和布局。'});
        page.add(widgets);
        addSwitch(widgets, 'show-clock', '时钟与日期');
        addSwitch(widgets, 'show-seconds', '显示秒针');
        addSwitch(widgets, 'show-note', '随手记');
        addSwitch(widgets, 'show-system', '系统状态');
        for (const [key, title] of [['calendar', '月历'], ['focus', '番茄钟'], ['music', '音乐控制'], ['weather', '天气']])
            addSwitch(widgets, `show-${key}`, title);
        const interval = new Adw.SpinRow({title: '系统监控刷新间隔', subtitle: '单位：秒', adjustment: new Gtk.Adjustment({lower: 2, upper: 30, step_increment: 1, page_increment: 5})});
        settings.bind('sample-seconds', interval, 'value', Gio.SettingsBindFlags.DEFAULT);
        widgets.add(interval);
        const focus = new Adw.PreferencesGroup({title: '番茄钟', description: '时长将在下一次重置或切换阶段时使用。隐藏组件会继续计时，重新显示时检查完成状态。'});
        page.add(focus);
        for (const [key, title, upper] of [['focus-minutes', '专注时长（分钟）', 120], ['break-minutes', '休息时长（分钟）', 60]]) {
            const row = new Adw.SpinRow({title, adjustment: new Gtk.Adjustment({lower: 1, upper, step_increment: 1})});
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            focus.add(row);
        }
        const weather = new Adw.PreferencesGroup({title: '天气城市', description: '每 15 分钟更新。仅向 Open-Meteo 发送所选城市坐标；搜索时发送城市名称。数据由天气模型提供。'});
        page.add(weather);
        const selected = new Adw.ActionRow({title: '当前城市', subtitle: settings.get_value('weather-location').deep_unpack()[0]});
        weather.add(selected);
        const query = new Adw.EntryRow({title: '输入城市名称'});
        weather.add(query);
        const search = new Gtk.Button({label: '搜索', valign: Gtk.Align.CENTER});
        query.add_suffix(search);
        const results = [];
        let client = null;
        let closed = false;
        search.connect('clicked', async () => {
            const text = query.text.trim();
            if (text.length < 2) { window.add_toast(new Adw.Toast({title: '请输入至少两个字'})); return; }
            client?.destroy();
            client = new WeatherClient();
            const request = client;
            search.sensitive = false;
            for (const row of results) weather.remove(row);
            results.length = 0;
            try {
                const places = await request.search(text);
                if (closed || client !== request) return;
                if (!places.length) window.add_toast(new Adw.Toast({title: '没有找到城市，试试拼音或英文名称'}));
                for (const place of places) {
                    const row = new Adw.ActionRow({title: place.name, subtitle: [place.admin1, place.country].filter(Boolean).join(' · ')});
                    const choose = new Gtk.Button({label: '使用', valign: Gtk.Align.CENTER});
                    choose.connect('clicked', () => {
                        settings.set_value('weather-location', new GLib.Variant('(sdd)', [place.name, place.latitude, place.longitude]));
                        selected.subtitle = place.name;
                        window.add_toast(new Adw.Toast({title: `天气城市已设为${place.name}`}));
                    });
                    row.add_suffix(choose);
                    weather.add(row);
                    results.push(row);
                }
            } catch (_error) {
                if (!closed) window.add_toast(new Adw.Toast({title: '城市搜索失败，请检查网络后重试'}));
            } finally {
                if (!closed) search.sensitive = true;
            }
        });
        window.connect('close-request', () => { closed = true; client?.destroy(); return false; });
        const layout = new Adw.PreferencesGroup({title: '布局', description: '从顶栏开启编辑模式。拖动标题移动，拖动右下角缩放；方向键移动，Shift + 方向键缩放，Esc 完成。'});
        page.add(layout);
        const row = new Adw.ActionRow({title: '恢复初始位置', subtitle: '只重置布局，保留便签内容'});
        const reset = new Gtk.Button({label: '重置布局', valign: Gtk.Align.CENTER});
        reset.connect('clicked', () => {
            settings.set_uint('reset-layout', (settings.get_uint('reset-layout') + 1) >>> 0);
            window.add_toast(new Adw.Toast({title: '已请求重置布局'}));
        });
        row.add_suffix(reset);
        layout.add(row);
    }
}
