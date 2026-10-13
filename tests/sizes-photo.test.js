import test from 'node:test';
import assert from 'node:assert/strict';
import {SIZE_PRESETS, resizeInPlace, sizeLabel} from '../lib/sizes.js';
import {TYPES, MIN_SIZE, defaultState, decodeState} from '../lib/layout.js';
import {photoOrder, photoTransform} from '../lib/photo-model.js';

test('every widget has compatible size presets', () => {
    for (const type of TYPES) {
        assert.ok(SIZE_PRESETS[type].length >= 2);
        for (const [w, h] of SIZE_PRESETS[type]) {
            assert.ok(w * 4 >= MIN_SIZE[type][0] && h * 4 >= MIN_SIZE[type][1]);
            assert.equal(sizeLabel(w * 4, h * 4), `${w} × ${h}`);
        }
    }
});
test('preset resize relocates only its target and rejects no-space requests', () => {
    const placed = {clock: {x: 0, y: 0, w: 8, h: 8}, note: {x: 8, y: 0, w: 8, h: 8}};
    const original = structuredClone(placed);
    const next = resizeInPlace(placed, 'clock', 12, 12, 28, 20);
    assert.deepEqual(next, {x: 0, y: 8, w: 12, h: 12});
    assert.deepEqual(placed, original);
    assert.equal(resizeInPlace(placed, 'clock', 12, 12, 16, 8), null);
    assert.equal(resizeInPlace(placed, 'clock', 16, 8, 30, 30), null);
});
test('old seven-widget data retains notes, timer and sizes when photo is added', () => {
    const state = defaultState();
    state.note = '我的照片与便签';
    delete state.layout.photo;
    delete state.sizeRequest;
    const next = decodeState(JSON.stringify(state));
    assert.equal(next.note, state.note);
    assert.deepEqual(next.focus, state.focus);
    assert.deepEqual(next.layout.clock, state.layout.clock);
    assert.deepEqual(next.layout.photo, defaultState().layout.photo);
    assert.equal(next.sizeRequest, 0);
});
test('natural file sorting and aspect ratios handle portrait/panorama', () => {
    assert.deepEqual(photoOrder(['10.JPG', '2.png', '.secret.png', 'note.txt', '1.webp']), ['1.webp', '2.png', '10.JPG']);
    assert.deepEqual(photoTransform(800, 400, 200, 400, 'contain'), {width: 200, height: 100, x: 0, y: 150});
    assert.deepEqual(photoTransform(800, 400, 200, 400, 'cover'), {width: 800, height: 400, x: -300, y: 0});
});
