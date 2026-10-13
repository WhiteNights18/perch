import test from 'node:test';
import assert from 'node:assert/strict';
import {monthGrid, newFocus, toggleFocus, focusRemaining, parseWeather, weatherDescription} from '../lib/widget-models.js';
import {defaultState, decodeState} from '../lib/layout.js';

test('old alpha layouts and Chinese notes migrate without moving existing widgets', () => {
    const old = {version: 1, note: '保留我的笔记', layout: {
        clock: {x: 1, y: 2, w: 9, h: 6}, note: {x: 10, y: 0, w: 10, h: 10}, system: {x: 0, y: 7, w: 9, h: 8},
    }};
    const next = decodeState(JSON.stringify(old));
    for (const type of Object.keys(old.layout)) assert.deepEqual(next.layout[type], old.layout[type]);
    assert.equal(next.note, old.note);
    assert.deepEqual(next.focus, newFocus());
    assert.deepEqual(next.layout.weather, defaultState().layout.weather);
    const invalid = defaultState();
    invalid.focus.deadline = -5;
    assert.throws(() => decodeState(JSON.stringify(invalid)));
});
test('Monday-first calendar handles leap February and year boundaries', () => {
    const leap = monthGrid(2024, 1);
    assert.equal(leap[3], 1);
    assert.equal(leap.filter(Boolean).length, 29);
    assert.equal(monthGrid(2025, 1).filter(Boolean).length, 28);
    assert.deepEqual(monthGrid(2025, 12), monthGrid(2026, 0));
    assert.equal(monthGrid(2026, 1)[6], 1);
});
test('focus pause/resume, suspend, completion and persisted restart', () => {
    const started = toggleFocus(newFocus(), 10000);
    assert.equal(focusRemaining(started, 25000), 1485);
    const paused = toggleFocus(started, 25000);
    assert.equal(focusRemaining(paused, 100000), 1485);
    const resumed = toggleFocus(paused, 100000);
    assert.equal(focusRemaining(JSON.parse(JSON.stringify(resumed)), 101000), 1484);
    assert.equal(focusRemaining(resumed, 5000000), 0);
    assert.equal(toggleFocus({...resumed, deadline: 0, remaining: 0}).deadline, 0);
});
test('weather rejects partial data instead of displaying fake zero degrees', () => {
    const data = {current: {temperature_2m: 0, weather_code: 0, is_day: 1, time: 1700000000}, daily: {temperature_2m_max: [4], temperature_2m_min: [-3]}};
    assert.equal(parseWeather(data).temperature, 0);
    data.current.temperature_2m = null;
    assert.throws(() => parseWeather(data));
    assert.equal(weatherDescription(95)[0], '雷雨');
    assert.equal(weatherDescription(999)[0], '天气未知');
});
