import { hasLocationPermission } from "./location-permissions";
import { getCurrentLocation, type CurrentLocation } from "./location";
import { getStringSetting, setStringSetting } from "./settings-store";
import { fetchWithUserAgent } from "../util/http";

export type WeatherPhase = "permission-required" | "locating" | "loading" | "ready" | "error";

/** Sky and precipitation state, as coarse as the icons that show it. */
export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "wind"
  | "drizzle"
  | "showers"
  | "rain"
  | "thunderstorm"
  | "snow"
  | "sleet";

export type CurrentWeather = {
  temperatureC: number | null;
  description: string;
  humidityPercent: number | null;
  windSpeedKmh: number | null;
  windDirection: string;
  timestampMs: number | null;
  observed: boolean;
  condition: WeatherCondition | null;
  isDaytime: boolean;
};

export type ForecastPeriod = {
  name: string;
  startTimeMs: number;
  temperatureC: number | null;
  shortForecast: string;
  detailedForecast: string;
  precipitationPercent: number | null;
  windSpeed: string;
  windDirection: string;
  isDaytime: boolean;
  condition: WeatherCondition | null;
};

export type WeatherState = {
  phase: WeatherPhase;
  status: string;
  locationName: string;
  current: CurrentWeather | null;
  forecast: ForecastPeriod[];
  lastUpdatedMs: number | null;
};

type OpenMeteoResponse = {
  utc_offset_seconds?: unknown;
  current?: Record<string, unknown>;
  hourly?: Record<string, unknown[]>;
};
const WEATHER_API_ROOT = "https://api.open-meteo.com/v1/forecast";
/** Refresh period while the Weather app is open. */
const APP_REFRESH_MS = 30 * 60 * 1000;
/** Refresh period for the status-bar and system-card indicators. */
const BACKGROUND_REFRESH_MS = 60 * 60 * 1000;
/** Delay before retrying after a failed refresh (capped at the period). */
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_FORECAST_PERIODS = 14;
/** Settings-store key holding the last successful refresh (forecast only, no coordinates). */
const CACHE_KEY = "weather.cache";
// Upstream's cache is version 1 with Fahrenheit/NWS fields; ours stores Celsius/Open-Meteo,
// so a distinct version keeps either shape from being read as the other.
const CACHE_VERSION = 2;

const DEFAULT_STATE: WeatherState = {
  phase: "permission-required",
  status: "Permite la ubicación para consultar el tiempo local.",
  locationName: "",
  current: null,
  forecast: [],
  lastUpdatedMs: null,
};

type WeatherCache = {
  version: number;
  locationName: string;
  current: CurrentWeather | null;
  forecast: ForecastPeriod[];
  lastUpdatedMs: number;
};

/**
 * Shared weather state, refreshed on a schedule while anything shows it:
 * every 30 minutes while the Weather app is open, and hourly while a weather
 * indicator (status bar or Glanceboard system card) is enabled and the
 * glasses session is up. The last successful refresh is persisted, so a
 * restart shows it at once and the schedule counts from its age.
 */
export class WeatherBridge {
  private readonly listeners = new Set<(state: WeatherState) => void>();
  private loadedState: WeatherState | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight: Promise<void> | null = null;
  /** Start of the latest refresh attempt, successful or not. */
  private lastAttemptMs: number | null = null;
  private appOpen = false;
  private sessionActive = false;
  private backgroundWanted = false;

  onStateChange(listener: (state: WeatherState) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): WeatherState {
    return cloneState(this.state);
  }

  /** The Weather app opened (or asked to retry): refresh now, then every 30 minutes. */
  start(): void {
    this.appOpen = true;
    void this.refreshNow();
  }

  /** The Weather app closed; any indicator schedule continues. */
  stop(): void {
    this.appOpen = false;
    this.schedule();
  }

  /** Whether a glasses session is up; indicator refreshes only run during one. */
  setSessionActive(active: boolean): void {
    if (active === this.sessionActive) return;
    this.sessionActive = active;
    this.schedule();
  }

  /** Whether an indicator wants hourly refreshes (see app/apps/weather/weather-indicators.ts). */
  setBackgroundRefresh(enabled: boolean): void {
    if (enabled === this.backgroundWanted) return;
    this.backgroundWanted = enabled;
    this.schedule();
  }

  async refreshNow(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.clearRefreshTimer();
    this.lastAttemptMs = Date.now();
    if (!hasLocationPermission()) {
      this.state = cloneState(DEFAULT_STATE);
      this.emit();
      this.schedule();
      return;
    }

    this.refreshInFlight = this.refresh();
    try {
      await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
      this.schedule();
    }
  }

  private get state(): WeatherState {
    if (!this.loadedState) this.loadedState = loadCachedState();
    return this.loadedState;
  }

  private set state(state: WeatherState) {
    this.loadedState = state;
  }

  private refreshIntervalMs(): number | null {
    if (this.appOpen) return APP_REFRESH_MS;
    if (this.sessionActive && this.backgroundWanted) return BACKGROUND_REFRESH_MS;
    return null;
  }

  /**
   * Arm the timer for the next refresh: one period after the last success,
   * but no sooner than the retry delay after a failed attempt.
   */
  private schedule(): void {
    this.clearRefreshTimer();
    // A running refresh reschedules when it settles.
    if (this.refreshInFlight) return;
    const intervalMs = this.refreshIntervalMs();
    if (intervalMs === null) return;
    const lastSuccessMs = this.state.lastUpdatedMs ?? -Infinity;
    const lastAttemptMs = this.lastAttemptMs ?? -Infinity;
    const dueMs = Math.max(lastSuccessMs + intervalMs, lastAttemptMs + Math.min(intervalMs, RETRY_AFTER_FAILURE_MS));
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshNow();
    }, Math.max(0, dueMs - Date.now()));
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async refresh(): Promise<void> {
    try {
      this.state = { ...this.state, phase: "locating", status: "Buscando tu ubicación..." };
      this.emit();
      const location = await getCurrentLocation();

      this.state = { ...this.state, phase: "loading", status: "Consultando el tiempo..." };
      this.emit();
      const weather = normalizeOpenMeteo(await fetchWeatherJson(buildWeatherUrl(location)));
      this.state = {
        phase: "ready",
        status: "Tiempo actualizado.",
        locationName: weather.locationName,
        current: weather.current,
        forecast: weather.forecast,
        lastUpdatedMs: Date.now(),
      };
      saveCachedState(this.state);
      this.emit();
    } catch (error) {
      const message = friendlyWeatherError(error);
      console.warn(`weather refresh failed: ${message}`);
      this.state = {
        ...this.state,
        phase: "error",
        status: message,
      };
      this.emit();
    }
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

/** The persisted last refresh, or the default state when there is none (or no permission to refresh it). */
function loadCachedState(): WeatherState {
  try {
    if (!hasLocationPermission()) return cloneState(DEFAULT_STATE);
    const raw = getStringSetting(CACHE_KEY, "");
    if (!raw) return cloneState(DEFAULT_STATE);
    const cache = JSON.parse(raw) as Partial<WeatherCache> | null;
    if (
      !cache ||
      cache.version !== CACHE_VERSION ||
      typeof cache.lastUpdatedMs !== "number" ||
      !Array.isArray(cache.forecast)
    ) {
      return cloneState(DEFAULT_STATE);
    }
    return cloneState({
      phase: "ready",
      status: "Tiempo actualizado.",
      locationName: typeof cache.locationName === "string" ? cache.locationName : "",
      current: cache.current && typeof cache.current === "object" ? cache.current : null,
      forecast: cache.forecast,
      lastUpdatedMs: cache.lastUpdatedMs,
    });
  } catch (error) {
    console.warn(`weather cache unreadable: ${error}`);
    return cloneState(DEFAULT_STATE);
  }
}

function saveCachedState(state: WeatherState): void {
  if (state.lastUpdatedMs === null) return;
  const cache: WeatherCache = {
    version: CACHE_VERSION,
    locationName: state.locationName,
    current: state.current,
    forecast: state.forecast,
    lastUpdatedMs: state.lastUpdatedMs,
  };
  try {
    setStringSetting(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn(`weather cache write failed: ${error}`);
  }
}

/** Round before transmission: weather needs the local area, not an exact GPS fix. */
export function buildWeatherUrl(location: Pick<CurrentLocation, "latitude" | "longitude">): string {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)
    || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) {
    throw new Error("No se ha obtenido una ubicación válida.");
  }
  return WEATHER_API_ROOT + "?latitude=" + location.latitude.toFixed(2)
    + "&longitude=" + location.longitude.toFixed(2)
    + "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day"
    + "&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,is_day"
    + "&temperature_unit=celsius&wind_speed_unit=kmh&timeformat=unixtime&timezone=auto&forecast_hours=14";
}

async function fetchWeatherJson(url: string): Promise<OpenMeteoResponse> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("La consulta del tiempo ha tardado demasiado. Reintenta.")), FETCH_TIMEOUT_MS);
  });
  try {
    // Cover both response headers and JSON body with the timeout.
    return await Promise.race([(async () => {
      const response = await fetchWithUserAgent(url);
      if (!response.ok) throw new Error("No se pudo consultar Open-Meteo (HTTP " + response.status + "). Reintenta.");
      return await response.json() as OpenMeteoResponse;
    })(), timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

/** Unix timestamps remain UTC; the provider's offset is only for displayed local hours. */
export function normalizeOpenMeteo(response: OpenMeteoResponse): {
  locationName: string; current: CurrentWeather; forecast: ForecastPeriod[];
} {
  const hourly = response?.hourly;
  const offset = finiteNumber(response?.utc_offset_seconds) ?? 0;
  const forecast: ForecastPeriod[] = [];
  for (let i = 0; i < (hourly?.time?.length ?? 0) && forecast.length < MAX_FORECAST_PERIODS; i++) {
    const seconds = finiteNumber(hourly?.time?.[i]);
    if (seconds === null) continue;
    const date = new Date((seconds + offset) * 1000);
    if (!Number.isFinite(date.getTime())) continue;
    const code = hourly?.weather_code?.[i];
    const description = weatherDescription(code);
    const isDaytime = hourly?.is_day?.[i] === 1;
    const wind = finiteNumber(hourly?.wind_speed_10m?.[i]);
    forecast.push({
      name: String(date.getUTCHours()).padStart(2, "0") + ":" + String(date.getUTCMinutes()).padStart(2, "0"),
      startTimeMs: seconds * 1000,
      temperatureC: finiteNumber(hourly?.temperature_2m?.[i]),
      shortForecast: description, detailedForecast: description,
      precipitationPercent: finiteNumber(hourly?.precipitation_probability?.[i]),
      windSpeed: wind === null ? "" : String(Math.round(wind)) + " km/h",
      windDirection: compass(hourly?.wind_direction_10m?.[i]),
      isDaytime,
      condition: weatherCondition(code, wind),
    });
  }
  if (!forecast.length) throw new Error("Open-Meteo no ha devuelto un pronóstico válido. Reintenta.");
  const value = response.current;
  const seconds = finiteNumber(value?.time);
  return {
    locationName: "Zona local",
    current: {
      temperatureC: finiteNumber(value?.temperature_2m) ?? forecast[0]!.temperatureC,
      description: value ? weatherDescription(value.weather_code) : forecast[0]!.shortForecast,
      humidityPercent: finiteNumber(value?.relative_humidity_2m),
      windSpeedKmh: finiteNumber(value?.wind_speed_10m),
      windDirection: compass(value?.wind_direction_10m),
      timestampMs: seconds === null ? forecast[0]!.startTimeMs : seconds * 1000,
      // Current conditions are model estimates, not station observations.
      observed: false,
      condition: value ? weatherCondition(value.weather_code, finiteNumber(value.wind_speed_10m)) : forecast[0]!.condition,
      isDaytime: value?.is_day === 0 || value?.is_day === 1 ? value.is_day === 1 : forecast[0]!.isDaytime,
    },
    forecast,
  };
}

const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: "Despejado", 1: "Casi despejado", 2: "Parcialmente nublado", 3: "Cubierto",
  45: "Niebla", 48: "Niebla helada",
  51: "Llovizna ligera", 53: "Llovizna", 55: "Llovizna intensa",
  56: "Llovizna helada ligera", 57: "Llovizna helada intensa",
  61: "Lluvia ligera", 63: "Lluvia", 65: "Lluvia intensa",
  66: "Lluvia helada ligera", 67: "Lluvia helada intensa",
  71: "Nieve ligera", 73: "Nieve", 75: "Nieve intensa", 77: "Nieve granulada",
  80: "Chubascos ligeros", 81: "Chubascos", 82: "Chubascos intensos",
  85: "Chubascos de nieve", 86: "Chubascos de nieve intensos",
  95: "Tormenta", 96: "Tormenta con granizo", 97: "Tormenta intensa", 99: "Tormenta con granizo intenso",
};
/** Strong wind under an otherwise dry, mostly clear sky shows the wind icon. */
const WINDY_KMH = 40;

/** Icon condition for a WMO weather code (Open-Meteo "WMO Weather interpretation codes"). */
function weatherCondition(value: unknown, windKmh: number | null): WeatherCondition | null {
  const code = finiteNumber(value);
  if (code === null) return null;
  if (code <= 2 && windKmh !== null && windKmh >= WINDY_KMH) return "wind";
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code === 56 || code === 57 || code === 66 || code === 67) return "sleet";
  if (code >= 51 && code <= 55) return "drizzle";
  if (code >= 61 && code <= 65) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "showers";
  if (code === 85 || code === 86) return "snow";
  if (code >= 95 && code <= 99) return "thunderstorm";
  return null;
}
function weatherDescription(value: unknown): string {
  const code = finiteNumber(value);
  return code === null ? "Sin descripción" : WEATHER_DESCRIPTIONS[code] ?? "Sin descripción";
}
function compass(value: unknown): string {
  const degrees = finiteNumber(value);
  if (degrees === null) return "";
  const directions = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return directions[Math.round((((degrees % 360) + 360) % 360) / 45) % directions.length]!;
}
function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function friendlyWeatherError(error: unknown): string {
  const message = (error as Error)?.message || String(error);
  if (/network request failed|failed to fetch|unable to resolve host/i.test(message)) {
    return "No se pudo conectar con Open-Meteo. Comprueba la conexión del móvil y reintenta.";
  }
  if (/location disabled|location services|location.*timeout/i.test(message)) {
    return "No se pudo obtener la ubicación. Actívala en el móvil y reintenta.";
  }
  return message;
}

function cloneState(state: WeatherState): WeatherState {
  return {
    ...state,
    current: state.current ? { ...state.current } : null,
    forecast: state.forecast.map((period) => ({ ...period })),
  };
}

export const weatherBridge = new WeatherBridge();
