// Runs ONLY in the isolated test copy; never included in release packages.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Perch from './perch.js';
import {mockPlayer} from './mpris-fixture.js';
import {SIZE_PRESETS} from './lib/sizes.js';
import {loadPhoto} from './lib/photos.js';

const delay = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));
const assert = (value, message) => { if (!value) throw new Error(message); };
const output = GLib.getenv('PERCH_TEST_OUTPUT');

function checkFonts(texts) {
    const fonts = [];
    for (const text of texts) {
        const iter = text.get_layout().get_iter();
        do {
            const run = iter.get_run();
            if (run) {
                const family = run.item.analysis.font.describe().get_family();
                fonts.push(family);
                assert(family === 'Noto Sans CJK SC', `wrong regional font: ${family}`);
            }
        } while (iter.next_run());
    }
    return fonts;
}

async function screenshot(name) {
    const stream = Gio.File.new_for_path(`${output}/${name}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
    const shooter = new Shell.Screenshot();
    await new Promise((resolve, reject) => shooter.screenshot(false, stream, (self, result) => {
        try { self.screenshot_finish(result); resolve(); } catch (error) { reject(error); }
    }));
    stream.close(null);
}

// Check the captured title pixels as well as actor geometry; thumbnail previews
// alone are not reliable evidence that text was actually painted.
async function assertCardPaint(desktop, name) {
    const pixbuf = await loadPhoto(`${output}/${name}.png`, new Gio.Cancellable());
    const pixels = pixbuf.read_pixel_bytes().get_data();
    const scale = pixbuf.width / global.stage.width;
    for (const type of ['note', 'weather', 'music']) {
        const widget = desktop.cards.get(type)._widget;
        const content = type === 'note' ? widget.actor.get_children()[0].get_children()[1] : type === 'music' ? widget.title : widget.temperature;
        const [ax, ay] = content.get_transformed_position();
        const cx = ax * scale, cy = ay * scale;
        let ink = 0;
        for (let y = Math.ceil(cy); y < Math.floor(cy + content.height * scale); y++) {
            for (let x = Math.ceil(cx); x < Math.floor(cx + content.width * scale); x++) {
                const i = y * pixbuf.rowstride + x * pixbuf.n_channels;
                const [r, g, b] = pixels.subarray(i, i + 3);
                if (type === 'note' ? r < 150 && g < 130 && b < 80 : r > 220 && g > 200 && b > 200) ink++;
            }
        }
        assert(ink > 20, `${name}: ${type} has geometry but missing painted title (${ink})`);
    }
}

export default class TestPerch extends Perch {
    enable() {
        if (!this._started) {
            const settings = this.getSettings();
            for (const type of ['calendar', 'focus', 'music', 'weather']) settings.set_boolean(`show-${type}`, false);
        }
        super.enable();
        if (!this._started) {
            this._started = true;
            this._run().then(() => this._result('PASS')).catch(error => this._result(`FAIL: ${error.message}\n${error.stack}`));
        }
    }

    _result(text) {
        console.log(`[Perch test] ${text}`);
        GLib.file_set_contents(`${output}/result.txt`, text);
    }

    async _paintStress() {
        await delay(5500);
        Main.overview.hide();
        Main.welcomeDialog?.close();
        for (const type of Object.keys(SIZE_PRESETS)) this._settings.set_boolean(`show-${type}`, true);
        this._settings.set_string('photo-source', `${output}/photos`);
        for (let i = 0; i < 6; i++) {
            this._settings.set_string('theme', i % 2 ? 'dark' : 'light');
            this._settings.set_boolean('photo-paused', Boolean(i % 2));
            await delay(800);
            await screenshot(`paint-${i}`);
            await assertCardPaint(this._desktop, `paint-${i}`);
        }
    }

    async _run() {
        if (GLib.getenv('PERCH_PAINT_ONLY')) return this._paintStress();
        await delay(5500);
        Main.overview.hide();
        Main.welcomeDialog?.close();
        await delay(1000);
        assert(this._desktop, 'desktop did not load');
        assert(this._desktop.cards.size === 3, `expected 3 cards, got ${this._desktop.cards.size}`);
        assert(this._desktop.actor.visible, 'desktop hidden outside overview');
        assert(this._desktop.actor.get_parent() === global.window_group, 'wrong desktop layer');
        this._settings.set_string('theme', 'dark');
        await delay(350);
        const entry = this._desktop.cards.get('note')._widget.entry;
        entry.set_text('今天，留一点时间给自己。\n\n□ 整理课程笔记\n□ 完成一个小目标\n□ 出门散步');
        await delay(3500);
        const fonts = checkFonts([entry.clutter_text, this._desktop.cards.get('clock')._widget.date.clutter_text]);
        await screenshot('desktop-dark');
        this._indicator.menu.open();
        await delay(300);
        assert(this._indicator.menu.isOpen, 'panel menu did not open');
        fonts.push(...checkFonts([this._status.label.clutter_text]));
        GLib.file_set_contents(`${output}/fonts.txt`, fonts.join('\n'));
        await screenshot('panel-menu');
        this._indicator.menu.close();
        this._desktop.setEditing(true);
        await delay(300);
        assert(this._desktop.actor.get_parent() === Main.layoutManager.uiGroup, 'edit mode not raised');
        await screenshot('edit-mode');
        // Make one free grid cell for the drag and resize interaction checks.
        const noteRect = this._desktop.cards.get('note').rect;
        assert(this._desktop.change('note', {...noteRect, x: noteRect.x + 1}, true), 'test space unavailable');
        const card = this._desktop.cards.get('clock');
        const initial = {...card.rect};
        const seat = global.stage.context.get_backend().get_default_seat();
        const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const [x, y] = card._header.get_transformed_position();
        // A new headless pointer can be constrained by the hot-corner barrier.
        // Confirm its actual position before sending the button press.
        for (let i = 0; i < 5; i++) {
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + 60, y + 10);
            await delay(150);
            const [px, py] = global.get_pointer();
            if (Math.abs(px - x - 60) < 1 && Math.abs(py - y - 10) < 1)
                break;
        }
        console.log(`[Perch test] drag header reactive=${card._header.reactive}, pointer=${global.get_pointer()}`);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        await delay(100);
        for (let step = 1; step <= 4; step++) {
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + 60 + step * 8, y + 10);
            await delay(80);
        }
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await delay(200);
        assert(card.rect.x === initial.x + 1, `pointer drag failed: ${JSON.stringify(card.rect)}`);
        const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        card._header.grab_key_focus();
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Left, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Left, Clutter.KeyState.RELEASED);
        await delay(200);
        assert(card.rect.x === initial.x, 'keyboard move failed');
        const [rx, ry] = card._resize.get_transformed_position();
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), rx + 8, ry + 8);
        await delay(100);
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
        await delay(100);
        for (let step = 1; step <= 4; step++) {
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), rx + 8 + step * 8, ry + 8);
            await delay(80);
        }
        pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
        await delay(200);
        assert(card.rect.w === initial.w + 1, `pointer resize failed: ${JSON.stringify(card.rect)}`);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.RELEASED);
        await delay(200);
        assert(!this._desktop.editing, 'Escape did not finish editing');
        this._desktop.setEditing(false);
        entry.grab_key_focus();
        entry.clutter_text.set_cursor_position(-1);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_x, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_x, Clutter.KeyState.RELEASED);
        await delay(200);
        assert(this._store.state.note.endsWith('x'), 'keyboard typing in note failed');
        entry.set_text(entry.get_text().slice(0, -1));
        assert(this._store.state.note.includes('课程笔记'), 'note change was not captured');
        this._settings.set_boolean('show-note', false);
        await delay(250);
        assert(this._desktop.cards.size === 2, 'hide widget failed');
        this._settings.set_boolean('show-note', true);
        this._settings.set_string('theme', 'light');
        await delay(3500);
        await screenshot('desktop-light');
        for (let i = 0; i < 3; i++) {
            super.disable();
            assert(this._desktop === null && this._indicator === null, 'disable left live objects');
            assert(!global.window_group.get_children().some(a => a.get_style_class_name?.()?.includes('perch-desktop')), 'desktop actor leaked');
            super.enable();
            await delay(500);
            assert(this._desktop.cards.size === 3, 'reenable failed');
            assert(this._store.state.note.includes('课程笔记'), 'note did not survive reload');
            assert(this._store.state.layout.clock.w === initial.w + 1, 'resized layout did not survive reload');
        }
        // Reset requested while disabled must be applied on the next enable.
        const settings = this._settings;
        super.disable();
        settings.set_uint('reset-layout', settings.get_uint('reset-layout') + 1);
        super.enable();
        await delay(500);
        assert(this._store.state.layout.clock.w === initial.w, 'pending reset was not applied');
        assert(this._store.state.note.includes('课程笔记'), 'reset erased note');
        await this._store.flush();
        await delay(3500);
        await screenshot('after-reenable');
        for (const type of ['calendar', 'focus', 'music', 'weather']) this._settings.set_boolean(`show-${type}`, true);
        await delay(1000);
        assert(this._desktop.cards.size === 7, 'new widgets not all visible');
        const click = async button => {
            button.grab_key_focus();
            keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_space, Clutter.KeyState.PRESSED);
            keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_space, Clutter.KeyState.RELEASED);
            await delay(200);
        };
        const calendar = this._desktop.cards.get('calendar')._widget;
        const monthTitle = calendar.title.text;
        await click(calendar.next);
        assert(calendar.title.text !== monthTitle, 'calendar next month failed');
        await click(calendar.today);
        assert(calendar.title.text === monthTitle, 'calendar today failed');
        const focus = this._desktop.cards.get('focus')._widget;
        await click(focus.toggle);
        assert(this._store.state.focus.deadline > Date.now(), 'focus did not start');
        await delay(1200);
        await click(focus.toggle);
        assert(this._store.state.focus.deadline === 0 && this._store.state.focus.remaining < 1500, 'focus pause failed');
        await click(focus.toggle);
        const deadline = this._store.state.focus.deadline;
        this._settings.set_string('theme', 'dark');
        await delay(1000);
        assert(this._store.state.focus.deadline === deadline, 'theme rebuild reset timer');
        const fixture = mockPlayer();
        try {
            await delay(800);
            const music = this._desktop.cards.get('music')._widget;
            assert(music.title.text.includes('测试曲目'), 'MPRIS metadata did not arrive');
            await click(music.toggle);
            assert(fixture.player.PlaybackStatus === 'Playing', 'MPRIS playback control failed');
            await click(music.next);
            await click(music.previous);
            assert(fixture.player.next === 1 && fixture.player.previous === 1, 'MPRIS track controls failed');
            fixture.lock();
            await delay(250);
            assert(!music.toggle.reactive && !music.next.reactive, 'MPRIS capability flags ignored');
            await screenshot('music-fixture');
        } finally { fixture.destroy(); }
        await delay(400);
        assert(this._desktop.cards.get('music')._widget.service.state === null, 'closed player retained');
        // Completion survives a rebuild and transitions only when explicitly started.
        this._store.state.focus.deadline = Date.now() - 1000;
        await delay(1500);
        assert(this._store.state.focus.remaining === 0, 'focus completion failed');
        await click(this._desktop.cards.get('focus')._widget.toggle);
        assert(this._store.state.focus.phase === 'break', 'focus break transition failed');
        await click(this._desktop.cards.get('focus')._widget.reset);
        this._store.state.focus = {phase: 'work', duration: 1500, remaining: 1500, deadline: 0};
        this._store.changed();
        await delay(1500);
        await delay(4000);
        await screenshot('all-widgets-dark');
        this._settings.set_string('theme', 'light');
        await delay(3500);
        await screenshot('all-widgets-light');
        fonts.push(...checkFonts([
            this._desktop.cards.get('calendar')._widget.title.clutter_text,
            this._desktop.cards.get('music')._widget.title.clutter_text,
            this._desktop.cards.get('focus')._widget.actor.get_first_child().clutter_text,
        ]));
        GLib.file_set_contents(`${output}/fonts.txt`, fonts.join('\n'));
        await click(this._desktop.cards.get('focus')._widget.toggle);
        const savedDeadline = this._store.state.focus.deadline;
        await this._store.flush();
        super.disable();
        super.enable();
        await delay(800);
        assert(this._desktop.cards.size === 7, 'new widgets reenable failed');
        assert(this._store.state.focus.deadline === savedDeadline && savedDeadline > Date.now(), 'running focus timer lost on reload');
        await click(this._desktop.cards.get('focus')._widget.reset);
        assert(this._store.state.note.includes('课程笔记'), 'upgrade lost note');
        console.log(`[Perch test] weather live state: ${this._desktop.cards.get('weather')._widget.temperature.text}`);
        // Photo tests use generated landscapes and a corrupt fixture, never user files.
        const photos = `${output}/photos`;
        const waitFor = async (predicate, message) => {
            for (let i = 0; i < 60; i++) { if (predicate()) return; await delay(100); }
            throw new Error(message);
        };
        const photo = () => this._desktop.cards.get('photo')._widget;
        this._settings.set_string('photo-source', photos);
        this._settings.set_boolean('photo-paused', true);
        this._settings.set_boolean('show-photo', true);
        await delay(300);
        await waitFor(() => photo().loaded, 'folder photo did not decode');
        assert(this._desktop.cards.size === 8, 'photo card missing');
        const firstPhoto = photo().current;
        await click(photo().next);
        await waitFor(() => photo().current !== firstPhoto, 'manual next photo failed');
        this._settings.set_int('photo-interval', 5);
        this._settings.set_boolean('photo-paused', false);
        await delay(400);
        await waitFor(() => photo().loaded, 'photo reload failed');
        const beforeAuto = photo().current;
        await delay(6200);
        assert(photo().current !== beforeAuto, 'automatic slideshow failed');
        await click(photo().pause);
        await waitFor(() => photo().loaded, 'pause rebuild failed');
        const pausedPhoto = photo().current;
        await delay(6200);
        assert(photo().current === pausedPhoto, 'paused slideshow advanced');
        this._settings.set_string('photo-source', `${photos}/photo1.png`);
        await delay(300);
        await waitFor(() => photo().loaded, 'single photo failed');
        this._settings.set_string('photo-source', `${photos}/broken`);
        await delay(300);
        await waitFor(() => photo().message.text.includes('无法读取'), 'corrupt photo not reported');
        assert(!photo().loaded, 'corrupt photo retained previous image');
        this._settings.set_string('photo-source', `${photos}/empty`);
        await delay(300);
        await waitFor(() => photo().message.text.includes('没有可用'), 'empty folder not reported');
        const watchedFile = Gio.File.new_for_path(`${photos}/empty/added.png`);
        Gio.File.new_for_path(`${photos}/photo1.png`).copy(watchedFile, Gio.FileCopyFlags.NONE, null, null);
        await waitFor(() => photo().loaded, 'directory monitor missed added photo');
        watchedFile.delete(null);
        await waitFor(() => !photo().loaded, 'directory monitor retained deleted photo');
        this._settings.set_string('photo-source', photos);
        await delay(300);
        await waitFor(() => photo().loaded, 'folder restore failed');
        const requestSize = (type, w, h) => {
            const serial = this._settings.get_value('size-request').deep_unpack()[3];
            this._settings.set_value('size-request', new GLib.Variant('(suuu)', [type, w * 4, h * 4, (serial + 1) >>> 0]));
        };
        // Exercise every supported preset with only its target enabled.
        for (const [type, presets] of Object.entries(SIZE_PRESETS)) {
            for (const id of Object.keys(SIZE_PRESETS)) this._settings.set_boolean(`show-${id}`, id === type);
            for (const [w, h] of presets) {
                requestSize(type, w, h);
                await delay(250);
                const rect = this._desktop.cards.get(type)?.rect;
                assert(rect?.w === w * 4 && rect?.h === h * 4, `preset failed: ${type} ${w}x${h}`);
                if (type === 'photo') {
                    await waitFor(() => photo().loaded, 'resized photo failed');
                    await delay(150);
                    await screenshot(`photo-${w}x${h}`);
                }
            }
        }
        this._settings.set_string('photo-fit', 'contain');
        await delay(300);
        await waitFor(() => photo().loaded, 'contain photo failed');
        await screenshot('photo-contain');
        this._settings.set_string('photo-fit', 'cover');
        this._settings.set_uint('reset-layout', this._settings.get_uint('reset-layout') + 1);
        for (const id of Object.keys(SIZE_PRESETS)) this._settings.set_boolean(`show-${id}`, true);
        await delay(3500);
        await waitFor(() => photo().loaded, 'gallery photo failed');
        await screenshot('photo-gallery-light');
        await assertCardPaint(this._desktop, 'photo-gallery-light');
        this._settings.set_string('theme', 'dark');
        await delay(3500);
        await waitFor(() => photo().loaded, 'dark photo failed');
        await screenshot('photo-gallery-dark');
        await assertCardPaint(this._desktop, 'photo-gallery-dark');
        requestSize('photo', 2, 4);
        await delay(500);
        const savedPhoto = {...this._store.state.layout.photo};
        await this._store.flush();
        super.disable();
        super.enable();
        await delay(600);
        await waitFor(() => photo().loaded, 'photo did not survive reenable');
        assert(JSON.stringify(this._store.state.layout.photo) === JSON.stringify(savedPhoto), 'photo preset did not persist');
        assert(this._store.state.note.includes('课程笔记'), 'size change erased note');
        this.openPreferences();
        await delay(2000);
        assert(global.get_window_actors().some(actor => /Perch|栖格/.test(actor.meta_window.get_title() ?? '')), 'preferences window did not open');
        const assertBelowWindows = () => {
            const siblings = global.window_group.get_children();
            const desktopIndex = siblings.indexOf(this._desktop.actor);
            for (const actor of global.get_window_actors()) {
                if (actor.get_parent() === global.window_group && actor.visible)
                    assert(siblings.indexOf(actor) > desktopIndex, 'desktop covers an application window');
            }
        };
        assertBelowWindows();
        await screenshot('preferences');
        // The test-only preferences wrapper opens the native image picker.
        await delay(3000);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_l, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_l, Clutter.KeyState.RELEASED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
        await delay(300);
        for (const char of `${photos}/photo2.png`) {
            keyboard.notify_keyval(GLib.get_monotonic_time(), char.codePointAt(0), Clutter.KeyState.PRESSED);
            keyboard.notify_keyval(GLib.get_monotonic_time(), char.codePointAt(0), Clutter.KeyState.RELEASED);
        }
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Return, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Return, Clutter.KeyState.RELEASED);
        await delay(1000);
        if (this._settings.get_string('photo-source') !== `${photos}/photo2.png`) {
            keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Return, Clutter.KeyState.PRESSED);
            keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Return, Clutter.KeyState.RELEASED);
        }
        await waitFor(() => this._settings.get_string('photo-source') === `${photos}/photo2.png`, 'native file chooser did not apply selection');
        await waitFor(() => photo().loaded && photo().current === `${photos}/photo2.png`, 'chosen file did not render');
        await delay(1200);
        assertBelowWindows();
        await screenshot('photo-preferences');
    }
}
