// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {createWidget, TITLES, ICONS} from '../widgets/index.js';
import {applyChineseLanguage} from './typography.js';

export class Card {
    constructor(type, settings, store, onChange) {
        this.type = type;
        this._onChange = onChange;
        this._editing = false;
        this.actor = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            style_class: `perch-card perch-card-${type}`,
        });
        this._header = new St.BoxLayout({reactive: true, can_focus: true, y_align: Clutter.ActorAlign.START, y_expand: true, x_expand: true, style_class: 'perch-header', accessible_name: `${TITLES[type]}：编辑模式下拖动或用方向键移动，Shift 加方向键缩放`});
        this._header.add_child(new St.Icon({icon_name: ICONS[type], icon_size: 16, style_class: 'perch-muted'}));
        this._header.add_child(new St.Label({text: TITLES[type], x_expand: true, style_class: 'perch-title'}));
        this._grip = new St.Label({text: '⠿', style_class: 'perch-grip'});
        this._header.add_child(this._grip);
        this._widget = createWidget(type, settings, store);
        this.actor.add_child(this._widget.actor);
        this.actor.add_child(this._header);
        this._resize = new St.BoxLayout({reactive: true, can_focus: true, x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.END, style_class: 'perch-resize', accessible_name: `调整${TITLES[type]}大小`});
        this._resize.add_child(new St.Icon({icon_name: 'view-fullscreen-symbolic', icon_size: 12}));
        this.actor.add_child(this._resize);
        this._gestures = [];
        this._attachGesture(this._header, false);
        this._attachGesture(this._resize, true);
        for (const [actor, resize] of [[this._header, false], [this._resize, true]]) {
            const keys = new Clutter.KeyController();
            keys.connect('key-press', controller => {
                if (!this._editing)
                    return Clutter.EVENT_PROPAGATE;
                const [, symbol] = controller.get_key();
                const directions = {[Clutter.KEY_Left]: [-1, 0], [Clutter.KEY_Right]: [1, 0], [Clutter.KEY_Up]: [0, -1], [Clutter.KEY_Down]: [0, 1]};
                const delta = directions[symbol];
                if (!delta)
                    return Clutter.EVENT_PROPAGATE;
                const [, pressed, latched, locked] = controller.get_state();
                const resizing = resize || ((pressed | latched | locked) & Clutter.ModifierType.SHIFT_MASK) !== 0;
                const next = {...this.rect};
                next[resizing ? 'w' : 'x'] += delta[0];
                next[resizing ? 'h' : 'y'] += delta[1];
                this._onChange(this.type, next, true);
                return Clutter.EVENT_STOP;
            });
            actor.add_action(keys);
        }
        this.setEditing(false);
        applyChineseLanguage(this.actor);
    }

    _attachGesture(actor, resize) {
        const gesture = new Clutter.PanGesture({required_button: 1});
        gesture.connect('may-recognize', () => this._editing);
        gesture.connect('recognize', () => {
            this._start = {...this.rect};
            this.actor.add_style_class_name('perch-dragging');
        });
        gesture.connect('pan-update', () => {
            if (!this._start)
                return;
            const delta = gesture.get_accumulated_delta_abs();
            const next = {...this._start};
            next[resize ? 'w' : 'x'] += Math.round(delta.get_x() / this.pitch);
            next[resize ? 'h' : 'y'] += Math.round(delta.get_y() / this.pitch);
            this._onChange(this.type, next, false);
        });
        gesture.connect('end', () => {
            if (this._start)
                this._onChange(this.type, this.rect, true);
            this._start = null;
            this.actor.remove_style_class_name('perch-dragging');
        });
        gesture.connect('cancel', () => this.cancelDrag());
        actor.add_action(gesture);
        this._gestures.push(gesture);
    }

    cancelDrag() {
        if (this._start)
            this._onChange(this.type, this._start, false);
        this._start = null;
        this.actor.remove_style_class_name('perch-dragging');
    }

    setRect(rect, pitch, gap) {
        this.rect = {...rect};
        this.pitch = pitch;
        this.actor.set_position(rect.x * pitch, rect.y * pitch);
        this.actor.set_size(rect.w * pitch - gap, rect.h * pitch - gap);
    }

    setEditing(editing) {
        this.cancelDrag();
        this._editing = editing;
        this._header.visible = editing;
        this._grip.visible = editing;
        this._resize.visible = editing;
        this._header.can_focus = editing;
        // Keep the same drag area; only expose controls while arranging widgets.
        this._header.reactive = editing;
        for (const gesture of this._gestures)
            gesture.enabled = editing;
        if (editing)
            this.actor.add_style_class_name('perch-editing');
        else
            this.actor.remove_style_class_name('perch-editing');
    }

    destroy() {
        this._start = null;
        this._widget.destroy();
        this.actor.destroy();
    }
}
