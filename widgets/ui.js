// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Pango from 'gi://Pango';
export function column(style = '') {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: style, x_expand: true, y_expand: true, clip_to_allocation: true});
}
export function label(text, style = '') {
    const actor = new St.Label({text, style_class: style, x_align: Clutter.ActorAlign.START});
    actor.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return actor;
}
export function button(icon, name, callback, style = '') {
    const actor = new St.Button({style_class: `perch-action ${style}`, can_focus: true, accessible_name: name,
        child: new St.Icon({icon_name: icon, icon_size: 18})});
    actor.connect('clicked', callback);
    return actor;
}
export function sensitive(actor, enabled) {
    actor.reactive = enabled;
    actor.can_focus = enabled;
    actor.opacity = enabled ? 255 : 85;
}
