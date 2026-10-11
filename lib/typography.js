// SPDX-License-Identifier: GPL-3.0-only
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';

const SIMPLIFIED_FAMILIES = ['Noto Sans CJK SC', 'Source Han Sans SC', 'Source Han Sans CN', 'WenQuanYi Micro Hei'];

export function chineseFont() {
    const installed = new Set(PangoCairo.FontMap.get_default().list_families().map(f => f.get_name()));
    return SIMPLIFIED_FAMILIES.find(f => installed.has(f)) ?? 'sans-serif';
}

// Select an installed SC family explicitly instead of relying on generic CJK
// fallback ordering, which can select a different face from the same TTC file.
export function chineseFontStyle() {
    return `font-family: "${chineseFont()}";`;
}

export function applyChineseLanguage(actor) {
    const text = actor.clutter_text;
    if (text) {
        const apply = () => {
            const attributes = text.get_attributes()?.copy() ?? new Pango.AttrList();
            attributes.change(Pango.attr_language_new(Pango.Language.from_string('zh-cn')));
            text.set_attributes(attributes);
        };
        // St rebuilds text attributes when its theme is applied or changed.
        actor.connect('style-changed', apply);
        apply();
    }
    for (const child of actor.get_children())
        applyChineseLanguage(child);
}
