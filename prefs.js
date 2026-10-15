// SPDX-License-Identifier: GPL-3.0-only
import {photoInstances} from './lib/instances.js';
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
        const componentPage = new Adw.PreferencesPage({name: 'components', title: '组件', icon_name: 'preferences-desktop-apps-symbolic'});
        window.add(componentPage);
        const componentGroup = new Adw.PreferencesGroup({title: '桌面组件', description: '打开组件后展开其设置；关闭不会删除内容。'});
        componentPage.add(componentGroup);
        const components = {};
        for (const [type, title] of Object.entries(WIDGET_NAMES)) {
            const row = new Adw.ExpanderRow({title, show_enable_switch: true});
            settings.bind(`show-${type}`, row, 'enable-expansion', Gio.SettingsBindFlags.DEFAULT);
            componentGroup.add(row);
            components[type] = {addIndependent(child) { componentGroup.add(child); }, add(child) { row.add_row(child); settings.bind(`show-${type}`, child, 'sensitive', Gio.SettingsBindFlags.GET); }, remove(child) { row.remove(child); }};
        }
        addPhotoAndSizePage(window, settings, components);
        addApplicationsPage(window, settings, components);
        const appearance = new Adw.PreferencesGroup({title: '你的桌面，一目了然', description: '栖格 Perch · 轻盈、清晰的桌面组件'});
        page.add(appearance);
        const themes = ['system', 'light', 'dark'];
        const theme = new Adw.ComboRow({title: '卡片主题', model: Gtk.StringList.new(['跟随系统', '浅色', '深色']), selected: Math.max(0, themes.indexOf(settings.get_string('theme')))});
        theme.connect('notify::selected', () => settings.set_string('theme', themes[theme.selected]));
        appearance.add(theme);
        const scale = new Adw.SpinRow({title: '组件整体大小', subtitle: '默认 75%；可在 50%–125% 之间调整', adjustment: new Gtk.Adjustment({lower: 50, upper: 125, step_increment: 5, value: settings.get_double('widget-scale') * 100})});
        scale.connect('notify::value', () => settings.set_double('widget-scale', scale.value / 100)); appearance.add(scale);
        const addSwitch = (group, key, title, subtitle = '') => {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        };
        addSwitch(appearance, 'translucent', '通透卡片', '让壁纸颜色轻轻透入卡片');
        addSwitch(components.clock, 'show-seconds', '显示秒针');
        addSwitch(components.note, 'note-popup', '在弹窗中编辑', '关闭后直接在组件内编辑');
        addSwitch(components.note, 'note-show-date', '显示最后修改日期');
        addSwitch(components.launcher, 'launcher-labels', '显示应用名称');
        addSwitch(components.launcher, 'launcher-auto-size', '按应用数量调整尺寸', '手动调整尺寸后自动关闭');
        const interval = new Adw.SpinRow({title: '系统监控刷新间隔', subtitle: '单位：秒', adjustment: new Gtk.Adjustment({lower: 2, upper: 30, step_increment: 1, page_increment: 5})});
        settings.bind('sample-seconds', interval, 'value', Gio.SettingsBindFlags.DEFAULT);
        components.system.add(interval);
        const focus = components.focus;
        const reminder = new Adw.ComboRow({title: '结束提醒', model: Gtk.StringList.new(['仅通知', '通知和提示音']), selected: settings.get_boolean('focus-sound') ? 1 : 0});
        reminder.connect('notify::selected', () => settings.set_boolean('focus-sound', reminder.selected === 1));
        focus.add(reminder);
        for (const [key, title, upper] of [['focus-minutes', '专注时长（分钟）', 120], ['break-minutes', '休息时长（分钟）', 60]]) {
            const row = new Adw.SpinRow({title, adjustment: new Gtk.Adjustment({lower: 1, upper, step_increment: 1})});
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            focus.add(row);
        }
        const weather = components.weather;
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

function addPhotoAndSizePage(window, settings, components) {
    const photos = components.photo;
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
    addExtraPhotos(photos, window, settings);
    for (const [type, presets] of Object.entries(SIZE_PRESETS)) {
        const row = new Adw.ComboRow({title: '组件尺寸', model: Gtk.StringList.new(['选择尺寸…', ...presets.map(([w, h]) => `${w} × ${h}`)])});
        row.connect('notify::selected', () => {
            if (row.selected === 0) return;
            const [w, h] = presets[row.selected - 1];
            const serial = settings.get_value('size-request').deep_unpack()[3];
            settings.set_value('size-request', new GLib.Variant('(suuu)', [type, w * 4, h * 4, (serial + 1) >>> 0]));
            row.selected = 0;
            window.add_toast(new Adw.Toast({title: `已请求将${WIDGET_NAMES[type]}调整为 ${w} × ${h}`}));
        });
        components[type].add(row);
    }
}

function addApplicationsPage(window, settings, components) {
    const apps = Gio.AppInfo.get_all().filter(a => a.should_show() && a.get_id()).sort((a, b) => a.get_display_name().localeCompare(b.get_display_name(), 'zh-CN'));
    const ids = ['', ...apps.map(a => a.get_id())];
    const names = ['未选择', ...apps.map(a => a.get_display_name())];
    const music = components.music;
    const player = new Adw.ComboRow({title: '默认播放器', model: Gtk.StringList.new(names), selected: Math.max(0, ids.indexOf(settings.get_string('music-player')))});
    player.connect('notify::selected', () => settings.set_string('music-player', ids[player.selected])); music.add(player);
    const group = components.launcher;
    const selection = settings.get_strv('launcher-apps').slice(0, 9);
    for (let i = 0; i < 9; i++) {
        const row = new Adw.ComboRow({title: `应用 ${i + 1}`, model: Gtk.StringList.new(names), selected: Math.max(0, ids.indexOf(selection[i] || ''))});
        row.connect('notify::selected', () => { selection[i] = ids[row.selected]; settings.set_strv('launcher-apps', [...new Set(selection.filter(Boolean))]); }); group.add(row);
    }
}

function addExtraPhotos(photos, window, settings) {
    const section = new Adw.ExpanderRow({title: '独立相框', subtitle: '最多新增八个，每个独立设置；移除相框保留原图'});
    photos.addIndependent(section);
    const group = {add(row) { section.add_row(row); }, remove(row) { section.remove(row); }};
    const rows = [];
    const write = (id, changes) => settings.set_string('photo-instances', JSON.stringify(photoInstances(settings).map(p => p.id === id ? {...p, ...changes} : p)));
    const cancel = new Gio.Cancellable(); window.connect('close-request', () => { cancel.cancel(); return false; });
    function draw() {
        for (const row of rows) group.remove(row); rows.length = 0;
        for (const p of photoInstances(settings)) {
            const row = new Adw.ExpanderRow({title: GLib.path_get_basename(p.source), subtitle: p.source});
            group.add(row); rows.push(row);
            const remove = new Gtk.Button({icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER, tooltip_text: '移除此相框，保留原图'});
            remove.connect('clicked', () => { settings.set_string('photo-instances', JSON.stringify(photoInstances(settings).filter(x => x.id !== p.id))); draw(); }); row.add_suffix(remove);
            const fit = new Adw.ComboRow({title: '图片呈现', model: Gtk.StringList.new(['填满卡片', '完整显示']), selected: p.fit === 'contain' ? 1 : 0});
            fit.connect('notify::selected', () => write(p.id, {fit: fit.selected ? 'contain' : 'cover'})); row.add_row(fit);
            const interval = new Adw.SpinRow({title: '轮播间隔（秒）', adjustment: new Gtk.Adjustment({lower: 5, upper: 3600, step_increment: 5, value: p.interval})});
            interval.connect('notify::value', () => write(p.id, {interval: Math.round(interval.value)})); row.add_row(interval);
            const pause = new Adw.SwitchRow({title: '暂停轮播', active: p.paused}); pause.connect('notify::active', () => write(p.id, {paused: pause.active})); row.add_row(pause);
            const presets = SIZE_PRESETS.photo;
            const size = new Adw.ComboRow({title: '尺寸', model: Gtk.StringList.new(['选择尺寸…', ...presets.map(([w,h]) => `${w} × ${h}`)])});
            size.connect('notify::selected', () => { if (!size.selected) return; const [w,h] = presets[size.selected - 1]; settings.set_value('size-request', new GLib.Variant('(suuu)', [p.id,w*4,h*4,(settings.get_value('size-request').deep_unpack()[3]+1)>>>0])); size.selected = 0; }); row.add_row(size);
        }
    }
    const add = new Adw.ActionRow({title: '新增相框'}); group.add(add);
    for (const [folder, title] of [[false, '选择图片'], [true, '选择文件夹']]) {
        const button = new Gtk.Button({label: title, valign: Gtk.Align.CENTER}); add.add_suffix(button);
        button.connect('clicked', () => {
            if (photoInstances(settings).length >= 8) { window.add_toast(new Adw.Toast({title: '最多新增八个相框'})); return; }
            const dialog = new Gtk.FileDialog({title: '新增独立相框'});
            const done = (d,r) => {
                try {
                    const path = (folder ? d.select_folder_finish(r) : d.open_finish(r)).get_path();
                    if (!path || cancel.is_cancelled()) return;
                    const current = photoInstances(settings); if (current.length >= 8) return;
                    current.push({id: `photo-${GLib.uuid_string_random()}`, source: path, fit: 'cover', interval: 30, paused: false});
                    settings.set_string('photo-instances', JSON.stringify(current)); draw();
                } catch (_) { /* The chooser was cancelled. */ }
            };
            if (folder) dialog.select_folder(window,cancel,done); else dialog.open(window,cancel,done);
        });
    }
    draw();
}
