import { ConfigSettingBoolean } from "../../ui/dashboard-settings";

/**
 * Where current conditions show outside the Weather app. While either is on
 * and the glasses are connected, the weather bridge refreshes hourly (see
 * weather-indicators.ts).
 */
export const weatherShowInStatusBarSetting = new ConfigSettingBoolean({
  id: "weather-show-in-status-bar",
  label: "Mostrar en la barra de estado",
  storageKey: "weather.showInStatusBar",
  defaultValue: false,
  description:
    "Muestra el estado del cielo y la temperatura en la barra superior. Mientras las gafas están conectadas, el tiempo de tu ubicación se consulta una vez por hora.",
});

/**
 * Also the Weather toggle in the system card's Glanceboard settings. On by
 * default: it only fetches while the system card is on an enabled board.
 */
export const weatherShowOnSystemCardSetting = new ConfigSettingBoolean({
  id: "weather-show-on-system-card",
  label: "Mostrar en la tarjeta del sistema",
  storageKey: "weather.showOnSystemCard",
  defaultValue: true,
  description:
    "Muestra el estado del cielo y la temperatura en la tarjeta del sistema del Glanceboard. Mientras las gafas están conectadas y la tarjeta del sistema está en el Glanceboard, el tiempo de tu ubicación se consulta una vez por hora.",
});
