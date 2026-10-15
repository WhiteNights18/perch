// SPDX-License-Identifier: GPL-3.0-only
export function noteTitle(note) {
    return note.text.split('\n').find(s => s.trim())?.trim().slice(0, 24) || '新笔记';
}
export function reorder(items, from, to) {
    const result = [...items];
    if (from < 0 || to < 0 || from >= result.length || to >= result.length) return result;
    result.splice(to, 0, ...result.splice(from, 1));
    return result;
}
export function luminance(rgb) {
    const linear = rgb.map(c => c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
export function coverPalette(rgb) {
    // Always use a dark palette; white text remains >= 4.5:1 even while blending.
    const top = rgb.slice(0, 3).map(c => Math.round(Math.min(112, c * 0.38 + 14)));
    return [top, top.map(c => Math.round(c * 0.48))];
}
export function decodeWorkflows(state) {
    const textOK = text => typeof text === 'string' && Array.from(text).length <= 16000;
    const notes = state.notes ?? [];
    const ids = new Set();
    if (!Array.isArray(notes) || notes.length > 20 || notes.some(n => !n || typeof n.id !== 'string' || ids.has(n.id) || !ids.add(n.id) || !textOK(n.text) || !Number.isSafeInteger(n.modified) || n.modified < 0 || !Array.isArray(n.history) || n.history.length > 20 || n.history.some(t => !textOK(t))))
        throw new Error('笔记数据无效，原文件已保留');
    const deletedTasks = state.deletedTasks ?? [];
    if (!Array.isArray(deletedTasks) || deletedTasks.length > 20 || deletedTasks.some(d => !d || !Number.isInteger(d.index) || d.index < 0 || typeof d.task?.id !== 'string' || typeof d.task?.text !== 'string' || d.task.text.length > 500 || typeof d.task?.done !== 'boolean'))
        throw new Error('任务撤销记录无效，原文件已保留');
    const launcherSizes = state.launcherSizes ?? {};
    for (const [key, value] of Object.entries(launcherSizes)) {
        if (!['labels', 'icons'].includes(key) || !value || !Number.isInteger(value.w) || !Number.isInteger(value.h) || value.w < 8 || value.h < 6 || value.w > 4096 || value.h > 4096)
            throw new Error('启动器尺寸记录无效，原文件已保留');
    }
    return {notes, activeNoteId: typeof state.activeNoteId === 'string' ? state.activeNoteId : '', deletedTasks, tasksExpanded: state.tasksExpanded === true, launcherSizes};
}
