const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');
const seconds = Date.parse('2026-10-02T22:00:00Z') / 1000;
const fixture = () => ({ utc_offset_seconds: 7200,
  current: { time: seconds, temperature_2m: 0, relative_humidity_2m: 0, weather_code: 0, wind_speed_10m: 0, wind_direction_10m: 270 },
  hourly: { time: [seconds, seconds + 3600], temperature_2m: [0, -2], precipitation_probability: [0, 100],
    weather_code: [0, 95], wind_speed_10m: [0, 10], wind_direction_10m: [270, 225], is_day: [0, 1] } });
function harness({ permission = true, fetch = async () => ({ ok: true, json: async () => fixture() }), globals = {} } = {}) {
  const requests = [];
  const api = loader({ setTimeout, clearTimeout, setInterval, clearInterval, ...globals }, {
    './location-permissions': { hasLocationPermission: () => permission },
    './location': { getCurrentLocation: async () => ({ latitude: 40.416775, longitude: -3.70379 }) },
    '../util/http': { fetchWithUserAgent: (...args) => { requests.push(args[0]); return fetch(...args); } },
  })('app/native/weather.ts');
  return { api, requests, bridge: new api.WeatherBridge() };
}
test('request supports Spain, rounds location, explicitly selects metric units and epoch timestamps', () => {
  const { api } = harness();
  const url = new URL(api.buildWeatherUrl({ latitude: 40.416775, longitude: -3.70379 }));
  assert.equal(url.origin, 'https://api.open-meteo.com');
  for (const [key, value] of Object.entries({ latitude: '40.42', longitude: '-3.70', temperature_unit: 'celsius', wind_speed_unit: 'kmh', timeformat: 'unixtime', timezone: 'auto', forecast_hours: '14' })) {
    assert.equal(url.searchParams.get(key), value);
  }
  for (const latitude of [NaN, Infinity, 91]) assert.throws(() => api.buildWeatherUrl({ latitude, longitude: 0 }), /ubicación/);
});
test('Celsius and calm/zero values survive parsing, with Spanish descriptions and compass', () => {
  const result = harness().api.normalizeOpenMeteo(fixture());
  assert.equal(result.current.temperatureC, 0);
  assert.equal(result.current.humidityPercent, 0);
  assert.equal(result.current.windSpeedKmh, 0);
  assert.equal(result.current.description, 'Despejado');
  assert.equal(result.current.windDirection, 'O');
  assert.equal(result.current.observed, false);
  assert.equal(result.forecast[0].precipitationPercent, 0);
  assert.equal(result.forecast[1].temperatureC, -2);
  assert.equal(result.forecast[1].shortForecast, 'Tormenta');
  assert.equal(result.forecast[1].windDirection, 'SO');
});
test('local hours roll over midnight without shifting the actual UTC timestamp', () => {
  const { api } = harness(), value = fixture();
  let result = api.normalizeOpenMeteo(value);
  assert.equal(result.forecast[0].name, '00:00');
  assert.equal(result.forecast[1].name, '01:00');
  assert.equal(result.current.timestampMs, seconds * 1000);
  assert.equal(result.forecast[0].startTimeMs, seconds * 1000);
  value.utc_offset_seconds = -18000;
  assert.equal(api.normalizeOpenMeteo(value).forecast[0].name, '17:00');
});
test('missing fields stay unknown, invalid times are skipped, and absent current falls back to forecast', () => {
  const { api } = harness();
  const result = api.normalizeOpenMeteo({ hourly: { time: [null, 'bad', seconds], temperature_2m: [0, 0, 12] } });
  assert.equal(result.forecast.length, 1);
  assert.equal(result.current.temperatureC, 12);
  assert.equal(result.current.humidityPercent, null);
  assert.equal(result.current.windSpeedKmh, null);
  assert.equal(result.current.description, 'Sin descripción');
  assert.equal(result.forecast[0].precipitationPercent, null);
  for (const value of [{}, { hourly: { time: [null] } }, null]) assert.throws(() => api.normalizeOpenMeteo(value), /pronóstico válido/);
});
test('permission denial makes no network request; concurrent refreshes share one request and snapshots are isolated', async () => {
  const denied = harness({ permission: false }); await denied.bridge.refreshNow();
  assert.equal(denied.requests.length, 0);
  const h = harness(); await Promise.all([h.bridge.refreshNow(), h.bridge.refreshNow()]);
  assert.equal(h.requests.length, 1); assert.equal(h.bridge.snapshot().phase, 'ready');
  const snapshot = h.bridge.snapshot(); snapshot.current.temperatureC = 99; snapshot.forecast[0].name = 'bad';
  assert.equal(h.bridge.snapshot().current.temperatureC, 0); assert.equal(h.bridge.snapshot().forecast[0].name, '00:00');
});
test('HTTP, network and malformed responses leave a retryable error instead of ready state', async () => {
  for (const [fetch, message] of [
    [async () => ({ ok: false, status: 429 }), /HTTP 429/],
    [async () => { throw new Error('Failed to fetch'); }, /conexión del móvil/],
    [async () => ({ ok: true, json: async () => ({}) }), /pronóstico válido/],
  ]) {
    const h = harness({ fetch }); await h.bridge.refreshNow();
    assert.equal(h.bridge.snapshot().phase, 'error'); assert.match(h.bridge.snapshot().status, message);
  }
});
test('timeout also covers a stalled response body and clears its timer', async () => {
  let timeout, cleared = false;
  const h = harness({ fetch: async () => ({ ok: true, json: () => new Promise(() => {}) }),
    globals: { setTimeout: fn => { timeout = fn; return 1; }, clearTimeout: () => { cleared = true; } } });
  const refresh = h.bridge.refreshNow(); await new Promise(resolve => setImmediate(resolve)); timeout(); await refresh;
  assert.equal(h.bridge.snapshot().phase, 'error'); assert.match(h.bridge.snapshot().status, /tardado demasiado/); assert.equal(cleared, true);
});
test('glasses render Celsius, km/h, Spanish labels and visible provider attribution', () => {
  const font = { lineHeight: 12, measureText: text => text.length * 6 };
  class Image {
    constructor() { this.text = []; }
    drawText(font, x, y, text) { this.text.push(text); }
    drawLine() {}
  }
  class Menu {
    constructor(options) { this.options = options; }
    setItems(items) { this.items = items; }
    paint(image, box) { this.items.slice(0, 2).forEach((item, i) => this.options.draw({ image, item, ...box, y: box.y + i * 23, height: 23, selected: false })); }
  }
  const { WeatherLayer } = loader({}, {
    '../../graphics/ui-fonts': { getDefaultSmallFont: () => font, getDefaultMediumFont: () => font, getDefaultLargeFont: () => font },
    '../../graphics/image': { GrayImage: Image },
    '../../graphics/textwrap': { truncateText: (font, text) => text, wrapText: (font, text) => [text] },
    '../../ui/gestures': { GESTURE_CLICK: 'tap' }, '../../ui/menu-core': { Menu },
    '../../ui/metrics': { lineStep: () => 14, tightRowHeight: () => 18, centeredTextY: (font, y) => y },
  })('app/apps/weather/weather.ts');
  const state = { phase: 'ready', ...harness().api.normalizeOpenMeteo(fixture()) };
  const image = new WeatherLayer(() => state, () => {}).paint({ stack: { getBaseSize: () => ({ width: 640, height: 288 }), isFocused: () => true } });
  const text = image.text.join(' | ');
  assert.match(text, /Tiempo/); assert.match(text, /0°C/); assert.match(text, /Viento O 0 km\/h/);
  assert.match(text, /Humedad 0%/); assert.match(text, /Open-Meteo/); assert.match(text, /Lluvia/);
  assert.doesNotMatch(text, /°F| mph|Weather|Observed/);
});
