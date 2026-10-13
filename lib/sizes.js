// SPDX-License-Identifier: GPL-3.0-only
// One displayed size unit is four 32px layout cells (128px at 100% scale).
export const SIZE_PRESETS = {
    clock: [[2, 2], [3, 3]],
    note: [[2, 2], [3, 3], [2, 4], [4, 2]],
    system: [[2, 2], [3, 3], [4, 2]],
    calendar: [[2, 2], [3, 3], [2, 4]],
    focus: [[2, 2], [3, 3]],
    music: [[3, 3], [4, 2]],
    weather: [[2, 2], [3, 3], [2, 4]],
    photo: [[2, 2], [3, 3], [2, 4], [4, 2]],
};
export const WIDGET_NAMES = {clock: '时钟与日期', note: '随手记', system: '系统状态', calendar: '月历', focus: '番茄钟', music: '音乐', weather: '天气', photo: '照片'};
export function sizeLabel(w, h) { return `${w / 4} × ${h / 4}`; }
export function supportedSize(type, w, h) {
    return SIZE_PRESETS[type]?.some(([x, y]) => x * 4 === w && y * 4 === h) ?? false;
}
// Find a nearby free position without shifting any other card or silently shrinking.
export function resizeInPlace(placed, type, w, h, cols, rows) {
    if (w > cols || h > rows || !supportedSize(type, w, h)) return null;
    const current = placed[type] ?? {x: 0, y: 0};
    let best = null;
    let distance = Infinity;
    for (let y = 0; y <= rows - h; y++) {
        for (let x = 0; x <= cols - w; x++) {
            const d = Math.abs(x - current.x) + Math.abs(y - current.y);
            if (d >= distance) continue;
            const collides = Object.entries(placed).some(([id, r]) => id !== type && x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
            if (!collides) { best = {x, y, w, h}; distance = d; }
        }
    }
    return best;
}
