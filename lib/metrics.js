// SPDX-License-Identifier: GPL-3.0-only
export function parseCpu(text) {
    const line = text.split('\n').find(l => l.startsWith('cpu '));
    const fields = line?.trim().split(/\s+/).slice(1, 9).map(Number);
    if (!fields || fields.length < 4 || fields.some(n => !Number.isFinite(n) || n < 0))
        throw new Error('CPU 数据不可用');
    return {total: fields.reduce((a, b) => a + b, 0), idle: fields[3] + (fields[4] ?? 0)};
}

export function cpuPercent(before, after) {
    const delta = after.total - before.total;
    if (delta <= 0 || after.idle < before.idle)
        return null;
    return Math.max(0, Math.min(100, 100 * (1 - (after.idle - before.idle) / delta)));
}

export function parseMemory(text) {
    const fields = Object.fromEntries([...text.matchAll(/^(\w+):\s+(\d+)\s+kB/gm)].map(m => [m[1], Number(m[2])]));
    if (!fields.MemTotal || fields.MemAvailable === undefined || fields.MemAvailable > fields.MemTotal)
        throw new Error('内存数据不可用');
    const used = fields.MemTotal - fields.MemAvailable;
    return {percent: 100 * used / fields.MemTotal, usedGiB: used / 1048576, totalGiB: fields.MemTotal / 1048576};
}
