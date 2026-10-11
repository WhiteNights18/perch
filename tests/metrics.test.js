import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCpu, cpuPercent, parseMemory} from '../lib/metrics.js';

test('CPU delta excludes already-accounted guest counters and includes iowait in idle', () => {
    const a = parseCpu('cpu  10 0 10 70 10 0 0 0 10 0\ncpu0 1');
    const b = parseCpu('cpu  30 0 30 110 30 0 0 0 20 0');
    assert.equal(a.total, 100);
    assert.equal(cpuPercent(a, b), 40);
    assert.equal(cpuPercent(a, a), null);
    assert.equal(cpuPercent(b, a), null);
});

test('memory uses available including reclaimable memory', () => {
    const m = parseMemory('MemTotal: 8388608 kB\nMemFree: 100 kB\nMemAvailable: 2097152 kB\n');
    assert.deepEqual(m, {percent: 75, usedGiB: 6, totalGiB: 8});
});

test('invalid proc data is an error, never synthetic zero usage', () => {
    assert.throws(() => parseCpu('unavailable'));
    assert.throws(() => parseCpu('cpu 1 2 x 4'));
    assert.throws(() => parseMemory('MemTotal: 100 kB'));
    assert.throws(() => parseMemory('MemTotal: 1 kB\nMemAvailable: 2 kB'));
});
