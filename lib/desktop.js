// SPDX-License-Identifier: GPL-3.0-only
import {photoInstances, baseType} from './instances.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Card} from './card.js';
import {resizeInPlace, supportedSize, WIDGET_NAMES} from './sizes.js';
import {TYPES, arrange, propose, defaultState} from './layout.js';
import {chineseFontStyle} from './typography.js';

export class Desktop {
    constructor(settings, interfaceSettings, store, onStatus, onEditing) {
        this._settings = settings;
        this._interface = interfaceSettings;
        this._store = store;
        this._onStatus = onStatus;
        this._onEditing = onEditing;
        this.editing = false;
        this.cards = new Map();
        this.placed = {};
        this._signals = [];
        this._idle = 0;
        this._refreshTypes = new Set();
        try {
            this._initialize();
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    _initialize() {
        this.actor = new St.Widget({layout_manager: new Clutter.FixedLayout(), style_class: 'perch-desktop', clip_to_allocation: true});
        this.actor.set_style(chineseFontStyle());
        this._grid = new St.DrawingArea({reactive: false});
        this._grid.connect('repaint', area => this._drawGrid(area));
        this.actor.add_child(this._grid);
        this._mount();
        global.focus_manager.add_group(this.actor);
        this._connect(Main.layoutManager, 'monitors-changed', () => this._schedule());
        this._connect(global.display, 'workareas-changed', () => this._schedule());
        this._connect(global.display, 'restacked', () => this._restack());
        this._connect(St.ThemeContext.get_for_stage(global.stage), 'notify::scale-factor', () => this._schedule());
        this._connect(Main.overview, 'showing', () => { this.setEditing(false); this._visibility(); });
        this._connect(Main.overview, 'hidden', () => this._visibility());
        this._connect(Main.sessionMode, 'updated', () => { this.setEditing(false); this._visibility(); });
        this._connect(this._settings, 'changed', (_settings, key) => {
            if (key === 'photo-instances') for (const id of this.cards.keys()) if (baseType(id) === 'photo' && id !== 'photo') this._refreshTypes.add(id);
            const type = key.startsWith('photo-') && key !== 'photo-instances' ? 'photo' : {
                'note-popup': 'note', 'note-show-date': 'note', 'launcher-labels': 'launcher', 'music-player': 'music', 'launcher-apps': 'launcher', 'show-seconds': 'clock', 'sample-seconds': 'system', 'weather-location': 'weather',
            }[key];
            if (type) this._refreshTypes.add(type);
            this._schedule();
        });
        this._connect(this._interface, 'changed::color-scheme', () => this._theme());
        const escape = new Clutter.KeyController();
        escape.connect('key-press', controller => {
            const [, key] = controller.get_key();
            if (key === Clutter.KEY_Escape && this.editing) {
                this.setEditing(false);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this.actor.add_action(escape);
        this.rebuild();
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _schedule() {
        if (this._idle)
            return;
        // Settings may change inside a card callback. Rebuild after it returns.
        this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idle = 0;
            this.rebuild();
            return GLib.SOURCE_REMOVE;
        });
    }

    _mount() {
        if (this.editing) {
            Main.layoutManager.addChrome(this.actor);
        } else {
            // This private reference is isolated here for future Shell changes.
            // A sibling survives wallpaper replacement while staying below windows.
            global.window_group.insert_child_above(this.actor, Main.layoutManager._backgroundGroup);
        }
    }

    _restack() {
        // Mutter can place newly mapped windows below extension-owned actors.
        // Restore the desktop layer after each compositor window restack.
        if (!this.editing && this.actor?.get_parent() === global.window_group)
            global.window_group.set_child_above_sibling(this.actor, Main.layoutManager._backgroundGroup);
    }

    setEditing(editing) {
        if (editing === this.editing)
            return;
        for (const card of this.cards.values())
            card.setEditing(editing);
        if (this.editing)
            Main.layoutManager.removeChrome(this.actor);
        this.actor.get_parent()?.remove_child(this.actor);
        this.editing = editing;
        this._mount();
        this.actor.reactive = editing;
        this._grid.visible = editing;
        this._theme();
        if (editing)
            this.actor.grab_key_focus();
        this._visibility();
        this._onEditing(editing);
    }

    _visibility() {
        this.actor.visible = !Main.overview.visible && !Main.sessionMode.isLocked && Main.sessionMode.currentMode === 'user';
    }

    _theme() {
        const theme = this._settings.get_string('theme');
        const dark = theme === 'dark' || (theme === 'system' && this._interface.get_string('color-scheme') === 'prefer-dark');
        this.actor.style_class = `perch-desktop perch-native ${dark ? 'perch-dark' : 'perch-light'}${this._settings.get_boolean('translucent') ? ' perch-translucent' : ''}${this.editing ? ' perch-edit-mode' : ''}`;
    }

    rebuild() {
        const reset = this._settings.get_uint('reset-layout');
        if (this._store.state.layoutReset !== reset) {
            this._store.state.layout = {...this._store.state.layout, ...defaultState().layout};
            this._store.state.layoutReset = reset;
            this._store.changed();
        }
        const monitor = Main.layoutManager.primaryIndex;
        if (monitor < 0 || !Main.layoutManager.primaryMonitor) {
            this.actor.hide();
            return;
        }
        const work = Main.layoutManager.getWorkAreaForMonitor(monitor);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const zoom = this._settings.get_double('widget-scale');
        // Render text at its final size; never resample a scaled actor tree.
        this.actor.set_scale(1, 1);
        if (this._zoom !== zoom) {
            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            if (this._sheet) { theme.unload_stylesheet(this._sheet); this._sheet.delete(null); }
            const source = Extension.lookupByURL(import.meta.url).dir.get_child('stylesheet.css').load_contents(null)[1];
            const css = new TextDecoder().decode(source).replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^{}]+)\{/g, (_, selectors) => selectors.split(',').map(s => s.trim().startsWith('.perch-desktop') ? s.trim().replace('.perch-desktop', '.perch-desktop.perch-native') : `.perch-native ${s.trim()}`).join(', ') + ' {').replace(/(\d+(?:\.\d+)?)(px|pt)\b/g, (_, n, unit) => `${Math.max(1, Math.round(Number(n) * zoom))}${unit}`);
            const [file, stream] = Gio.File.new_tmp('perch-style-XXXXXX.css');
            stream.get_output_stream().write_all(new TextEncoder().encode(css), null); stream.close(null);
            this._sheet = file; theme.load_stylesheet(file); this._zoom = zoom;
        }
        const margin = 20 * scale;
        this.pitch = Math.round(32 * scale * zoom);
        this.gap = Math.round(12 * scale * zoom);
        this.cols = Math.max(0, Math.floor((work.width - 2 * margin) / this.pitch));
        this.rows = Math.max(0, Math.floor((work.height - 2 * margin) / this.pitch));
        this.actor.set_position(work.x + margin, work.y + margin);
        this.actor.set_size(Math.max(1, work.width - 2 * margin), Math.max(1, work.height - 2 * margin));
        this._grid.set_size(this.actor.width, this.actor.height);
        this._grid.visible = this.editing;
        this._grid.queue_repaint();
        const extras = photoInstances(this._settings);
        const enabled = [...TYPES.filter(t => this._settings.get_boolean(`show-${t}`)), ...extras.map(p => p.id)];
        for (const p of extras) this._store.state.layout[p.id] ??= {x: 0, y: 0, w: 8, h: 8};
        const layout = {...this._store.state.layout};
        if (this._settings.get_boolean('launcher-auto-size')) {
            const count = Math.max(1, this._settings.get_strv('launcher-apps').length);
            const columns = count <= 3 ? count : Math.ceil(Math.sqrt(count));
            const rows = Math.ceil(count / columns);
            layout.launcher = {...layout.launcher, w: Math.max(8, columns * 3), h: Math.max(6, rows * (this._settings.get_boolean('launcher-labels') ? 4 : 3) + 2)};
        }
        this.placed = arrange(layout, enabled, this.cols, this.rows);
        const [sizeType, sizeW, sizeH, serial] = this._settings.get_value('size-request').deep_unpack();
        let sizeError = '';
        if (serial !== this._store.state.sizeRequest) {
            this._store.state.sizeRequest = serial;
            if (supportedSize(sizeType, sizeW, sizeH)) {
                if (sizeType === 'launcher') this._settings.set_boolean('launcher-auto-size', false);
                const result = resizeInPlace(this.placed, sizeType, sizeW, sizeH, this.cols, this.rows);
                if (result) {
                    this._store.state.layout[sizeType] = result;
                    if (enabled.includes(sizeType)) this.placed[sizeType] = result;
                } else sizeError = `${WIDGET_NAMES[baseType(sizeType)]}：空间不足，已保留原尺寸`;
            }
            this._store.changed();
        }
        // Preserve services and editing state when only the layout or theme changes.
        for (const [type, card] of this.cards) {
            if (!enabled.includes(type) || !this.placed[type] || this._refreshTypes.has(type)) {
                card.destroy();
                this.cards.delete(type);
            }
        }
        this._refreshTypes.clear();
        for (const type of enabled) {
            if (!this.placed[type])
                continue;
            let card = this.cards.get(type);
            if (!card) {
                card = new Card(type, this._settings, this._store, (...args) => this.change(...args));
                this.cards.set(type, card);
                this.actor.add_child(card.actor);
            }
            card.setRect(this.placed[type], this.pitch, this.gap);
            card.setEditing(this.editing);
        }
        const missing = enabled.length - this.cards.size;
        if (sizeError) Main.notify('栖格 · 调整尺寸', sizeError);
        this._onStatus(sizeError || (missing ? `屏幕空间不足，${missing} 个组件暂时隐藏` : ''));
        this._theme();
        this._visibility();
    }

    change(type, rect, commit) {
        const accepted = propose(this.placed, type, rect, this.cols, this.rows);
        if (!accepted)
            return false;
        if (type === 'launcher' && this.placed[type] && (rect.w !== this.placed[type].w || rect.h !== this.placed[type].h)) this._settings.set_boolean('launcher-auto-size', false);
        this.placed[type] = accepted;
        this.cards.get(type)?.setRect(accepted, this.pitch, this.gap);
        if (commit) {
            this._store.state.layout[type] = {...accepted};
            this._store.changed();
        }
        return true;
    }

    _drawGrid(area) {
        if (!this.pitch)
            return;
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        cr.setSourceRGBA(0.55, 0.64, 0.72, 0.45);
        for (let y = 0; y < h; y += this.pitch) {
            for (let x = 0; x < w; x += this.pitch) {
                cr.arc(x + 1, y + 1, 1.3, 0, Math.PI * 2);
                cr.fill();
            }
        }
        cr.$dispose();
    }

    destroy() {
        if (this._idle)
            GLib.Source.remove(this._idle);
        this._idle = 0;
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];
        for (const card of this.cards.values())
            card.destroy();
        this.cards.clear();
        if (this.actor)
            global.focus_manager.remove_group(this.actor);
        if (this.editing && this.actor)
            Main.layoutManager.removeChrome(this.actor);
        if (this._sheet) {
            St.ThemeContext.get_for_stage(global.stage).get_theme().unload_stylesheet(this._sheet);
            this._sheet.delete(null); this._sheet = null;
        }
        this.actor?.destroy();
        this.actor = null;
    }
}
