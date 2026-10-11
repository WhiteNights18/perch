import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState, decodeState, arrange, propose, overlaps, TYPES, MIN_SIZE} from '../lib/layout.js';

test('round-trip preserves Chinese notes and layout', () => {
    const state = defaultState();
    state.note = '课程计划\n周五提交 🪴';
    assert.deepEqual(decodeState(JSON.stringify(state)), state);
});

test('Unicode character limit matches the editor and old v1 state gains reset marker', () => {
    const state = defaultState();
    state.note = '🌱'.repeat(16000);
    delete state.layoutReset;
    const decoded = decodeState(JSON.stringify(state));
    assert.equal(decoded.note, state.note);
    assert.equal(decoded.layoutReset, 0);
});

test('reject unknown versions, malformed sizes and oversized notes', () => {
    for (const change of [s => s.version = 2, s => s.layout.clock.w = -1,
        s => s.layout.note.x = 0.5, s => s.note = 'x'.repeat(16001), s => delete s.layout.system]) {
        const state = defaultState();
        change(state);
        assert.throws(() => decodeState(JSON.stringify(state)));
    }
});

test('collision rejects a move without changing the existing layout', () => {
    const placed = arrange(defaultState().layout, TYPES, 50, 25);
    const before = structuredClone(placed);
    assert.equal(propose(placed, 'clock', {...placed.clock, x: 10}, 50, 25), null);
    assert.deepEqual(placed, before);
});

test('bounds, minimum dimensions, non-overlap and deterministic recovery across monitor sizes', () => {
    const original = defaultState().layout;
    const before = structuredClone(original);
    for (let cols = 4; cols < 70; cols += 3) {
        for (let rows = 4; rows < 40; rows += 3) {
            const placed = arrange(original, TYPES, cols, rows);
            const entries = Object.entries(placed);
            for (const [type, r] of entries) {
                assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= cols && r.y + r.h <= rows);
                assert.ok(r.w >= MIN_SIZE[type][0] && r.h >= MIN_SIZE[type][1]);
                for (const [other, b] of entries)
                    if (other !== type) assert.equal(overlaps(r, b), false);
            }
            assert.deepEqual(arrange(original, TYPES, cols, rows), placed);
        }
    }
    assert.deepEqual(original, before);
    assert.deepEqual(arrange(original, TYPES, 60, 32), original);
});

test('hidden components do not reserve space and resizing stays in bounds', () => {
    const placed = arrange(defaultState().layout, ['clock'], 12, 10);
    assert.deepEqual(Object.keys(placed), ['clock']);
    assert.deepEqual(propose(placed, 'clock', {x: 100, y: 100, w: 100, h: 100}, 12, 10), {x: 0, y: 0, w: 12, h: 10});
});
