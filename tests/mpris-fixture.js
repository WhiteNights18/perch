// Test-only synthetic player. Never bundled in releases or used in the real session.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const XML = `<node><interface name="org.mpris.MediaPlayer2.Player">
<method name="PlayPause"/><method name="Previous"/><method name="Next"/>
<property name="Position" type="x" access="read"/>
<property name="PlaybackStatus" type="s" access="read"/>
<property name="Metadata" type="a{sv}" access="read"/>
<property name="CanControl" type="b" access="read"/>
<property name="CanPlay" type="b" access="read"/>
<property name="CanPause" type="b" access="read"/>
<property name="CanGoNext" type="b" access="read"/>
<property name="CanGoPrevious" type="b" access="read"/>
</interface></node>`;
export function mockPlayer() {
    const song = `${GLib.getenv('PERCH_TEST_OUTPUT')}/photos/song.mp3`;
    GLib.file_set_contents(song.replace(/\.mp3$/, '.lrc'), '[00:00]本地歌词第一句\n[00:05]本地歌词第二句');
    const player = {
        Position: 6000000, PlaybackStatus: 'Paused', CanControl: true, CanPlay: true, CanPause: true, CanGoNext: true, CanGoPrevious: true,
        Metadata: {'xesam:title': new GLib.Variant('s', '测试曲目 · 非真实播放'), 'xesam:artist': new GLib.Variant('as', ['Perch 测试播放器']), 'mpris:artUrl': new GLib.Variant('s', Gio.File.new_for_path(`${GLib.getenv('PERCH_TEST_OUTPUT')}/photos/photo1.png`).get_uri()), 'xesam:asText': new GLib.Variant('s', '[00:00]测试歌词第一句\n[00:05]测试歌词第二句')},
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
    return {player, cover(index) { player.Metadata['mpris:artUrl'] = new GLib.Variant('s', Gio.File.new_for_path(`${GLib.getenv('PERCH_TEST_OUTPUT')}/photos/photo${index}.png`).get_uri()); object.emit_property_changed('Metadata', new GLib.Variant('a{sv}', player.Metadata)); }, noLyrics() { delete player.Metadata['xesam:asText']; delete player.Metadata['xesam:url']; object.emit_property_changed('Metadata', new GLib.Variant('a{sv}', player.Metadata)); }, localLyrics() { player.Metadata['xesam:asText'] = new GLib.Variant('s', ''); player.Metadata['xesam:url'] = new GLib.Variant('s', Gio.File.new_for_path(song).get_uri()); object.emit_property_changed('Metadata', new GLib.Variant('a{sv}', player.Metadata)); }, lock() { player.CanControl = false; object.emit_property_changed('CanControl', new GLib.Variant('b', false)); },
        destroy() { Gio.bus_unown_name(owner); object.unexport(); }};
}
