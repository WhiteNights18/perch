// SPDX-License-Identifier: GPL-3.0-only
export const TYPES = ['clock', 'note', 'system'];
export const MIN_SIZE = {clock: [8, 6], note: [8, 8], system: [8, 7]};
export const MAX_NOTE_LENGTH = 16000;

export function defaultState() {
    return {
        version: 1,
        layoutReset: 0,
        layout: {
            clock: {x: 0, y: 0, w: 8, h: 8},
            note: {x: 8, y: 0, w: 8, h: 8},
            system: {x: 0, y: 8, w: 16, h: 7},
        },
        note: '',
    };
}

export function decodeState(text) {
    const state = JSON.parse(text);
    if (state?.version !== 1)
        throw new Error('数据版本不受支持，原文件已保留');
    if (typeof state.note !== 'string' || Array.from(state.note).length > MAX_NOTE_LENGTH)
        throw new Error('便签数据无效，原文件已保留');
    const layoutReset = state.layoutReset ?? 0;
    if (!Number.isInteger(layoutReset) || layoutReset < 0 || layoutReset > 0xffffffff)
        throw new Error('布局重置记录无效，原文件已保留');
    for (const type of TYPES) {
        const r = state.layout?.[type];
        if (!r || !['x', 'y', 'w', 'h'].every(k => Number.isInteger(r[k]) && r[k] >= 0 && r[k] <= 4096))
            throw new Error('布局数据无效，原文件已保留');
        const [w, h] = MIN_SIZE[type];
        if (r.w < w || r.h < h)
            throw new Error('组件尺寸无效，原文件已保留');
    }
    return {version: 1, layoutReset, layout: Object.fromEntries(TYPES.map(t => [t, {...state.layout[t]}])), note: state.note};
}

export function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function fitRect(rect, type, cols, rows) {
    const [minW, minH] = MIN_SIZE[type];
    if (cols < minW || rows < minH)
        return null;
    const w = Math.min(cols, Math.max(minW, Math.round(rect.w)));
    const h = Math.min(rows, Math.max(minH, Math.round(rect.h)));
    return {x: Math.max(0, Math.min(cols - w, Math.round(rect.x))), y: Math.max(0, Math.min(rows - h, Math.round(rect.y))), w, h};
}

// First try the saved position, then the nearest free cell. Never overwrite the
// preferred layout just because a temporary monitor configuration is smaller.
export function arrange(layout, types, cols, rows) {
    const placed = {};
    for (const type of types) {
        const target = fitRect(layout[type], type, cols, rows);
        if (!target)
            continue;
        const free = r => !Object.values(placed).some(other => overlaps(r, other));
        let best = null;
        let distance = Infinity;
        for (let y = 0; y <= rows - target.h; y++) {
            for (let x = 0; x <= cols - target.w; x++) {
                const r = {...target, x, y};
                const d = Math.abs(x - target.x) + Math.abs(y - target.y);
                if (d < distance && free(r)) {
                    best = r;
                    distance = d;
                }
            }
        }
        if (best)
            placed[type] = best;
    }
    return placed;
}

export function propose(placed, type, rect, cols, rows) {
    const fitted = fitRect(rect, type, cols, rows);
    if (!fitted || Object.entries(placed).some(([id, other]) => id !== type && overlaps(fitted, other)))
        return null;
    return fitted;
}
