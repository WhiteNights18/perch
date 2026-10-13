// SPDX-License-Identifier: GPL-3.0-only
export function parseLyrics(text) {
    const lines = [];
    let offset = 0;
    for (const raw of text.slice(0, 200000).split(/\r?\n/)) {
        const off = raw.match(/\[offset:([+-]?\d+)\]/i);
        if (off) offset = Number(off[1]) / 1000;
        const value = raw.replace(/\[[^\]]*\]/g, '').trim();
        for (const match of raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g))
            if (value) lines.push({time: Number(match[1]) * 60 + Number(match[2]), text: value});
    }
    return lines.map(l => ({...l, time: Math.max(0, l.time + offset)})).sort((a, b) => a.time - b.time);
}
export function lyricAt(lines, seconds) {
    let value = '';
    for (const line of lines) { if (line.time > seconds) break; value = line.text; }
    return value;
}
