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
    './settings-store': { getStringSetting: (_key, fallback) => fallback, setStringSetting() {} },
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
    './weather-icons': { renderWeatherIcon: () => null },
    '../../ui/metrics': { lineStep: () => 14, tightRowHeight: () => 18, centeredTextY: (font, y) => y },
  })('app/apps/weather/weather.ts');
  const state = { phase: 'ready', ...harness().api.normalizeOpenMeteo(fixture()) };
  const image = new WeatherLayer(() => state, () => {}).paint({ stack: { getBaseSize: () => ({ width: 640, height: 288 }), isFocused: () => true } });
  const text = image.text.join(' | ');
  assert.match(text, /Tiempo/); assert.match(text, /0°C/); assert.match(text, /Viento O 0 km\/h/);
  assert.match(text, /Humedad 0%/); assert.match(text, /Open-Meteo/); assert.match(text, /Lluvia/);
  assert.doesNotMatch(text, /°F| mph|Weather|Observed/);
});


// Ported from upstream 0.8.3 (condition icons, cache, hourly indicator refresh), adapted to
// Open-Meteo/Celsius: WMO codes stand in for NWS icon URLs and the cache is version 2.
const HOUR_MS = 60 * 60 * 1000;

/** weather.ts with fake timers, settings store and Open-Meteo responses. */
function weatherHarness({ response = fixture, store = new Map(), permission = () => true } = {}) {
  const timers = new Map(), requests = [];
  let nextTimer = 1;
  const api = loader({
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn: () => { timers.delete(id); fn(); }, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  }, {
    './location-permissions': { hasLocationPermission: permission },
    './location': { getCurrentLocation: async () => ({ latitude: 40.416775, longitude: -3.70379 }) },
    './settings-store': { getStringSetting: (key, fallback) => store.get(key) ?? fallback, setStringSetting: (key, value) => store.set(key, value) },
    '../util/http': { fetchWithUserAgent: async url => { requests.push(url); return { ok: true, json: async () => response() }; } },
  })('app/native/weather.ts');
  // Only the bridge's refresh timer outlives a refresh (fetch timeouts are cleared).
  const refreshTimer = () => {
    assert.ok(timers.size <= 1, `expected at most one timer, got ${timers.size}`);
    return [...timers.values()][0] ?? null;
  };
  return { api, store, requests, refreshTimer };
}

test('Weather maps WMO codes and is_day to icon conditions', () => {
  const { api } = weatherHarness();
  const value = fixture();
  value.current.is_day = 1;
  value.current.weather_code = 61;
  value.hourly.weather_code = [2, 95, 45, 73, 81, 56, 3, 0];
  value.hourly.time = value.hourly.weather_code.map((_code, i) => seconds + i * 3600);
  value.hourly.wind_speed_10m = [10, 10, 10, 10, 10, 10, 10, 50];
  value.hourly.is_day = [0, 1, 1, 1, 1, 1, 1, 1];
  const { current, forecast } = api.normalizeOpenMeteo(value);
  assert.equal(current.condition, 'rain');
  assert.equal(current.isDaytime, true);
  assert.deepEqual(Array.from(forecast, period => period.condition),
    ['partly-cloudy', 'thunderstorm', 'fog', 'snow', 'showers', 'sleet', 'cloudy', 'wind']);
  assert.equal(forecast[0].isDaytime, false);
  assert.equal(api.normalizeOpenMeteo({ hourly: { time: [seconds], weather_code: [999] } }).current.condition, null);
});

test('Weather without current conditions takes condition and day/night from the first forecast hour', () => {
  const { api } = weatherHarness();
  const value = fixture();
  delete value.current;
  const { current } = api.normalizeOpenMeteo(value);
  assert.equal(current.condition, 'clear');
  assert.equal(current.isDaytime, false);
  assert.equal(current.observed, false);
});

test('Weather restores its cache on restart and refreshes hourly only during a session with an indicator on', async () => {
  const first = weatherHarness();
  const bridge = new first.api.WeatherBridge();
  await bridge.refreshNow();
  const cached = JSON.parse(first.store.get('weather.cache'));
  assert.equal(cached.version, 2);
  assert.doesNotMatch(first.store.get('weather.cache'), /latitude|longitude|40\.4|-3\.70/, 'no coordinates are cached');

  // A restart shows the cached reading without fetching.
  const h = weatherHarness({ store: first.store });
  const restarted = new h.api.WeatherBridge();
  assert.equal(restarted.snapshot().phase, 'ready');
  assert.equal(restarted.snapshot().status, 'Tiempo actualizado.');
  assert.equal(restarted.snapshot().current.temperatureC, 0);
  assert.equal(h.requests.length, 0);

  restarted.setBackgroundRefresh(true);
  assert.equal(h.refreshTimer(), null, 'no refreshes outside a glasses session');
  restarted.setSessionActive(true);
  const timer = h.refreshTimer();
  assert.ok(timer.ms > HOUR_MS - 60_000 && timer.ms <= HOUR_MS, `fresh cache waits out the hour (${timer.ms})`);
  restarted.setBackgroundRefresh(false);
  assert.equal(h.refreshTimer(), null);
  restarted.setBackgroundRefresh(true);
  restarted.setSessionActive(false);
  assert.equal(h.refreshTimer(), null);
});

test('Weather ignores an upstream (Fahrenheit) cache, refreshes a stale one at once and backs off after a failure', async () => {
  const upstreamShape = new Map([['weather.cache', JSON.stringify({
    version: 1, locationName: 'San Francisco, CA', current: { temperatureF: 70 }, forecast: [], lastUpdatedMs: Date.now(),
  })]]);
  assert.equal(new (weatherHarness({ store: upstreamShape }).api.WeatherBridge)().snapshot().phase, 'permission-required');

  const store = new Map([['weather.cache', JSON.stringify({
    version: 2, locationName: 'Antigua', current: null, forecast: [], lastUpdatedMs: Date.now() - 2 * HOUR_MS,
  })]]);
  let permission = true;
  const h = weatherHarness({ store, permission: () => permission });
  const bridge = new h.api.WeatherBridge();
  bridge.setBackgroundRefresh(true);
  bridge.setSessionActive(true);
  assert.equal(h.refreshTimer().ms, 0);

  h.refreshTimer().fn();
  await bridge.refreshNow();
  assert.equal(bridge.snapshot().locationName, 'Zona local');
  assert.ok(h.refreshTimer().ms > HOUR_MS - 60_000);

  // Without permission the attempt fails; the next one waits the retry delay, not zero.
  permission = false;
  await bridge.refreshNow();
  assert.equal(bridge.snapshot().phase, 'permission-required');
  const retry = h.refreshTimer().ms;
  assert.ok(retry > 9 * 60_000 && retry <= 10 * 60_000, `retry delay ${retry}`);
});

/** weather-indicators.ts with a fake shell, settings and bridge. */
function indicatorHarness() {
  const settings = new Map(), settingListeners = new Set(), stateListeners = new Set(), trays = [];
  const background = [];
  let state = { phase: 'ready', current: null, forecast: [], lastUpdatedMs: null };
  let systemCardInUse = false;
  class GrayImage {
    constructor(width, height) { this.width = width; this.height = height; this.draws = []; }
    drawImage(_source, x, y) { this.draws.push(['image', x, y]); }
    drawText(_font, x, y, text) { this.draws.push(['text', x, y, text]); }
    withDrawsBaked() { return this; }
  }
  const font = { lineHeight: 12, measureText: text => text.length * 6 };
  class Setting {
    constructor(options) { Object.assign(this, options); }
    get() { return settings.get(this.storageKey) ?? this.defaultValue; }
  }
  const api = loader({}, {
    '../../graphics/image': { GrayImage },
    '../../graphics/ui-fonts': { getDefaultSmallFont: () => font },
    '../../graphics/icons': { renderSvgIcon: (_name, _svg, size) => new GrayImage(size, size) },
    '../../native/weather': { weatherBridge: {
      onStateChange: listener => { stateListeners.add(listener); listener(state); return () => stateListeners.delete(listener); },
      snapshot: () => state,
      setBackgroundRefresh: enabled => background.push(enabled),
    } },
    '../../ui/dashboard-settings': {
      ConfigSettingBoolean: Setting,
      onAnySettingChanged: listener => { settingListeners.add(listener); return () => settingListeners.delete(listener); },
    },
    '../../ui/shell/shell': { shell: { setTrayIcon: (id, icon) => trays.push([id, icon]) } },
    '../glanceboard/configuration': { isSystemCardWidgetInUse: () => systemCardInUse },
  })('app/apps/weather/weather-indicators.ts');
  return {
    api, trays, background,
    setSetting(key, value) { settings.set(key, value); for (const listener of settingListeners) listener(); },
    setSystemCardInUse(value) { systemCardInUse = value; for (const listener of settingListeners) listener(); },
    setState(next) { state = next; for (const listener of stateListeners) listener(state); },
  };
}

test('Weather tray icon follows the status-bar setting, shows Celsius and hides a stale reading', () => {
  const h = indicatorHarness();
  h.api.startWeatherIndicators();
  assert.deepEqual(h.background, [false], 'system-card weather is on by default, but no system card is showing');
  assert.equal(h.trays.length, 0, 'nothing shown, nothing to clear');

  h.setSystemCardInUse(true);
  assert.equal(h.background.at(-1), true, 'the system card alone keeps refreshes running');
  assert.equal(h.trays.length, 0);
  h.setSetting('weather.showOnSystemCard', false);
  assert.equal(h.background.at(-1), false, 'not with its weather turned off');
  h.setSetting('weather.showOnSystemCard', true);
  assert.equal(h.background.at(-1), true);

  h.setSetting('weather.showInStatusBar', true);
  const current = { temperatureC: 21.6, condition: 'rain', isDaytime: true };
  h.setState({ phase: 'ready', current, forecast: [], lastUpdatedMs: Date.now() });
  const [id, icon] = h.trays.at(-1);
  assert.equal(id, 'weather');
  assert.equal(icon.height, 24);
  assert.deepEqual(icon.draws.map(draw => draw[0]), ['image', 'text']);
  assert.equal(icon.draws[1][3], '22°');

  // An unchanged reading does not rebuild the icon.
  const count = h.trays.length;
  h.setState({ phase: 'loading', current, forecast: [], lastUpdatedMs: Date.now() });
  assert.equal(h.trays.length, count);

  h.setState({ phase: 'error', current, forecast: [], lastUpdatedMs: Date.now() - 4 * HOUR_MS });
  assert.deepEqual(h.trays.at(-1), ['weather', null]);

  h.setSetting('weather.showOnSystemCard', false);
  h.setSetting('weather.showInStatusBar', false);
  assert.equal(h.background.at(-1), false);
});
