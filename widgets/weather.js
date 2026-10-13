// SPDX-License-Identifier: GPL-3.0-only
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {WeatherClient} from '../lib/weather.js';
import {weatherDescription} from '../lib/widget-models.js';
import {column, label, button, sensitive} from './ui.js';

const cache = new Map();
export function createWeather(settings) {
    const actor = column('perch-content perch-weather');
    const [city, latitude, longitude] = settings.get_value('weather-location').deep_unpack();
    const heading = new St.BoxLayout({style_class: 'perch-weather-heading'});
    const location = label(city || '天气', 'perch-widget-heading');
    location.x_expand = true;
    const refresh = button('view-refresh-symbolic', '刷新天气', () => update(true), 'perch-weather-refresh');
    heading.add_child(location);
    heading.add_child(refresh);
    actor.add_child(heading);
    const main = new St.BoxLayout({x_expand: true, y_expand: true});
    const temperature = label('—°', 'perch-temperature');
    temperature.x_expand = true;
    const icon = new St.Icon({icon_name: 'weather-overcast-symbolic', icon_size: 52, y_align: Clutter.ActorAlign.CENTER});
    main.add_child(temperature);
    main.add_child(icon);
    actor.add_child(main);
    const condition = label(city ? '正在获取天气…' : '请在设置中选择城市', 'perch-weather-condition');
    const range = label('最高 —°  最低 —°', 'perch-weather-range');
    const source = label('Open-Meteo · 天气模型', 'perch-weather-source');
    actor.add_child(condition);
    actor.add_child(range);
    actor.add_child(source);
    const client = new WeatherClient();
    let closed = false;
    let busy = false;
    const key = `${latitude},${longitude}`;
    let last = cache.get(key);
    function show(data, stale = false) {
        temperature.text = `${Math.round(data.temperature)}°`;
        const [description, symbol] = weatherDescription(data.code, data.day);
        icon.icon_name = symbol;
        condition.text = stale ? `${description} · 更新失败` : description;
        range.text = `最高 ${Math.round(data.high)}°  最低 ${Math.round(data.low)}°`;
        const t = GLib.DateTime.new_from_unix_local(Math.floor(data.time / 1000));
        source.text = `Open-Meteo · ${t.format('%m/%d %H:%M')}${stale ? ' 旧数据' : ''}`;
    }
    async function update(force = false) {
        if (closed || busy || !city) return;
        if (!force && last && Date.now() - last.fetched < 15 * 60 * 1000) { show(last.data); return; }
        busy = true;
        sensitive(refresh, false);
        try {
            const data = await client.current(latitude, longitude);
            if (closed) return;
            last = {data, fetched: Date.now()};
            cache.set(key, last);
            if (cache.size > 8) cache.delete(cache.keys().next().value);
            show(data);
        } catch (_error) {
            if (closed) return;
            if (last) show(last.data, true);
            else { condition.text = '暂时无法更新'; range.text = '请检查网络后重试'; }
        } finally {
            busy = false;
            if (!closed) sensitive(refresh, true);
        }
    }
    if (last && city) show(last.data, Date.now() - last.fetched >= 15 * 60 * 1000);
    sensitive(refresh, Boolean(city));
    update();
    const timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 900, () => { update(); return GLib.SOURCE_CONTINUE; });
    return {actor, temperature, condition, refresh, destroy() { closed = true; client.destroy(); GLib.Source.remove(timer); }};
}
