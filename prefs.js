// SPDX-License-Identifier: GPL-3.0-only
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import {WeatherClient} from './lib/weather.js';
import {SIZE_PRESETS, WIDGET_NAMES} from './lib/sizes.js';
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
        addPhotoAndSizePage(window, settings);
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
        addSwitch(widgets, 'show-photo', '照片与轮播');
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

function addPhotoAndSizePage(window, settings) {
    const page = new Adw.PreferencesPage({name: 'photos', title: '照片与尺寸', icon_name: 'image-x-generic-symbolic'});
    window.add(page);
    const photos = new Adw.PreferencesGroup({title: '桌面相框', description: '选择本地图片，或轮播文件夹内的图片。不上传文件，不读取子文件夹。'});
    page.add(photos);
    const pathRow = new Adw.ActionRow({title: '图片来源', subtitle: settings.get_string('photo-source') || '尚未选择'});
    photos.add(pathRow);
    const cancel = new Gio.Cancellable();
    window.connect('close-request', () => { cancel.cancel(); return false; });
    for (const [folder, title] of [[false, '选择图片'], [true, '选择文件夹']]) {
        const choose = new Gtk.Button({label: title, valign: Gtk.Align.CENTER});
        choose.connect('clicked', () => {
            const dialog = new Gtk.FileDialog({title, modal: true});
            if (!folder) {
                const filter = new Gtk.FileFilter({name: '图片（PNG、JPEG、WebP、BMP、GIF）'});
                for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']) filter.add_suffix(ext);
                const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
                filters.append(filter);
                dialog.filters = filters;
            }
            const callback = (d, result) => {
                try {
                    const file = folder ? d.select_folder_finish(result) : d.open_finish(result);
                    const path = file.get_path();
                    if (!path) { window.add_toast(new Adw.Toast({title: '请选择本地文件'})); return; }
                    settings.set_string('photo-source', path);
                    settings.set_boolean('show-photo', true);
                    pathRow.subtitle = path;
                } catch (error) {
                    if (!cancel.is_cancelled() && !error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                        window.add_toast(new Adw.Toast({title: '选择失败，请重试'}));
                }
            };
            if (folder) dialog.select_folder(window, cancel, callback);
            else dialog.open(window, cancel, callback);
        });
        pathRow.add_suffix(choose);
    }
    const fit = new Adw.ComboRow({title: '图片呈现', model: Gtk.StringList.new(['填满卡片（居中裁切）', '完整显示（保留留白）']), selected: settings.get_string('photo-fit') === 'cover' ? 0 : 1});
    fit.connect('notify::selected', () => settings.set_string('photo-fit', fit.selected === 0 ? 'cover' : 'contain'));
    photos.add(fit);
    const interval = new Adw.SpinRow({title: '轮播间隔（秒）', subtitle: '按文件名自然顺序播放；GIF 显示首帧。', adjustment: new Gtk.Adjustment({lower: 5, upper: 3600, step_increment: 5, page_increment: 30})});
    settings.bind('photo-interval', interval, 'value', Gio.SettingsBindFlags.DEFAULT);
    photos.add(interval);
    const paused = new Adw.SwitchRow({title: '暂停自动轮播'});
    settings.bind('photo-paused', paused, 'active', Gio.SettingsBindFlags.DEFAULT);
    photos.add(paused);
    const sizes = new Adw.PreferencesGroup({title: '组件尺寸', description: '宽 × 高。2 × 2 为小方卡，3 × 3 为大方卡，2 × 4 为竖版。选择规格即调整；空间不足时保留原尺寸。也可在桌面编辑模式拖动右下角自由缩放。'});
    page.add(sizes);
    for (const [type, presets] of Object.entries(SIZE_PRESETS)) {
        const row = new Adw.ComboRow({title: WIDGET_NAMES[type], model: Gtk.StringList.new(['选择尺寸…', ...presets.map(([w, h]) => `${w} × ${h}`)])});
        row.connect('notify::selected', () => {
            if (row.selected === 0) return;
            const [w, h] = presets[row.selected - 1];
            const serial = settings.get_value('size-request').deep_unpack()[3];
            settings.set_value('size-request', new GLib.Variant('(suuu)', [type, w * 4, h * 4, (serial + 1) >>> 0]));
            row.selected = 0;
            window.add_toast(new Adw.Toast({title: `已请求将${WIDGET_NAMES[type]}调整为 ${w} × ${h}`}));
        });
        sizes.add(row);
    }
}
