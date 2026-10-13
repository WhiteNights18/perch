// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {parseWeather} from './widget-models.js';

export class WeatherClient {
    constructor() {
        this.session = new Soup.Session({timeout: 15, user_agent: 'Perch/0.2 (GNOME desktop widget)'});
        this.cancel = new Gio.Cancellable();
    }
    async json(url) {
        const message = Soup.Message.new('GET', url);
        const bytes = await new Promise((resolve, reject) => {
            this.session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, this.cancel, (session, result) => {
                try { resolve(session.send_and_read_finish(result)); } catch (error) { reject(error); }
            });
        });
        if (message.status_code !== 200) throw new Error(`天气服务返回 ${message.status_code}`);
        return JSON.parse(new TextDecoder().decode(bytes.get_data()));
    }
    async search(query) {
        const result = await this.json(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=zh&format=json`);
        return (result.results ?? []).filter(r => typeof r.name === 'string' && Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
    }
    async current(latitude, longitude) {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
            throw new Error('城市坐标无效');
        return parseWeather(await this.json(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&timeformat=unixtime&forecast_days=1`));
    }
    destroy() { this.cancel.cancel(); this.session.abort(); }
}
