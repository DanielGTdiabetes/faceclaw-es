import { hasLocationPermission } from "./location-permissions";
import { getCurrentLocation, type CurrentLocation } from "./location";
import { fetchWithUserAgent } from "../util/http";

export type WeatherPhase = "permission-required" | "locating" | "loading" | "ready" | "error";

export type CurrentWeather = {
  temperatureC: number | null;
  description: string;
  humidityPercent: number | null;
  windSpeedKmh: number | null;
  windDirection: string;
  timestampMs: number | null;
  observed: boolean;
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
const WEATHER_REFRESH_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_FORECAST_PERIODS = 14;

const DEFAULT_STATE: WeatherState = {
  phase: "permission-required",
  status: "Permite la ubicación para consultar el tiempo local.",
  locationName: "",
  current: null,
  forecast: [],
  lastUpdatedMs: null,
};

/** Shared weather state and periodic refresh, active only while its app is open. */
export class WeatherBridge {
  private readonly listeners = new Set<(state: WeatherState) => void>();
  private state: WeatherState = cloneState(DEFAULT_STATE);
  private refreshHandle: ReturnType<typeof setInterval> | null = null;
  private refreshInFlight: Promise<void> | null = null;

  onStateChange(listener: (state: WeatherState) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): WeatherState {
    return cloneState(this.state);
  }

  start(): void {
    if (!this.refreshHandle) {
      this.refreshHandle = setInterval(() => void this.refreshNow(), WEATHER_REFRESH_MS);
    }
    void this.refreshNow();
  }

  stop(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
      this.refreshHandle = null;
    }
  }

  async refreshNow(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    if (!hasLocationPermission()) {
      this.state = cloneState(DEFAULT_STATE);
      this.emit();
      return;
    }

    this.refreshInFlight = this.refresh();
    try {
      await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
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

/** Round before transmission: weather needs the local area, not an exact GPS fix. */
export function buildWeatherUrl(location: Pick<CurrentLocation, "latitude" | "longitude">): string {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)
    || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) {
    throw new Error("No se ha obtenido una ubicación válida.");
  }
  return WEATHER_API_ROOT + "?latitude=" + location.latitude.toFixed(2)
    + "&longitude=" + location.longitude.toFixed(2)
    + "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m"
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
    const description = weatherDescription(hourly?.weather_code?.[i]);
    const wind = finiteNumber(hourly?.wind_speed_10m?.[i]);
    forecast.push({
      name: String(date.getUTCHours()).padStart(2, "0") + ":" + String(date.getUTCMinutes()).padStart(2, "0"),
      startTimeMs: seconds * 1000,
      temperatureC: finiteNumber(hourly?.temperature_2m?.[i]),
      shortForecast: description, detailedForecast: description,
      precipitationPercent: finiteNumber(hourly?.precipitation_probability?.[i]),
      windSpeed: wind === null ? "" : String(Math.round(wind)) + " km/h",
      windDirection: compass(hourly?.wind_direction_10m?.[i]),
      isDaytime: hourly?.is_day?.[i] === 1,
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
