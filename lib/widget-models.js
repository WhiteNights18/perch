// SPDX-License-Identifier: GPL-3.0-only
// Pure calendar/timer/weather models shared by the UI and regression tests.
export function monthGrid(year, month) {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    return Array.from({length: 42}, (_, i) => i >= offset && i < offset + days ? i - offset + 1 : 0);
}
export function newFocus(phase = 'work', minutes = phase === 'work' ? 25 : 5) {
    return {phase, duration: minutes * 60, remaining: minutes * 60, deadline: 0};
}
export function focusRemaining(state, now = Date.now()) {
    return state.deadline ? Math.max(0, Math.min(state.duration, Math.ceil((state.deadline - now) / 1000))) : state.remaining;
}
export function toggleFocus(state, now = Date.now()) {
    const remaining = focusRemaining(state, now);
    return {...state, started: remaining > 0 || state.started === true, remaining, deadline: state.deadline || remaining === 0 ? 0 : now + remaining * 1000};
}
export function weatherDescription(code, day = true) {
    if (code === 0) return [day ? '晴' : '晴朗', day ? 'weather-clear-symbolic' : 'weather-clear-night-symbolic'];
    if ([1, 2].includes(code)) return ['少云', day ? 'weather-few-clouds-symbolic' : 'weather-few-clouds-night-symbolic'];
    if (code === 3) return ['多云', 'weather-overcast-symbolic'];
    if ([45, 48].includes(code)) return ['雾', 'weather-fog-symbolic'];
    if ([51, 53, 55, 56, 57].includes(code)) return ['毛毛雨', 'weather-showers-scattered-symbolic'];
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['雨', 'weather-showers-symbolic'];
    if ([71, 73, 75, 77, 85, 86].includes(code)) return ['雪', 'weather-snow-symbolic'];
    if ([95, 96, 99].includes(code)) return ['雷雨', 'weather-storm-symbolic'];
    return ['天气未知', 'weather-overcast-symbolic'];
}
export function parseWeather(data) {
    const c = data?.current;
    const d = data?.daily;
    if (![c?.temperature_2m, c?.weather_code, d?.temperature_2m_max?.[0], d?.temperature_2m_min?.[0]].every(Number.isFinite) ||
        !Number.isFinite(c?.time) || ![0, 1].includes(c?.is_day))
        throw new Error('天气数据不完整');
    return {temperature: c.temperature_2m, code: c.weather_code, day: c.is_day === 1,
        high: d.temperature_2m_max[0], low: d.temperature_2m_min[0], time: c.time * 1000};
}
