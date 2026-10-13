// Optional network smoke test, never a dependency of offline checks.
import {WeatherClient} from '../lib/weather.js';
const client = new WeatherClient();
try {
    const matches = await client.search('Suzhou');
    const suzhou = matches.find(r => r.name === '苏州' && r.admin1 === '江苏');
    if (!suzhou) throw new Error('Jiangsu Suzhou was not found');
    const weather = await client.current(suzhou.latitude, suzhou.longitude);
    print(JSON.stringify({city: suzhou.name, latitude: suzhou.latitude, longitude: suzhou.longitude, ...weather}));
} finally { client.destroy(); }
