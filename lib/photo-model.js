// SPDX-License-Identifier: GPL-3.0-only
export const PHOTO_PATTERN = /\.(png|jpe?g|webp|bmp|gif)$/i;
export function photoTransform(sw, sh, dw, dh, fit) {
    const ratio = fit === 'contain' ? Math.min(dw / sw, dh / sh) : Math.max(dw / sw, dh / sh);
    const width = Math.max(1, Math.round(sw * ratio));
    const height = Math.max(1, Math.round(sh * ratio));
    return {width, height, x: Math.floor((dw - width) / 2), y: Math.floor((dh - height) / 2)};
}
export function photoOrder(names) {
    return names.filter(n => !n.startsWith('.') && PHOTO_PATTERN.test(n)).sort((a, b) => a.localeCompare(b, 'zh-CN', {numeric: true}));
}
