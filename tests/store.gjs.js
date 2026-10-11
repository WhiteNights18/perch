import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Store} from '../lib/store.js';
import {readText} from '../lib/io.js';

const directory = GLib.dir_make_tmp('perch-store-test-XXXXXX');
let error = '';
const store = new Store(message => { error = message; }, directory);
await store.load();
store.state.note = '第一版';
store.changed();
store.flush();
store.state.note = '最终版本 🌱';
store.changed();
store.close();
const next = new Store(message => { error = message; }, directory);
await next.load();
if (error || next.state.note !== '最终版本 🌱')
    throw new Error(`serialized write/reload failed: ${error}`);
next.close();
const file = Gio.File.new_for_path(`${directory}/state.json`);
const info = file.query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null);
if ((info.get_attribute_uint32('unix::mode') & 0o777) !== 0o600)
    throw new Error('private file mode required');
file.replace_contents('{"version":999}', null, false, Gio.FileCreateFlags.PRIVATE, null);
const invalid = new Store(message => { error = message; }, directory);
await invalid.load();
invalid.state.note = '不得覆盖';
invalid.changed();
invalid.close();
await invalid.flush();
if (!error || await readText(file.get_path()) !== '{"version":999}')
    throw new Error('unsupported version was overwritten');
file.delete(null);
Gio.File.new_for_path(directory).delete(null);
print('PASS: async save/reload, latest write wins, private permissions, future-version protection');
