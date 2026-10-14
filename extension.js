// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Desktop} from './lib/desktop.js';
import {Store} from './lib/store.js';
import {TYPES} from './lib/layout.js';
import {TITLES} from './widgets/index.js';
import {chineseFontStyle, applyChineseLanguage} from './lib/typography.js';

export default class Perch extends Extension {
    enable() {
        this._active = true;
        this._settings = this.getSettings();
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._indicator = new PanelMenu.Button(0.5, '栖格 Perch');
        this._indicator.set_style('padding: 0; min-width: 0; -minimum-hpadding: 4px; -natural-hpadding: 4px;');
        this._indicator.add_child(new St.Icon({icon_name: 'view-grid-symbolic', icon_size: 16, style: 'padding: 0; margin: 0;', style_class: 'system-status-icon'}));
        this._indicator.menu.addMenuItem(new PopupMenu.PopupMenuItem('栖格 · Perch', {reactive: false}));
        this._edit = new PopupMenu.PopupSwitchMenuItem('编辑桌面布局', false);
        this._edit.setSensitive(false);
        this._edit.connect('toggled', (_item, editing) => {
            this._desktop?.setEditing(editing);
            this._indicator.menu.close();
        });
        this._indicator.menu.addMenuItem(this._edit);
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._toggles = new Map();
        for (const type of TYPES) {
            const item = new PopupMenu.PopupSwitchMenuItem(TITLES[type], this._settings.get_boolean(`show-${type}`));
            item.connect('toggled', (_item, value) => this._settings.set_boolean(`show-${type}`, value));
            this._indicator.menu.addMenuItem(item);
            this._toggles.set(type, item);
        }
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._indicator.menu.addAction('外观与设置', () => this.openPreferences());
        this._status = new PopupMenu.PopupMenuItem('正在载入…', {reactive: false});
        this._indicator.menu.addMenuItem(this._status);
        this._indicator.menu.box.set_style(chineseFontStyle());
        applyChineseLanguage(this._indicator.menu.box);
        this._settingsSignal = this._settings.connect('changed', () => {
            for (const [type, item] of this._toggles)
                item.setToggleState(this._settings.get_boolean(`show-${type}`));
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._storageError = '';
        this._store = new Store(message => {
            this._storageError = message;
            this._showStatus(message);
        });
        const store = this._store;
        store.load().then(() => {
            if (!this._active || this._store !== store)
                return;
            this._desktop = new Desktop(this._settings, this._interface, store,
                message => this._showStatus(this._storageError || message),
                editing => this._edit.setToggleState(editing));
            this._edit.setSensitive(true);
        }).catch(error => {
            if (this._active && this._store === store) {
                this._showStatus(`载入失败：${error.message}`);
                console.error(`[Perch] ${error.stack}`);
            }
        });
    }

    _showStatus(message) {
        this._status.label.text = message || '拖动标题移动 · 拖动右下角缩放';
    }

    disable() {
        this._active = false;
        this._desktop?.destroy();
        this._desktop = null;
        this._store?.close();
        this._store = null;
        if (this._settingsSignal)
            this._settings.disconnect(this._settingsSignal);
        this._settingsSignal = 0;
        this._indicator?.destroy();
        this._indicator = null;
        this._edit = null;
        this._status = null;
        this._toggles = null;
        this._settings = null;
        this._interface = null;
    }
}
