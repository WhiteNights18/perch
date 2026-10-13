// Test-only synthetic player. Never bundled in releases or used in the real session.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const XML = `<node><interface name="org.mpris.MediaPlayer2.Player">
<method name="PlayPause"/><method name="Previous"/><method name="Next"/>
<property name="PlaybackStatus" type="s" access="read"/>
<property name="Metadata" type="a{sv}" access="read"/>
<property name="CanControl" type="b" access="read"/>
<property name="CanPlay" type="b" access="read"/>
<property name="CanPause" type="b" access="read"/>
<property name="CanGoNext" type="b" access="read"/>
<property name="CanGoPrevious" type="b" access="read"/>
</interface></node>`;
export function mockPlayer() {
    const player = {
        PlaybackStatus: 'Paused', CanControl: true, CanPlay: true, CanPause: true, CanGoNext: true, CanGoPrevious: true,
        Metadata: {'xesam:title': new GLib.Variant('s', '测试曲目 · 非真实播放'), 'xesam:artist': new GLib.Variant('as', ['Perch 测试播放器'])},
        next: 0, previous: 0,
        PlayPause() {
            this.PlaybackStatus = this.PlaybackStatus === 'Playing' ? 'Paused' : 'Playing';
            object.emit_property_changed('PlaybackStatus', new GLib.Variant('s', this.PlaybackStatus));
        },
        Next() { this.next++; }, Previous() { this.previous++; },
    };
    const object = Gio.DBusExportedObject.wrapJSObject(XML, player);
    object.export(Gio.DBus.session, '/org/mpris/MediaPlayer2');
    const owner = Gio.bus_own_name_on_connection(Gio.DBus.session, 'org.mpris.MediaPlayer2.PerchTest', Gio.BusNameOwnerFlags.NONE, null, null);
    return {player, lock() { player.CanControl = false; object.emit_property_changed('CanControl', new GLib.Variant('b', false)); },
        destroy() { Gio.bus_unown_name(owner); object.unexport(); }};
}
