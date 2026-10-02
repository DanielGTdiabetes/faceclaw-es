import { ensureLocationPermission, hasLocationPermission } from "../../native/location-permissions";
import { weatherBridge } from "../../native/weather";
import { WeatherLayer } from "./weather";
import {
  createInProcessWindow,
  YieldAtRootLayer,
  type InProcessAppOptions,
  type InProcessWindow,
} from "../../ui/shell/in-process-window";

export const WEATHER_WINDOW_ID = "weather";
export const WEATHER_SURFACE_ID = "window:weather";

/** Local current conditions and forecast from Open-Meteo. */
export function createWeatherAppWindow(options: InProcessAppOptions): InProcessWindow {
  let closed = false;
  let requestingPermission = false;
  let unsubscribe: (() => void) | null = null;

  const requestUpdate = () => {
    if (closed || requestingPermission) return;
    if (hasLocationPermission()) {
      weatherBridge.start();
      return;
    }
    requestingPermission = true;
    void ensureLocationPermission().then((granted) => {
      requestingPermission = false;
      if (closed) return;
      if (granted) weatherBridge.start();
      app.requestRender();
    }).catch((error) => { requestingPermission = false; console.warn(`Weather permission: ${error}`); });
  };

  const app = createInProcessWindow({
    appId: "weather",
    windowId: WEATHER_WINDOW_ID,
    title: "Tiempo",
    iconLetter: "T",
    icon: "cloud-sun",
    closeable: true,
    menuItems: () => [
      {
        label: "Actualizar",
        onSelect: (ctx) => {
          ctx.stack.pop();
          requestUpdate();
        },
      },
    ],
    actions: options.actions,
    baseLayer: new YieldAtRootLayer(new WeatherLayer(() => weatherBridge.snapshot(), requestUpdate)),
    submitFrame: options.submitFrame,
    setSurfaceVisible: options.setSurfaceVisible,
    removeSurface: options.removeSurface,
    reconfigureSurface: options.reconfigureSurface,
    onClosed: () => {
      closed = true;
      unsubscribe?.();
      unsubscribe = null;
      weatherBridge.stop();
      options.onClosed();
    },
  });
  unsubscribe = weatherBridge.onStateChange(() => app.requestRender());
  requestUpdate();
  return app;
}
