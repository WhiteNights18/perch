// SPDX-License-Identifier: GPL-3.0-only
export const isPhotoId = id => /^photo-[a-f0-9-]{8,40}$/.test(id);
export const baseType = id => isPhotoId(id) ? 'photo' : id;
export function photoInstances(settings) {
    try {
        const value = JSON.parse(settings.get_string('photo-instances'));
        if (!Array.isArray(value)) return [];
        const ids = new Set();
        return value.filter(p => p && isPhotoId(p.id) && !ids.has(p.id) && ids.add(p.id) && typeof p.source === 'string').slice(0, 8)
            .map(p => ({id: p.id, source: p.source, fit: p.fit === 'contain' ? 'contain' : 'cover', interval: Math.round(Math.max(5, Math.min(3600, Number(p.interval) || 30))), paused: Boolean(p.paused)}));
    } catch (_) { return []; }
}
export function photoSettings(settings, id) {
    if (!isPhotoId(id)) return settings;
    const read = key => photoInstances(settings).find(p => p.id === id)?.[key.replace('photo-', '')];
    return {
        instanceId: id,
        get_string: key => String(read(key) ?? ''),
        get_int: key => Number(read(key)) || 30,
        get_boolean: key => Boolean(read(key)),
        set_boolean: (key, value) => settings.set_string('photo-instances', JSON.stringify(photoInstances(settings).map(p => p.id === id ? {...p, [key.replace('photo-', '')]: value} : p))),
    };
}
