// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const PREFIX = 'org.mpris.MediaPlayer2.';
const PATH = '/org/mpris/MediaPlayer2';
const IFACE = 'org.mpris.MediaPlayer2.Player';

export class MediaPlayers {
    constructor(publish) {
        this.publish = publish;
        this.players = new Map();
        this.pending = new Map();
        this.closed = false;
        this.selected = null;
        this.cancel = new Gio.Cancellable();
        this.bus = Gio.DBus.session;
        this.subscription = this.bus.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged', '/org/freedesktop/DBus', null,
            Gio.DBusSignalFlags.NONE, (_connection, _sender, _path, _iface, _signal, parameters) => {
                const [name, oldOwner, newOwner] = parameters.deep_unpack();
                if (!name.startsWith(PREFIX)) return;
                if (oldOwner) this.remove(name);
                if (newOwner) this.add(name);
            });
        this.bus.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames', null,
            new GLib.VariantType('(as)'), Gio.DBusCallFlags.NONE, 3000, this.cancel, (bus, result) => {
                try {
                    const [names] = bus.call_finish(result).deep_unpack();
                    if (!this.closed) names.filter(n => n.startsWith(PREFIX)).forEach(n => this.add(n));
                } catch (_error) { if (!this.closed) this.emit(); }
            });
    }
    add(name) {
        if (this.closed || this.players.has(name) || this.pending.has(name)) return;
        const token = {};
        this.pending.set(name, token);
        Gio.DBusProxy.new(this.bus, Gio.DBusProxyFlags.DO_NOT_AUTO_START, null, name, PATH, IFACE, this.cancel, (_source, result) => {
            try {
                const proxy = Gio.DBusProxy.new_finish(result);
                if (this.closed || this.pending.get(name) !== token) return;
                this.pending.delete(name);
                if (!proxy.g_name_owner) return;
                const signal = proxy.connect('g-properties-changed', () => this.emit());
                this.players.set(name, {proxy, signal});
                this.emit();
            } catch (_error) { if (this.pending.get(name) === token) this.pending.delete(name); }
        });
    }
    remove(name) {
        this.pending.delete(name);
        const item = this.players.get(name);
        if (item) item.proxy.disconnect(item.signal);
        this.players.delete(name);
        if (this.selected === name) this.selected = null;
        this.emit();
    }
    get state() {
        const names = [...this.players.keys()].sort();
        const name = names.includes(this.selected) ? this.selected : names.find(n => this.get(n, 'PlaybackStatus') === 'Playing') ?? names[0];
        if (!name) return null;
        const metadata = this.get(name, 'Metadata') ?? {};
        const unpack = v => v?.deep_unpack?.() ?? v;
        const artists = unpack(metadata['xesam:artist']);
        const playing = this.get(name, 'PlaybackStatus') === 'Playing';
        const control = this.get(name, 'CanControl') === true;
        return {name, count: names.length, title: String(unpack(metadata['xesam:title']) ?? '未知曲目'),
            artist: Array.isArray(artists) ? artists.join(' / ') : '', playing,
            artUrl: String(unpack(metadata['mpris:artUrl']) ?? ''), url: String(unpack(metadata['xesam:url']) ?? ''),
            lyrics: String(unpack(metadata['xesam:asText']) ?? '').slice(0, 200000),
            previous: control && this.get(name, 'CanGoPrevious') === true,
            next: control && this.get(name, 'CanGoNext') === true,
            toggle: control && this.get(name, playing ? 'CanPause' : 'CanPlay') === true};
    }
    get(name, property) { return this.players.get(name)?.proxy.get_cached_property(property)?.deep_unpack(); }
    emit(error = '') { if (!this.closed) this.publish(this.state, error); }
    cycle() {
        const names = [...this.players.keys()].sort();
        if (!names.length) return;
        this.selected = names[(names.indexOf(this.state.name) + 1) % names.length];
        this.emit();
    }
    command(method) {
        const state = this.state;
        const capability = {Previous: 'previous', Next: 'next', PlayPause: 'toggle'}[method];
        if (!state || !capability || !state[capability]) return;
        this.players.get(state.name).proxy.call(method, null, Gio.DBusCallFlags.NONE, 3000, this.cancel, (proxy, result) => {
            try { proxy.call_finish(result); } catch (_error) { this.emit('播放器未响应，请重试'); }
        });
    }
    position(callback) {
        const state = this.state;
        if (!state) return;
        this.bus.call(state.name, PATH, 'org.freedesktop.DBus.Properties', 'Get',
            new GLib.Variant('(ss)', [IFACE, 'Position']), new GLib.VariantType('(v)'), Gio.DBusCallFlags.NONE, 1500, this.cancel,
            (bus, result) => {
                try { const [value] = bus.call_finish(result).deep_unpack(); if (!this.closed && this.state?.name === state.name) callback(Number(value.deep_unpack()) / 1000000); } catch (_) { /* No timeline on this player. */ }
            });
    }
    destroy() {
        this.closed = true;
        this.cancel.cancel();
        this.bus.signal_unsubscribe(this.subscription);
        for (const {proxy, signal} of this.players.values()) proxy.disconnect(signal);
        this.players.clear();
        this.pending.clear();
        this.publish = null;
    }
}
