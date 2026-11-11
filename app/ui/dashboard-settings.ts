import { normalizeNightscoutThreshold, type NightscoutThresholds } from "../apps/nightscout/nightscout-alerts";
import { GESTURE_DOUBLE_CLICK, InputEvent } from "./gestures";
import { DEFAULT_BRIGHTNESS_CURVE, G1_BRIGHTNESS_CURVE, RAYNEO_IO_BRIGHTNESS_CURVE, normalizeBrightnessCurve, brightnessCurveError } from "../g2/brightness-curve";
import {
  getBooleanSetting,
  getStringSetting,
  onSettingsStoreChanged,
  setBooleanSetting,
  setStringSetting,
} from "~/native/settings-store";
import { getDefaultSmallFont } from "~/graphics/ui-fonts";
import { wrapText } from "~/graphics/textwrap";
import {
  ASSISTANT_MODEL_CHOICES,
  assistantModelLabel,
  assistantModelProvider,
  type AssistantModel,
} from "~/assistant/models";
import { isLocalModelReady } from "../native/local-llm";
import { shouldShowNotificationOnGlasses } from "../native/notification-sources";
import { normalizeWhisperServerUrl } from "../native/whisper-server-stt";
import { normalizeOpenAiCompatibleUrl } from "../native/openai-chat";
import { isValidSpotifyClientId, SPOTIFY_CLIENT_ID_KEY } from "../native/spotify-auth";
import { drawRightValueMenuItem, drawToggleMenuItem, MenuItem, openModalMenu } from "./menu";
import { ANIMATION_SPEEDS, animationSpeedLabel, scaleAnimationDuration, type AnimationSpeed } from "./animation-speed";
import { MENU_ANIMATION_KEY } from "./menu-animation-pref";
import { LIST_ROW_TEXT_INSET, lineStep } from "./metrics";
import { Layer, type LayerContext } from "./layers";
import { GrayImage } from "~/graphics/image";
import type { DataCollectionLevel } from "../analytics/analytics-store";
import { IOS_PRIVACY_SUMMARY } from "../analytics/privacy-disclosure";

export type NightscoutSettings = {
  siteUrl: string;
  apiToken: string;
};
export type BatteryDisplayMode = "icon" | "percentage" | "stacked" | "stacked-percentage" | "dense";
/** When a top-bar battery indicator is shown: always, only below 50%, or never. */
export type BatteryIndicatorVisibility = "always" | "low" | "never";
export type TimeFormat = "24h" | "12h";
export type DistanceUnit = "miles" | "kilometers";
export type ScreenTimeoutSetting = "15s" | "30s" | "1m" | "3m" | "never";
/** Whether new phone notifications pop up on the glasses, and for how long without interaction. */
export type NewNotificationDisplay = "off" | "until-dismissed" | "5s" | "15s" | "1m";
// Auto runs Faceclaw's light curve. Numeric values use the calibrated firmware
// scale, clamped to 2–100; 2 is also the endpoint for screen fades.
export const BRIGHTNESS_VALUES = ["auto", "2", "10", "20", "30", "40", "50", "60", "70", "80", "90", "100"] as const;
export type BrightnessSetting = (typeof BRIGHTNESS_VALUES)[number];
export type WakeWordAction = "voice-input" | "off" | "turn-screen-on";

type ConfigSettingOptions<TValue, TId extends string> = {
  id: TId;
  label: string;
  storageKey: string;
  defaultValue: TValue;
  formatValue?: (value: TValue) => string;
  /** Extended description shown in the Settings panel when the row is selected. */
  description?: string;
  /**
   * Boolean and enum settings only take fixed values, so Full analytics
   * reports them (fixedChoiceSettingValues); false keeps this one out.
   */
  reportInAnalytics?: boolean;
};

// Fired after any setting changes, in any isolate (storage lives in the Java
// FaceclawSettings store and broadcasts to every isolate). Lets phone-side UI
// that depends on settings toggled from the glasses (e.g. the text-setting
// editor) update without waiting for an unrelated snapshot emit. Delivery is
// asynchronous: one message-loop tick after the set().
const settingChangeListeners = new Set<() => void>();

export function onAnySettingChanged(listener: () => void): () => void {
  settingChangeListeners.add(listener);
  return () => {
    settingChangeListeners.delete(listener);
  };
}

onSettingsStoreChanged(() => {
  // Font/cache invalidation listeners may register after this relay. Let the
  // entire store notification finish before observers synchronously repaint.
  // Otherwise Save updates the label but paints the previous typeface once.
  setTimeout(() => {
    for (const listener of Array.from(settingChangeListeners)) {
      listener();
    }
  }, 0);
});

// Boolean and enum settings by storage key, for fixedChoiceSettingValues.
// Settings built repeatedly (per-app or per-slot) just replace themselves.
const fixedChoiceSettings = new Map<string, ConfigSetting<boolean> | ConfigSetting<string>>();

/**
 * The current value of every boolean and enum setting this isolate has
 * loaded, keyed by storage key: what Full analytics reports as settings.
 * Free-text settings never appear.
 */
export function fixedChoiceSettingValues(): Record<string, boolean | string> {
  const values: Record<string, boolean | string> = {};
  for (const [storageKey, setting] of fixedChoiceSettings) values[storageKey] = setting.get();
  return values;
}

export abstract class ConfigSetting<TValue, TId extends string = string> {
  readonly id: TId;
  readonly label: string;
  readonly description?: string;
  protected readonly storageKey: string;
  protected readonly defaultValue: TValue;
  private readonly valueFormatter: (value: TValue) => string;

  protected constructor(options: ConfigSettingOptions<TValue, TId>) {
    this.id = options.id;
    this.label = options.label;
    this.description = options.description;
    this.storageKey = options.storageKey;
    this.defaultValue = options.defaultValue;
    this.valueFormatter = options.formatValue ?? ((value) => String(value));
  }

  abstract get(): TValue;
  abstract set(value: TValue): TValue;

  displayValue(value?: TValue): string {
    const displayValue = arguments.length > 0 ? value as TValue : this.get();
    return this.valueFormatter(displayValue);
  }
}

export class ConfigSettingBoolean<TId extends string = string> extends ConfigSetting<boolean, TId> {
  // Widens ConfigSetting's protected constructor.
  public constructor(options: ConfigSettingOptions<boolean, TId>) {
    super(options);
    if (options.reportInAnalytics !== false) fixedChoiceSettings.set(options.storageKey, this);
  }

  get(): boolean {
    return getBooleanSetting(this.storageKey, this.defaultValue);
  }

  set(value: boolean): boolean {
    setBooleanSetting(this.storageKey, value);
    return value;
  }

  toggle(value = this.get()): boolean {
    return this.set(!value);
  }
}

type ConfigSettingEnumOptions<TValue extends string, TId extends string> = ConfigSettingOptions<TValue, TId> & {
  values: readonly TValue[];
  normalize?: (value: string | null | undefined) => TValue;
  /** Dynamic availability check used by enum picker rows. */
  isDisabled?: (value: TValue) => boolean;
  /** The default while nothing is stored, when it depends on context (else `defaultValue`). */
  dynamicDefault?: () => TValue | undefined;
};

export class ConfigSettingEnum<TValue extends string, TId extends string = string> extends ConfigSetting<TValue, TId> {
  readonly values: readonly TValue[];
  private readonly normalizer: (value: string | null | undefined) => TValue;
  private readonly disabledPredicate: (value: TValue) => boolean;
  private readonly dynamicDefault: (() => TValue | undefined) | undefined;

  constructor(options: ConfigSettingEnumOptions<TValue, TId>) {
    super(options);
    this.dynamicDefault = options.dynamicDefault;
    if (options.reportInAnalytics !== false) fixedChoiceSettings.set(options.storageKey, this);
    this.values = options.values;
    this.disabledPredicate = options.isDisabled ?? (() => false);
    if (options.normalize) {
      this.normalizer = (value: string | null | undefined) => {
        const normalized = options.normalize(value) as TValue|undefined;
        if (normalized === undefined) return this.currentDefault();
        return normalized;
      }
    } else {
      this.normalizer = (value) => this.values.includes(value as TValue) ? value as TValue : this.currentDefault();
    }
  }

  /** What an unset (or invalid) value reads as now. */
  protected currentDefault(): TValue {
    return this.dynamicDefault?.() ?? this.defaultValue;
  }

  get(): TValue {
    return this.normalizer(getStringSetting(this.storageKey, this.currentDefault()));
  }

  set(value: TValue): TValue {
    const normalized = this.normalizer(value);
    setStringSetting(this.storageKey, normalized);
    return normalized;
  }

  isDisabled(value: TValue): boolean {
    return this.disabledPredicate(value);
  }

  next(value = this.get()): TValue {
    const index = this.values.indexOf(value);
    for (let offset = 1; offset <= this.values.length; offset++) {
      const candidate = this.values[(index + offset) % this.values.length];
      if (candidate !== undefined && !this.isDisabled(candidate)) return candidate;
    }
    return value;
  }
}

type ConfigSettingStringOptions<TId extends string> = ConfigSettingOptions<string, TId> & {
  editorTitle?: string;
  glassesEditTitle?: string;
  inputKind?: "text" | "email" | "password";
  normalize?: (value: string | null | undefined) => string;
  validate?: (value: string) => string | null;
  /** The default while nothing is stored, when it depends on context (else `defaultValue`). */
  dynamicDefault?: () => string | undefined;
};

// Every string setting by id, so isolates that can only pass an id over a
// message channel (e.g. a worker app requesting the phone text editor) can be
// resolved back to the setting instance on the main thread.
const stringSettingsById = new Map<string, ConfigSettingString>();

export function getStringSettingById(id: string): ConfigSettingString | null {
  return stringSettingsById.get(id) ?? null;
}

export class ConfigSettingString<TId extends string = string> extends ConfigSetting<string, TId> {
  readonly editorTitle: string;
  readonly glassesEditTitle: string;
  readonly inputKind: "text" | "email" | "password";
  private readonly normalizer: (value: string | null | undefined) => string;
  private readonly validator?: (value: string) => string | null;
  private readonly dynamicDefault: (() => string | undefined) | undefined;

  constructor(options: ConfigSettingStringOptions<TId>) {
    super(options);
    this.editorTitle = options.editorTitle ?? options.label;
    this.glassesEditTitle = options.glassesEditTitle ?? `Edit ${options.label}`;
    this.inputKind = options.inputKind ?? "text";
    this.normalizer = options.normalize ?? ((value) => value ?? "");
    this.validator = options.validate;
    this.dynamicDefault = options.dynamicDefault;
    stringSettingsById.set(this.id, this);
  }

  private currentDefault(): string {
    return this.dynamicDefault?.() ?? this.defaultValue;
  }

  get(): string {
    return this.normalizer(getStringSetting(this.storageKey, this.currentDefault()));
  }

  set(value: string): string {
    const normalized = this.normalizer(value);
    // Preserve drafts for the editor/preview; consumers can use getValidValue().
    if (this.validator) {
      const candidate = this.validator(normalized) ? this.get() : normalized;
      if (!this.validator(candidate)) setStringSetting(this.storageKey + ".valid", candidate);
    }
    setStringSetting(this.storageKey, normalized);
    return normalized;
  }

  validationError(value = this.get()): string | null { return this.validator?.(value) ?? null; }

  getValidValue(): string {
    const value = this.get();
    if (!this.validationError(value)) return value;
    const saved = this.normalizer(getStringSetting(this.storageKey + ".valid", this.currentDefault()));
    return this.validationError(saved) ? this.currentDefault() : saved;
  }
}


export const batteryDisplayModeSetting = new ConfigSettingEnum<BatteryDisplayMode>({
  id: "batteryDisplayMode",
  label: "Estilo",
  storageKey: "dashboard.systemCard.batteryDisplayMode",
  defaultValue: "dense",
  values: ["icon", "percentage", "stacked", "stacked-percentage", "dense"],
  formatValue: batteryDisplayModeLabel,
  description: "How the top bar shows battery levels: a gauge icon or exact percentage beside the label, a compact gauge or percentage with the label stacked above it, or (dense) a device icon beside each gauge with two indicators stacked per column.",
});

/** Below this charge level a "Below 50%" indicator becomes visible. */
export const BATTERY_LOW_VISIBILITY_THRESHOLD = 50;

function batteryVisibilitySetting(
  id: string,
  device: string,
  storageKey: string,
): ConfigSettingEnum<BatteryIndicatorVisibility> {
  return new ConfigSettingEnum<BatteryIndicatorVisibility>({
    id,
    label: device,
    storageKey,
    defaultValue: "always",
    values: ["always", "low", "never"],
    formatValue: batteryIndicatorVisibilityLabel,
    description: `When the top bar shows the ${device} battery: always, only once it drops below ${BATTERY_LOW_VISIBILITY_THRESHOLD}%, or never.`,
  });
}

export const phoneBatteryVisibilitySetting = batteryVisibilitySetting(
  "phoneBatteryVisibility", "Phone", "display.battery.phoneVisibility",
);
export const glassesBatteryVisibilitySetting = batteryVisibilitySetting(
  "glassesBatteryVisibility", "Glasses", "display.battery.glassesVisibility",
);
export const ringBatteryVisibilitySetting = batteryVisibilitySetting(
  "ringBatteryVisibility", "R1", "display.battery.ringVisibility",
);
/** The watch; the indicator only exists while a watch is reachable. */
export const watchBatteryVisibilitySetting = batteryVisibilitySetting(
  "watchBatteryVisibility", "Reloj", "display.battery.watchVisibility",
);

/** Whether an indicator with this visibility setting shows at the given charge. */
export function batteryIndicatorVisible(visibility: BatteryIndicatorVisibility, percent: number): boolean {
  if (visibility === "never") return false;
  if (visibility === "always") return true;
  return percent < BATTERY_LOW_VISIBILITY_THRESHOLD;
}

/**
 * One string summarizing every setting the top-bar battery block reads, so
 * the shell can cheaply tell whether a settings change needs a repaint.
 */
export function batteryIndicatorSettingsKey(): string {
  return [
    batteryDisplayModeSetting.get(),
    phoneBatteryVisibilitySetting.get(),
    glassesBatteryVisibilitySetting.get(),
    ringBatteryVisibilitySetting.get(),
    watchBatteryVisibilitySetting.get(),
  ].join("|");
}

/** Exported so the Navigate worker can repaint when it changes. */
export const TIME_FORMAT_SETTING_KEY = "display.timeFormat";

export const timeFormatSetting = new ConfigSettingEnum<TimeFormat>({
  id: "timeFormat",
  label: "Formato de hora",
  storageKey: TIME_FORMAT_SETTING_KEY,
  defaultValue: "24h",
  values: ["24h", "12h"],
  formatValue: timeFormatLabel,
  description: "Whether the top-bar clock and other times of day, such as Navigate's arrival time, show 24-hour or 12-hour time.",
});

/** Exported so the Navigate worker can repaint when it changes. */
export const DISTANCE_UNIT_SETTING_KEY = "display.distanceUnit";

export const distanceUnitSetting = new ConfigSettingEnum<DistanceUnit>({
  id: "distanceUnit",
  label: "Distance unit",
  storageKey: DISTANCE_UNIT_SETTING_KEY,
  defaultValue: "miles",
  values: ["miles", "kilometers"],
  formatValue: (value) => value === "kilometers" ? "Kilometers" : "Miles",
  description: "Whether the Weather app shows wind speed in mph or km/h, and the Navigate app shows distances in miles and feet or kilometers and meters.",
});

/**
 * Where the app switcher (the open-window icons) sits: a strip along the
 * left or right edge of the display, a row under the window, or a popup box
 * over the middle of the window that shows only while it has focus.
 */
export type AppSwitcherPosition = "left" | "right" | "bottom" | "popup";

/** Which glasses the saved addresses belong to (set by pairing; see g2/device-addresses.ts). */
export type GlassesType = "g2" | "rayneo-io" | "g1";

export const glassesTypeSetting = new ConfigSettingEnum<GlassesType>({
  id: "glasses-type",
  label: "Glasses",
  storageKey: "deviceType", // graphics/screen-size.ts GLASSES_TYPE_KEY reads it directly
  defaultValue: "g2",
  values: ["g2", "rayneo-io", "g1"],
  reportInAnalytics: false,
});

/**
 * Whether the paired glasses can report a heading. A G1 has an accelerometer
 * and a gyroscope but no magnetometer; the RayNeo iO's firmware has no compass
 * messages.
 */
export function glassesHaveCompass(): boolean {
  return glassesTypeSetting.get() === "g2";
}

const GLASSES_MODEL_NAMES: Record<GlassesType, string> = { g2: "G2", g1: "G1", "rayneo-io": "iO" };

/** The paired glasses' model without the brand, short enough for battery labels and a watch's one-line charging status. */
export function glassesModelName(): string {
  return GLASSES_MODEL_NAMES[glassesTypeSetting.get()];
}

const APP_SWITCHER_POSITION_LABELS: Record<AppSwitcherPosition, string> = {
  left: "Izquierda",
  right: "Derecha",
  bottom: "Abajo",
  popup: "Emergente",
};

export const appSwitcherPositionSetting = new ConfigSettingEnum<AppSwitcherPosition>({
  id: "app-switcher-position",
  label: "Posición del selector de apps",
  storageKey: "display.appSwitcherPosition",
  defaultValue: "bottom",
  values: ["left", "right", "bottom", "popup"],
  // The RayNeo iO's 220 rows can't spare a bottom row: a side strip by default there.
  dynamicDefault: () => (glassesTypeSetting.get() === "rayneo-io" ? "left" : undefined),
  formatValue: (value) => APP_SWITCHER_POSITION_LABELS[value] ?? value,
  description:
    "Where the open-app icons go. Left and right take a column beside windows; bottom puts a row beneath the window, which makes full-height windows a little shorter; popup shows them only while you're in the app switcher, in a box over the dimmed window. Bottom and popup leave room at the sides to set the display's depth. Open apps reopen at their new size when a change resizes windows.",
});

/**
 * An enum setting that took over from older settings: until it is first
 * set, its value is derived from theirs.
 */
class ConfigSettingEnumWithLegacy<TValue extends string> extends ConfigSettingEnum<TValue> {
  constructor(options: ConfigSettingEnumOptions<TValue, string>, private readonly legacyValue: () => TValue) {
    super(options);
  }

  get(): TValue {
    return getStringSetting(this.storageKey, "") === "" ? this.legacyValue() : super.get();
  }
}

/**
 * How much of the 640x480 panel windows use, and where: the stock
 * 288px-tall band, at one of five heights in the field of view; Tall, every
 * window the full height; or Full Screen, Tall at the panel's whole 640px
 * width. The app switcher keeps its own room in every mode. Full Screen
 * needs a bottom row or popup app switcher (a side strip leaves no width to
 * spare; there it is Tall), has no window frame, and plays at depth 0,
 * since its windows reach the panel's edges (geometry.ts).
 */
export const DISPLAY_LAYOUT_VALUES = [
  "band-top", "band-high", "band-middle", "band-low", "band-bottom", "tall", "fullscreen",
] as const;
export type DisplayLayout = (typeof DISPLAY_LAYOUT_VALUES)[number];

const DISPLAY_LAYOUT_LABELS: Record<DisplayLayout, string> = {
  "band-top": "Banda · Arriba",
  "band-high": "Banda · Alta",
  "band-middle": "Banda · Centro",
  "band-low": "Banda · Baja",
  "band-bottom": "Banda · Abajo",
  tall: "Altura completa",
  fullscreen: "Pantalla completa",
};

export function displayLayoutLabel(value: DisplayLayout): string {
  return DISPLAY_LAYOUT_LABELS[value] ?? value;
}

/** Whether the Full Screen display mode is available: with a bottom row or popup app switcher. */
export function fullScreenAvailable(): boolean {
  const position = appSwitcherPositionSetting.get();
  return position === "bottom" || position === "popup";
}

// Until 2026-10-10 the display mode ("576x288" band, "576x480" tall,
// "640x480" full panel) and the band's vertical position were separate
// settings, globally and per app.
const LEGACY_MODE_LAYOUTS: Record<string, DisplayLayout> = { "576x480": "tall", "640x480": "fullscreen" };
const LEGACY_POSITION_LAYOUTS: Record<string, DisplayLayout> = {
  top: "band-top", upper: "band-high", middle: "band-middle", lower: "band-low", bottom: "band-bottom",
};

function legacyBand(position: string): DisplayLayout {
  return LEGACY_POSITION_LAYOUTS[position] ?? "band-middle";
}

function legacyDisplayLayout(): DisplayLayout {
  const mode = getStringSetting("display.mode", "576x288");
  return LEGACY_MODE_LAYOUTS[mode] ?? legacyBand(getStringSetting("display.verticalPosition", "middle"));
}

export const displayLayoutSetting = new ConfigSettingEnumWithLegacy<DisplayLayout>({
  id: "display-mode",
  label: "Modo de pantalla",
  storageKey: "display.layout",
  defaultValue: "band-middle",
  values: DISPLAY_LAYOUT_VALUES,
  formatValue: displayLayoutLabel,
  isDisabled: (value) => value === "fullscreen" && !fullScreenAvailable(),
  description:
    "Banda: la ventana original de 288 px de alto, a la altura de tu campo de visión que elijas. Altura completa: ventanas que ocupan todo el alto. Pantalla completa: todo el alto y todo el ancho; necesita el selector de apps abajo o emergente y desactiva la profundidad, porque las ventanas llegan a los bordes. Navegar y Terminal pueden cambiarlo. Las apps abiertas se reabren con el nuevo tamaño.",
}, legacyDisplayLayout);

const UI_DEPTH_VALUES = ["-62", "-48", "-32", "-16", "0", "16", "32", "48", "62"] as const;
export type UiDepth = (typeof UI_DEPTH_VALUES)[number];

/**
 * Stereo depth of the whole display, in the firmware's depth units: the
 * lenses shift everything by half this many pixels each, in opposite
 * directions. Only applies with the app switcher at the bottom or a popup,
 * where the windows' 576px width leaves 32px at each side: one for the side
 * of the window's frame and 31 to shift into, hence ±62 (see geometry.ts
 * uiDepth and windowFramed); not to Full Screen windows, which have no such
 * margins. Values stay even so the per-lens halves of nested depths add
 * exactly.
 */
export const uiDepthSetting = new ConfigSettingEnum<UiDepth>({
  id: "ui-depth",
  label: "Profundidad",
  storageKey: "display.uiDepth",
  defaultValue: "48",
  values: UI_DEPTH_VALUES,
  formatValue: (value) => {
    const depth = Number(value);
    return depth === 0 ? "0" : depth > 0 ? `+${depth} (nearer)` : `${depth} (farther)`;
  },
  description:
    "Moves the whole display nearer (positive) or farther away (negative) by shifting it in opposite directions on the two lenses. Available with the app switcher at the bottom or as a popup; not applied in the Full Screen display mode, whose windows reach the display's edges.",
});

/**
 * Where the status bar (clock, notification icons, app widgets, batteries)
 * goes: the top bar over each window, or its bottom. With a bottom app
 * switcher, the bottom is the right end of the switcher's row (geometry.ts
 * statusInSwitcherRow), where windows grow into the top bar's height; with a
 * popup switcher, a bar under the window (geometry.ts statusBarEdge).
 */
export type StatusBarPosition = "top" | "bottom";

export const statusBarPositionSetting = new ConfigSettingEnum<StatusBarPosition>({
  id: "status-bar-position",
  label: "Status bar position",
  storageKey: "display.statusBarPosition",
  defaultValue: "bottom",
  values: ["top", "bottom"],
  // "switcher" was the bottom value's name while only a bottom row had one.
  normalize: (value) => value === "bottom" || value === "switcher" ? "bottom" : "top",
  formatValue: (value) => value === "top" ? "Top"
    : appSwitcherPositionSetting.get() === "bottom" ? "With app switcher" : "Bottom",
  description:
    "Where the clock, notification icons, app widgets and battery indicators go. With the app switcher at the bottom, With app switcher puts them at the right end of its row, and windows grow into the top bar's space; with a popup app switcher, Bottom puts them under the window. Available with the app switcher at the bottom or as a popup. Changing it reopens open apps in the new size.",
});

/**
 * Whether the status bar always takes its rows along the window's edge, or
 * shows only while the popup app switcher is up, over the window's edge
 * (geometry.ts statusBarOverlays); the windows then grow into its rows.
 */
export type StatusBarVisibility = "always" | "switcher";

export const statusBarVisibilitySetting = new ConfigSettingEnum<StatusBarVisibility>({
  id: "status-bar-visibility",
  label: "Status bar visibility",
  storageKey: "display.statusBarVisibility",
  defaultValue: "always",
  values: ["always", "switcher"],
  formatValue: (value) => value === "switcher" ? "In app switcher" : "Always",
  description:
    "Always keeps the clock, notification icons, app widgets and battery indicators beside the window. In app switcher shows them only while the app switcher is open, over the edge of the window, and windows grow into their space. Available with a popup app switcher. Changing it reopens open apps in the new size.",
});

/**
 * Whether the foreground window gets a rounded border with a popup app
 * switcher (geometry.ts windowFramed); without one, a line divides the
 * window from the status bar.
 */
export const windowBorderSetting = new ConfigSettingBoolean({
  id: "window-border",
  label: "Window border",
  storageKey: "display.windowBorder",
  defaultValue: true,
  description:
    "Draw a rounded border around the window. Without it, a line separates the window from the status bar. Available with a popup app switcher. Changing it reopens open apps in the new size.",
});

export const brightnessSetting = new ConfigSettingEnum<BrightnessSetting>({
  id: "brightness",
  label: "Brillo",
  storageKey: "display.brightness",
  defaultValue: "auto",
  values: BRIGHTNESS_VALUES,
  normalize: (value) => value === "0" ? "2" : BRIGHTNESS_VALUES.includes(value as BrightnessSetting) ? value as BrightnessSetting : "auto",
  formatValue: brightnessLabel,
  description: "Auto uses Faceclaw's ambient-light curve; numbers set a fixed level. 2 is the dimmest level.",
});

const AUTO_BRIGHTNESS_LEVELS = ["2", "5", "10", "20", "25", "30", "40", "50", "60", "70", "80", "90", "100"] as const;
export const autoBrightnessMinSetting = new ConfigSettingEnum({
  id: "autoBrightnessMin", label: "Mínimo automático", storageKey: "display.autoBrightnessMin",
  defaultValue: "20", values: AUTO_BRIGHTNESS_LEVELS,
  description: "Lowest brightness Auto will select. Screen fades can still reach 2.",
});
export const autoBrightnessMaxSetting = new ConfigSettingEnum({
  id: "autoBrightnessMax", label: "Máximo automático", storageKey: "display.autoBrightnessMax",
  defaultValue: "100", values: AUTO_BRIGHTNESS_LEVELS,
  description: "Highest brightness Auto will select. A value below the minimum uses the minimum.",
});
export const autoBrightnessCurveSetting = new ConfigSettingString({
  id: "autoBrightnessCurve", label: "Curva de luz automática", storageKey: "display.autoBrightnessCurve",
  defaultValue: DEFAULT_BRIGHTNESS_CURVE, normalize: normalizeBrightnessCurve, validate: brightnessCurveError,
  dynamicDefault: () => {
    const glasses = glassesTypeSetting.get();
    return glasses === "rayneo-io" ? RAYNEO_IO_BRIGHTNESS_CURVE : glasses === "g1" ? G1_BRIGHTNESS_CURVE : undefined;
  },
  description: "2–16 lux:percent pairs, separated by commas. Percent is within your minimum–maximum range. Start at 0:0, end at 100%, and increase lux without decreasing percent. Incomplete edits stay in the preview; brightness keeps using the last valid curve.",
});
/** The screen on/off fade at Normal speed. */
const SCREEN_FADE_MS = 280;

export const menuAnimationSetting = new ConfigSettingEnum<AnimationSpeed>({
  id: "menu-animation",
  label: "Animación de menús",
  storageKey: MENU_ANIMATION_KEY,
  defaultValue: "normal",
  values: ANIMATION_SPEEDS,
  formatValue: animationSpeedLabel,
  description: "How fast the highlight slides, lists scroll, and the ends bounce in menus, lists, and the launcher and Files icon grids. Disabled moves them instantly.",
});

export const screenFadeSetting = new ConfigSettingEnum<AnimationSpeed>({
  id: "screen-fade",
  label: "Transición de pantalla",
  storageKey: "display.screenFadeSpeed",
  defaultValue: "normal",
  values: ANIMATION_SPEEDS,
  formatValue: animationSpeedLabel,
  description: "How fast the display fades in and out when the screen turns on or off. Disabled switches it instantly.",
});

export function getBrightnessPreferences() {
  const level = brightnessSettingToLevel(brightnessSetting.get());
  return { auto: level === null, level: level ?? 50,
    minimum: Number(autoBrightnessMinSetting.get()), maximum: Number(autoBrightnessMaxSetting.get()),
    curve: autoBrightnessCurveSetting.getValidValue(), fadeMs: scaleAnimationDuration(SCREEN_FADE_MS, screenFadeSetting.get()) };
}

export const wakeToLastAppSetting = new ConfigSettingBoolean({
  id: "wake-to-last-app",
  label: "Despertar en la última app",
  storageKey: "display.wakeToLastApp",
  defaultValue: false,
  description: "Al despertar la pantalla con doble toque vuelves a la app que estabas usando. Desactivado: se abre el selector de apps.",
});

export const screenTimeoutSetting = new ConfigSettingEnum<ScreenTimeoutSetting>({
  id: "screen-timeout",
  label: "Apagar pantalla tras",
  storageKey: "display.screenTimeout",
  defaultValue: "30s",
  values: ["15s", "30s", "1m", "3m", "never"],
  formatValue: screenTimeoutLabel,
  description: "How long the display stays on after the last input before turning itself off. \"Never\" keeps it on until turned off manually.",
});

export const newNotificationDisplaySetting = new ConfigSettingEnum<NewNotificationDisplay>({
  id: "new-notification-display",
  label: "Display new notifications",
  storageKey: "notifications.newNotificationDisplay",
  defaultValue: "15s",
  values: ["off", "until-dismissed", "5s", "15s", "1m"],
  formatValue: newNotificationDisplayLabel,
  description:
    "Pop up new phone notifications on the glasses. A timed popup closes once left untouched that long; " +
    "the notification stays on the phone and in the status bar.",
});

/** Whether a newly posted phone notification from this app pops up on the glasses (the global setting, then the app's filter toggle). */
export function shouldPopUpNewNotification(packageName: string): boolean {
  return newNotificationDisplaySetting.get() !== "off" && shouldShowNotificationOnGlasses(packageName);
}

export const lockScreenEnabledSetting = new ConfigSettingBoolean({
  id: "lock-screen-enabled",
  label: "Activar bloqueo",
  storageKey: "display.lockScreenEnabled",
  defaultValue: true,
  description:
    "Lock the glasses after they are taken off while the phone is locked. Unlocking the phone unlocks the glasses." +
    (global.isIOS ? " On iPhone, this requires a device passcode and follows iOS data-protection notifications, which may be delayed after the screen locks." : ""),
});

// Phone display: the phone app's mirror of the glasses screen and the
// controls around it on the main page.
export type PreviewColor = "white" | "green";
export type PhoneRotation = "auto" | "portrait" | "landscape";

export const phoneRotationSetting = new ConfigSettingEnum<PhoneRotation>({
  id: "phone-rotation",
  label: "Rotación",
  storageKey: "phone.rotation",
  defaultValue: "auto",
  values: ["auto", "portrait", "landscape"],
  formatValue: (value) => ({ auto: "Rotación automática", portrait: "Siempre vertical", landscape: "Siempre horizontal" })[value],
  description: "Automatically rotate with the phone, or keep the phone app in portrait or landscape. Auto-Rotate follows the phone's system rotation preference.",
});

export const previewColorSetting = new ConfigSettingEnum<PreviewColor>({
  id: "preview-color",
  label: "Color de vista previa",
  storageKey: "phone.previewColor",
  defaultValue: "white",
  values: ["white", "green"],
  formatValue: (value) => (value === "green" ? "Verde" : "Blanco"),
  description:
    "How the phone's mirror of the glasses display renders: white/grayscale (clearest), or green to match the physical glasses.",
});

export type PreviewScaling = "scaled" | "raw";

export const previewScalingSetting = new ConfigSettingEnum<PreviewScaling>({
  id: "preview-scaling",
  label: "Escala de la vista previa",
  storageKey: "phone.previewScaling",
  defaultValue: "scaled",
  values: ["scaled", "raw"],
  formatValue: (value) => (value === "raw" ? "Sin escalar" : "Escalada"),
  description:
    "Qué parte de la pantalla de las gafas muestra el espejo del móvil: Escalada centra y amplía la zona que usa el modo de pantalla actual; Sin escalar muestra el panel completo de 640x480.",
});

export const mirrorTouchSetting = new ConfigSettingBoolean({
  id: "mirror-touch",
  label: "Control táctil de la vista previa",
  // Key predates this setting object (the toggle used to live on the phone's
  // main screen); keeping it preserves the user's choice.
  storageKey: "phone.mirrorTouch",
  defaultValue: true,
  description:
    "Let touches on the phone's mirror act on the glasses UI: tap selects what it lands on, double-tap goes back, a hold opens the menu, swipes navigate.",
});

// Watch remote (app/g2/wear-remote.ts, wear/, apple-watch/). All three are read on
// every watch message, so a change applies immediately.
export const watchRemoteEnabledSetting = new ConfigSettingBoolean({
  id: "watch-remote-enabled",
  label: "Control desde el reloj",
  storageKey: "watch.remoteEnabled",
  defaultValue: true,
  description:
    "Accept input from the Faceclaw watch app: spatial swipes, taps, holds, crown, voice queries and app commands. The ring's scheme is unaffected. Turn off to ignore the watch.",
});

export const watchCanUnlockSetting = new ConfigSettingBoolean({
  id: "watch-can-unlock",
  label: "Permitir desbloqueo desde el reloj",
  storageKey: "watch.canUnlock",
  defaultValue: true,
  description:
    "Let the watch unlock the glasses' lock screen (which otherwise waits for the phone to be unlocked). Your watch is on your wrist; turn this off if you would rather it stay a phone-only unlock.",
});

// Wear OS only: the Apple Watch's crown doesn't reach the app, so iOS doesn't offer this.
export const watchCrownClockwiseNextSetting = new ConfigSettingBoolean({
  id: "watch-crown-clockwise-next",
  label: "Corona en sentido horario = siguiente",
  storageKey: "watch.crownClockwiseNext",
  defaultValue: false,
  description:
    "Choose which crown direction moves to the next item. Off: clockwise moves to the previous item. On: clockwise moves to the next item.",
});

// Apple Watch only: Wear OS has no sounds, and keeps its vibration setting on the watch.
// The watch reads these from the mirrored state (apple-watch/Faceclaw/WatchPrefs.swift).
export const watchVibrateOnInputSetting = new ConfigSettingBoolean({
  id: "watch-vibrate-on-input",
  label: "Vibrate on input",
  storageKey: "watch.vibrateOnInput",
  defaultValue: true,
  description:
    "Adds a slight vibration with each watch input",
});

export const watchSoundEffectsSetting = new ConfigSettingBoolean({
  id: "watch-sound-effects",
  label: "Sound effects",
  storageKey: "watch.soundEffects",
  defaultValue: false,
  description:
    "On: each input gets its own watchOS feedback, a sound with a vibration (watchOS can't play one alone, so this vibrates even with Vibrate on input off). Off: a light tap for every input. Only Silent Mode on the watch guarantees no sound.",
});

export const watchMirrorAssistantSetting = new ConfigSettingBoolean({
  id: "watch-mirror-assistant",
  label: "Mostrar asistente en el reloj",
  storageKey: "watch.mirrorAssistant",
  defaultValue: true,
  description: "Stream assistant replies and on-glasses alerts to the watch so they can be read from the wrist.",
});

/**
 * A per-app display mode (Navigate, Terminal): the global one ("global"),
 * Terminal's own default ("default": tall sessions, the sessions list at
 * the global mode), or a mode of its own.
 */
export type AppDisplayLayout = "default" | "global" | DisplayLayout;

function legacyAppDisplayLayout(appId: string, defaultValue: AppDisplayLayout): AppDisplayLayout {
  const mode = getStringSetting(`${appId}.displayMode`, defaultValue);
  const position = getStringSetting(`${appId}.verticalPosition`, "global");
  if (LEGACY_MODE_LAYOUTS[mode]) return LEGACY_MODE_LAYOUTS[mode];
  const global = displayLayoutSetting.get();
  if (mode === "576x288") return position === "global" ? (global.startsWith("band-") ? global : legacyDisplayLayout()) : legacyBand(position);
  // Following the global mode at a band position of its own.
  if (mode === "global" && position !== "global" && global.startsWith("band-")) return legacyBand(position);
  return mode === "default" || mode === "global" ? mode : defaultValue;
}

function appDisplayLayoutSetting(appId: string, defaultValue: AppDisplayLayout): ConfigSettingEnum<AppDisplayLayout> {
  return new ConfigSettingEnumWithLegacy<AppDisplayLayout>({
    id: `${appId}-display-mode`,
    label: "Modo de pantalla",
    storageKey: `${appId}.displayLayout`,
    defaultValue,
    values: appId === "terminal" ? ["default", "global", ...DISPLAY_LAYOUT_VALUES] : ["global", ...DISPLAY_LAYOUT_VALUES],
    formatValue: (value) => value === "default" ? "Sesiones a altura completa (predeterminado)" : value === "global" ? "Usar ajuste global" : displayLayoutLabel(value),
    isDisabled: (value) => value === "fullscreen" && !fullScreenAvailable(),
    description: appId === "terminal"
      ? "Modo de pantalla de Terminal. El predeterminado muestra las sesiones a altura completa y la lista de terminales en el modo global. Usar ajuste global aplica los ajustes de Pantalla a todas las ventanas de Terminal. Cambiar el tamaño de una sesión abierta reconecta su vista con el nuevo tamaño."
      : "Modo de pantalla de Navegar. Elige una Banda para dejar más campo de visión libre, o Usar ajuste global para seguir los ajustes de Pantalla. También se aplica a la ruta actual.",
  }, () => legacyAppDisplayLayout(appId, defaultValue));
}

export const navigateDisplayLayoutSetting = appDisplayLayoutSetting("navigate", "global");
export const terminalDisplayLayoutSetting = appDisplayLayoutSetting("terminal", "default");

export type { DataCollectionLevel };

/** The data-collection setting's key, for observers (app/analytics/analytics.ts). */
export const DATA_COLLECTION_KEY = "privacy.dataCollection";

const DATA_COLLECTION_LABELS: Record<DataCollectionLevel, string> = {
  none: "Ninguna",
  minimal: "Mínima",
  full: "Completa",
};

// What each level collects is set out in app/analytics/analytics-store.ts and
// the privacy policy (PRIVACY); keep these in step with both.
const DATA_COLLECTION_SUMMARIES: Record<DataCollectionLevel, string> = {
  none: "No compartir ningún dato",
  minimal: "Versión, dispositivos y fiabilidad de la conexión",
  full: "Datos de uso más detallados",
};

/** One-line summary of what a data-collection level sends (onboarding, settings). */
export function dataCollectionSummary(level: DataCollectionLevel): string {
  return DATA_COLLECTION_SUMMARIES[level];
}

/** Chosen in the on-glasses onboarding; changeable in Settings > Privacy. */
export const dataCollectionSetting = new ConfigSettingEnum<DataCollectionLevel>({
  id: "data-collection",
  label: "Estadísticas de Faceclaw",
  storageKey: DATA_COLLECTION_KEY,
  defaultValue: "none",
  values: ["none", "minimal", "full"],
  formatValue: (value) => DATA_COLLECTION_LABELS[value],
  description:
    (global.isIOS ? IOS_PRIVACY_SUMMARY + " " : "") +
    "Estadísticas opcionales que Faceclaw puede enviar una vez al día a sus desarrolladores para corregir " +
    "problemas y mejorar la app. Ninguna: no se guarda ni se envía ninguna estadística. Mínima: la versión " +
    "de la app, qué dispositivos están emparejados y en uso y la fiabilidad de la conexión con ellos. " +
    "Completa: además, los ajustes elegidos entre opciones fijas y qué tipos de clave API hay configurados " +
    "(nunca las claves).",
});

export const voiceControlEnabledSetting = new ConfigSettingBoolean({
  id: "voice-control-enabled",
  label: "Activar",
  storageKey: "voice.enabled",
  defaultValue: true,
  description: "Master switch for voice features, including wakeword detection and voice input.",
});

export const firmwareDebugFlagsSetting = new ConfigSettingBoolean({
  id: "firmware-debug-flags",
  label: "Depuración del firmware",
  storageKey: "developer.firmwareDebugFlags",
  defaultValue: false,
  description: "Overlay debug information provided by custom firmware that shows draw timings and dirty rects. Only useful for firmware development.",
});

export const suspendEvenHubWhenScreenOffSetting = new ConfigSettingBoolean({
  id: "suspend-evenhub-screen-off",
  label: "Suspender EvenHub al apagar pantalla",
  storageKey: "developer.suspendEvenHubWhenScreenOff",
  defaultValue: true,
  description: "Suspend the EvenHub session while the display is off. This significantly improves battery life, but increases the latency of waking the screen.",
});

export const useMicControlSetting = new ConfigSettingBoolean({
  id: "use-mic-control",
  label: "Control del micrófono",
  storageKey: "developer.useMicControl",
  defaultValue: true,
  description:
    "Use the custom firmware's per-temple mic-control channel for the Microphones app's array capture. When off, use the standard single mixed stream.",
});

export const showBleBandwidthSetting = new ConfigSettingBoolean({
  id: "show-ble-bandwidth",
  label: "Mostrar uso de ancho de banda BLE",
  storageKey: "developer.showBleBandwidth",
  defaultValue: false,
  description:
    "Show Bluetooth messages and bytes sent, throughput, acknowledged display fps, and bytes per frame at the bottom of the phone screen. Rates use a five-second window; bytes include control traffic and protocol framing.",
});

/**
 * How the phone talks to the R1. The ring has one phone role (health sync) and
 * one glasses role (gestures, battery pushes), so "health" and "direct" are
 * the two ways a phone link can be useful; see
 * GlassesSessionCore.setDirectRingRole and notes/ring-link-control.md.
 */
export type RingConnectionMode = "glasses" | "health" | "direct";

export const ringConnectionModeSetting = new ConfigSettingEnum<RingConnectionMode>({
  id: "ring-connection-mode",
  label: "Conexión del anillo",
  storageKey: "developer.ringConnectionMode",
  defaultValue: "glasses",
  values: ["glasses", "health", "direct"],
  formatValue: (value) =>
    value === "direct" ? "Directa al móvil" : value === "health" ? "Por las gafas y con sincronización de salud" : "Solo a través de las gafas",
  description:
    "How the R1 ring reaches the phone. Only via glasses: the glasses relay the ring's gestures and the phone never connects to it. Via glasses + health sync: the same, plus the phone connects to the ring to sync health data. Direct to phone (experimental): the phone takes the ring over from the glasses and gets its gestures and battery itself; the glasses lose ring input. Health still syncs, but each sync (on opening Health, and at :01 and :31) pauses ring gestures for up to a minute while the phone briefly reconnects to the ring in its health role. Leaving Direct hands the ring back to the glasses. A RayNeo iO has no ring link of its own, so with one the phone always connects to the ring directly. Takes effect on the next connection to the glasses.",
});

/**
 * The ring connection in effect: the setting with G2 glasses; Direct with a
 * RayNeo iO or Even G1, which cannot relay a ring, so the phone holds the ring's
 * glasses role itself (gestures, battery; health in brief phone-role windows).
 */
export function effectiveRingConnectionMode(): RingConnectionMode {
  return glassesTypeSetting.get() !== "g2" ? "direct" : ringConnectionModeSetting.get();
}

// "whisper" (no "onboard-" prefix) is OpenAI's CLOUD realtime model
// (gpt-realtime-whisper); "onboard-whisper" is the on-device sherpa-onnx
// Whisper backend. Same underlying model family, two different places it
// runs -- see the same note in native/voice-control.ts. The "whisper" value
// keeps its name (it's a persisted setting on real installs) but its label
// below now says "OpenAI" to tell the two apart in the picker.
// "whisper-server" is a self-hosted OpenAI-compatible Whisper (e.g. vLLM).
export type VoiceProvider = "onboard" | "onboard-whisper" | "onboard-whisper-small" | "onboard-whisper-medium" | "elevenlabs" | "whisper" | "soniox" | "whisper-server" | "even";

// On iOS "onboard" is Apple's on-device recognizer, and there is no
// "onboard-whisper" (the sherpa-onnx models are Android-only).
const voiceProviderLabels: Record<VoiceProvider, string> = {
  onboard: global.isIOS ? "En el dispositivo (Apple)" : "Local (Moonshine, solo inglés)",
  "onboard-whisper": "Local (Whisper base, español, rápido)",
  "onboard-whisper-small": "Local (Whisper small, español, mayor precisión)",
  "onboard-whisper-medium": "Local (Whisper medium, español, más espera)",
  elevenlabs: "ElevenLabs",
  whisper: "OpenAI (Whisper)",
  soniox: "Soniox",
  "whisper-server": "Servidor Whisper (propio)",
  even: "EVO-X2 (local por Tailscale, gratis)",
};

export const voiceProviderSetting = new ConfigSettingEnum<VoiceProvider>({
  id: "voice-provider",
  label: "Reconocimiento de voz",
  storageKey: "voice.provider",
  defaultValue: global.isIOS ? "onboard" : "onboard-whisper",
  values: global.isIOS
    ? ["onboard", "elevenlabs", "whisper", "soniox", "whisper-server"]
    : ["onboard", "onboard-whisper", "onboard-whisper-small", "onboard-whisper-medium", "elevenlabs", "whisper", "soniox", "whisper-server", "even"],
  formatValue: (value) => voiceProviderLabels[value] ?? value,
  isDisabled: (value) => {
    if (value === "elevenlabs") return elevenLabsApiKeySetting.get().trim().length === 0;
    if (value === "whisper") return openAiApiKeySetting.get().trim().length === 0;
    if (value === "soniox") return sonioxApiKeySetting.get().trim().length === 0;
    if (value === "whisper-server") return !normalizeWhisperServerUrl(whisperServerUrlSetting.get());
    if (value === "even") return evenAsrKeySetting.get().trim().length === 0 || evenAsrUrlSetting.get().trim().length === 0;
    return false;
  },
  description: global.isIOS
    ? "Motor de voz a texto. ElevenLabs, OpenAI y Soniox son servicios en la nube que necesitan una clave API (Ajustes > Claves API) y reconocen bastante mejor que la opción local. Servidor Whisper es tu propio Whisper compatible con OpenAI (indica su URL abajo). En el dispositivo usa el idioma de dictado del iPhone y el audio no sale del teléfono."
    : "Para español, descarga Whisper base (rápido), small (mayor precisión) o medium (más espera) y selecciona el proveedor correspondiente. El audio se transcribe en el móvil; Hey Even sigue detectándose en el firmware antes de esta frase. Moonshine solo reconoce inglés. Los proveedores en la nube necesitan una clave API. Servidor Whisper es tu propio Whisper compatible con OpenAI (indica su URL abajo).",
});

const wakeWordActionLabels: Record<WakeWordAction, string> = {
  "voice-input": "Entrada de voz",
  off: "Ignorar",
  "turn-screen-on": "Encender pantalla",
};

export const wakeWordActionSetting = new ConfigSettingEnum<WakeWordAction>({
  id: "wake-word-action",
  label: "Acción al decir \"Hey Even\"",
  storageKey: "voice.wakeWordAction",
  defaultValue: "voice-input",
  values: ["voice-input", "off", "turn-screen-on"],
  formatValue: (value) => wakeWordActionLabels[value] ?? value,
  description: "Elige qué sucede al decir \"Hey Even\": iniciar la entrada de voz, encender la pantalla o no hacer nada.",
});

export const saveTranscribeAudioSetting = new ConfigSettingBoolean({
  id: "save-transcribe-audio",
  label: "Guardar audio de Transcribir",
  storageKey: "voice.saveTranscribeAudio",
  defaultValue: true,
  description: "Graba el audio de cada sesión de Transcribir como WAV en Descargas (unos 2 MB por minuto), con el mismo nombre que su transcripción. Las grabaciones se conservan hasta que las borres.",
});

export const saveVoiceRecordingsSetting = new ConfigSettingBoolean({
  id: "save-voice-recordings",
  label: "Guardar grabaciones de voz",
  storageKey: "developer.saveVoiceRecordings",
  defaultValue: false,
  description: "Guarda una copia del audio en el móvil para investigar problemas de transcripción.",
});

export const assistantSkipConfirmationSetting = new ConfigSettingBoolean({
  id: "assistant-skip-confirmation",
  label: "Enviar al asistente sin confirmar",
  storageKey: "assistant.skipConfirmationAfterWakeword",
  defaultValue: false,
  description: "Envía la transcripción al asistente directamente tras la activación por voz, sin pedir confirmación.",
});

export type AssistantBackendKind = "direct" | "external";

const assistantBackendLabels: Record<AssistantBackendKind, string> = {
  direct: global.isIOS ? "API en la nube" : "Desde el móvil",
  external: "Agente externo (puente)",
};

export const assistantBackendSetting = new ConfigSettingEnum<AssistantBackendKind>({
  id: "assistant-backend",
  label: "Proveedor del asistente",
  storageKey: "assistant.backend",
  defaultValue: "direct",
  values: global.isIOS ? ["direct"] : ["direct", "external"],
  formatValue: (value) => assistantBackendLabels[value] ?? value,
  description:
    global.isIOS ? "An LLM called from the phone: a cloud model with your OpenAI or Anthropic API key (Settings > API Keys) or your configured OpenAI-compatible API, or Apple Intelligence's on-device model." : "Who answers assistant queries: an LLM called from the phone (a cloud API with your key, or the downloaded on-phone model), or your own long-running agent (e.g. OpenClaw) reached through the faceclaw-agent-bridge plugin.",
});

export const assistantHermesUrlSetting = new ConfigSettingString({
  id: "assistant-hermes-url",
  label: "URL de Hermes",
  storageKey: "assistant.hermesUrl",
  defaultValue: "",
  editorTitle: "Servidor API de Hermes (p. ej. http://host:8642/v1)",
  glassesEditTitle: "Editar URL de Hermes",
  formatValue: (value) => value || "(sin configurar)",
  description: "Dirección del servidor API del gateway de Hermes Agent; se usa cuando el modelo del asistente es Agente Hermes. Independiente del puente Faceclaw-Hermes.",
});

export const assistantHermesKeySetting = new ConfigSettingString({
  id: "assistant-hermes-key",
  label: "Clave de Hermes",
  storageKey: "assistant.hermesKey",
  defaultValue: "",
  editorTitle: "Clave del servidor API de Hermes",
  glassesEditTitle: "Editar clave de Hermes",
  formatValue: (value) => (value ? `${value.slice(0, 6)}...` : "(sin configurar)"),
  description: "Clave del servidor API (API_SERVER_KEY en el .env de Hermes).",
});

export const assistantBridgeHostSetting = new ConfigSettingString({
  id: "assistant-bridge-host",
  label: "Servidor de OpenClaw",
  storageKey: "assistant.bridgeHost",
  defaultValue: "",
  editorTitle: "Servidor de OpenClaw (IP de Tailscale)",
  glassesEditTitle: "Editar servidor",
  description:
    "Nombre o dirección IP del servidor que ejecuta el puente de OpenClaw (por ejemplo, una IP de Tailscale).",
});

export const assistantBridgePortSetting = new ConfigSettingString({
  id: "assistant-bridge-port",
  label: "Puerto de OpenClaw",
  storageKey: "assistant.bridgePort",
  defaultValue: "8790",
  editorTitle: "Puerto de OpenClaw",
  glassesEditTitle: "Editar puerto",
  description: "Puerto TCP del puente de OpenClaw. El valor predeterminado es 8790.",
});

export const assistantBridgeTokenSetting = new ConfigSettingString({
  id: "assistant-bridge-token",
  label: "Token de OpenClaw",
  storageKey: "assistant.bridgeToken",
  defaultValue: "",
  editorTitle: "Token de OpenClaw",
  glassesEditTitle: "Editar token",
  formatValue: (value) => (value ? `${value.slice(0, 6)}...` : "(sin configurar)"),
  description: "Token secreto que debe coincidir con el configurado en el puente de OpenClaw.",
});

export const assistantAllowProactiveSetting = new ConfigSettingBoolean({
  id: "assistant-allow-proactive",
  label: "Permitir acciones proactivas del agente",
  storageKey: "assistant.allowProactive",
  defaultValue: true,
  description:
    "Let the external agent use glasses tools outside of a conversation, e.g. showing an alert when a long-running job finishes. Rate-limited; only tools marked proactive-safe are allowed.",
});

export const assistantOpenAiCompatibleUrlSetting = new ConfigSettingString({
  id: "assistant-openai-compatible-url",
  label: "Compatible API URL",
  storageKey: "assistant.openAiCompatibleUrl",
  defaultValue: "",
  editorTitle: "OpenAI-compatible API root",
  glassesEditTitle: "Edit compatible API URL",
  formatValue: (value) => value || "(not set)",
  validate: (value) => (!value.trim() || normalizeOpenAiCompatibleUrl(value) ? null : "Enter an http:// or https:// API root."),
  description: "Explicit API root for the OpenAI-compatible Chat Completions assistant. Venice: https://api.venice.ai/api/v1. Open WebUI: https://your-host/api. The provider's path is not guessed.",
});

export const assistantOpenAiCompatibleKeySetting = new ConfigSettingString({
  id: "assistant-openai-compatible-key",
  label: "Compatible API key",
  storageKey: "assistant.openAiCompatibleKey",
  defaultValue: "",
  editorTitle: "OpenAI-compatible API key (optional)",
  glassesEditTitle: "Edit compatible API key",
  formatValue: (value) => (value ? `${value.slice(0, 6)}...` : "(none)"),
  description: "Bearer key sent only to the compatible assistant URL above. Optional for private servers that do not require authentication.",
});

export const assistantOpenAiCompatibleModelSetting = new ConfigSettingString({
  id: "assistant-openai-compatible-model",
  label: "Compatible model ID",
  storageKey: "assistant.openAiCompatibleModel",
  defaultValue: "",
  editorTitle: "OpenAI-compatible model ID",
  glassesEditTitle: "Edit compatible model ID",
  formatValue: (value) => value || "(not set)",
  description: "Exact model ID sent to the compatible provider. For glasses tools, choose a model that supports function calling.",
});

export const veniceWebSearchSetting = new ConfigSettingBoolean({
  id: "venice-web-search",
  label: "Venice web search",
  storageKey: "assistant.veniceWebSearch",
  defaultValue: false,
  description: "Allow supported Venice models to search the web for current information. Shown only when OpenAI-compatible is the assistant model and its URL is the official Venice API. Search queries are processed by Venice's search service and may incur additional charges.",
});

export const elevenLabsApiKeySetting = new ConfigSettingString({
  id: "elevenlabs-api-key",
  label: "ElevenLabs key",
  storageKey: "voice.elevenLabsApiKey",
  defaultValue: "",
  editorTitle: "ElevenLabs API key",
  glassesEditTitle: "Edit ElevenLabs key",
  formatValue: (value) => (value ? `${value.slice(0, 6)}...` : "(sin configurar)"),
  description: "ElevenLabs API key, used when ElevenLabs is the transcription provider. The key needs the speech-to-text permission.",
});

export const openAiApiKeySetting = new ConfigSettingString({
  id: "openai-api-key",
  label: "OpenAI key",
  storageKey: "voice.openAiApiKey",
  defaultValue: "",
  editorTitle: "OpenAI API key",
  glassesEditTitle: "Edit OpenAI key",
  formatValue: (value) => (value ? `${value.slice(0, 6)}...` : "(sin configurar)"),
  description: "OpenAI API key, used when Whisper is the transcription provider or an OpenAI model is selected for the voice assistant.",
});

export const sonioxApiKeySetting = new ConfigSettingString({
  id: "soniox-api-key",
  label: "Soniox key",
  storageKey: "voice.sonioxApiKey",
  defaultValue: "",
  editorTitle: "Soniox API key",
  glassesEditTitle: "Edit Soniox key",
  formatValue: (value) => (value ? `${value.slice(0, 6)}...` : "(sin configurar)"),
  description: "Soniox API key, used when Soniox is the transcription provider.",
});

export const whisperServerUrlSetting = new ConfigSettingString({
  id: "whisper-server-url",
  label: "URL del servidor Whisper",
  storageKey: "voice.whisperServerUrl",
  defaultValue: "",
  editorTitle: "URL del servidor Whisper (p. ej. http://100.x.y.z:8004/v1)",
  glassesEditTitle: "Editar URL del servidor Whisper",
  formatValue: (value) => value || "(sin configurar)",
  validate: (value) => (!value.trim() || normalizeWhisperServerUrl(value) ? null : "Introduce una dirección http:// o https://."),
  description:
    "Raíz de la API de un servidor Whisper compatible con OpenAI (vLLM, speaches, LocalAI...); se usa cuando el proveedor de voz es Servidor Whisper. En iOS una dirección http sin cifrar también debe permitirse en las excepciones App Transport Security de la app.",
});

export const whisperServerModelSetting = new ConfigSettingString({
  id: "whisper-server-model",
  label: "Modelo del servidor Whisper",
  storageKey: "voice.whisperServerModel",
  defaultValue: "",
  editorTitle: "Id del modelo Whisper (vacío: el primero del servidor)",
  glassesEditTitle: "Editar modelo Whisper",
  formatValue: (value) => value || "(el del servidor)",
  description: "Id del modelo que se envía al servidor Whisper. Déjalo vacío para usar el primero que liste el servidor.",
});

export const whisperServerLanguageSetting = new ConfigSettingString({
  id: "whisper-server-language",
  label: "Idioma de Whisper",
  storageKey: "voice.whisperServerLanguage",
  defaultValue: "",
  editorTitle: "Código de idioma, p. ej. es o en (vacío: automático)",
  glassesEditTitle: "Editar idioma de Whisper",
  formatValue: (value) => value || "Automático",
  validate: (value) => (!value.trim() || /^[a-z]{2,3}$/i.test(value.trim()) ? null : "Usa un código de idioma como es, en o ca."),
  description:
    "Idioma hablado para el servidor Whisper. Déjalo vacío para detectarlo; un idioma fijo equivocado hace que Whisper traduzca a ese idioma en lugar de transcribir.",
});

export const whisperServerApiKeySetting = new ConfigSettingString({
  id: "whisper-server-api-key",
  label: "Clave del servidor Whisper",
  storageKey: "voice.whisperServerApiKey",
  defaultValue: "",
  editorTitle: "Clave API del servidor Whisper (opcional)",
  glassesEditTitle: "Editar clave del servidor Whisper",
  formatValue: (value) => (value ? `${value.slice(0, 6)}...` : "(ninguna)"),
  description: "Token Bearer del servidor Whisper, si lo pide.",
});

export const evenAsrUrlSetting = new ConfigSettingString({
  id: "even-asr-url",
  label: "Dirección EVO-X2",
  storageKey: "voice.evenAsrUrl",
  defaultValue: "ws://100.93.23.103:18770/v1/audio/transcriptions/realtime",
  editorTitle: "Dirección del servicio de voz del EVO-X2",
  glassesEditTitle: "Editar dirección EVO-X2",
  description: "WebSocket del servicio de reconocimiento del EVO-X2 (NeMo-Speech), accesible por Tailscale. Se usa cuando EVO-X2 es el proveedor de voz.",
});

export const evenAsrKeySetting = new ConfigSettingString({
  id: "even-asr-key",
  label: "Clave EVO-X2",
  storageKey: "voice.evenAsrKey",
  defaultValue: "",
  editorTitle: "Clave del servicio de voz del EVO-X2",
  glassesEditTitle: "Editar clave EVO-X2",
  formatValue: (value) => (value ? `${value.slice(0, 6)}...` : "(sin configurar)"),
  description: "Clave Bearer del servicio de voz del EVO-X2 (~/.config/even-asr/nemotron.env en even).",
});

export const anthropicApiKeySetting = new ConfigSettingString({
  id: "anthropic-api-key",
  label: "Anthropic key",
  storageKey: "llm.anthropicApiKey",
  defaultValue: "",
  editorTitle: "Anthropic API key",
  glassesEditTitle: "Edit Anthropic key",
  formatValue: (value) => (value ? `${value.slice(0, 6)}...` : "(sin configurar)"),
  description: "Anthropic API key, used when an Anthropic model is selected for the voice assistant.",
});

export const assistantModelSetting = new ConfigSettingEnum<AssistantModel>({
  id: "assistant-model",
  label: "Modelo del asistente",
  storageKey: "assistant.model",
  defaultValue: "auto",
  values: ASSISTANT_MODEL_CHOICES,
  formatValue: assistantModelLabel,
  isDisabled: (value) => {
    const provider = assistantModelProvider(value);
    if (provider === "anthropic") return anthropicApiKeySetting.get().trim().length === 0;
    if (provider === "openai") return openAiApiKeySetting.get().trim().length === 0;
    if (provider === "local") return !isLocalModelReady();
    // Hermes and OpenAI-compatible stay selectable before they're configured:
    // their rows only appear in Settings once one is the selected model.
    return false;
  },
  description:
    global.isIOS ? "Model used by the assistant. Auto prefers Terra with an OpenAI key, then Sonnet with an Anthropic key, then Apple Intelligence's on-device model; it never picks OpenAI-compatible or Hermes agent. Choosing either of those shows its settings below." : "Model used by the assistant. Auto prefers Terra when an OpenAI key is set, then Sonnet when an Anthropic key is set, then the downloaded on-phone model; it never picks OpenAI-compatible or Hermes agent. Choosing either of those shows its settings below.",
});

export const mapboxApiKeySetting = new ConfigSettingString({
  id: "mapbox-api-key",
  label: "Mapbox token",
  storageKey: "maps.mapboxApiKey",
  defaultValue: "",
  editorTitle: "Mapbox public token (pk.…)",
  glassesEditTitle: "Edit Mapbox token",
  formatValue: (value) => (value ? `${value.slice(0, 6)}...` : "(sin configurar)"),
  description: "Mapbox public token (pk. prefix), used by the Navigate app for maps, geocoding, and directions.",
});

/** Edited from the Music app's Spotify menu; a sign-in is tied to the client ID it was made with. */
export const spotifyClientIdSetting = new ConfigSettingString({
  id: "spotify-client-id",
  label: "Client ID",
  storageKey: SPOTIFY_CLIENT_ID_KEY,
  defaultValue: "",
  editorTitle: "Spotify client ID (from your app in the Spotify Developer Dashboard)",
  glassesEditTitle: "Edit Spotify client ID",
  normalize: (value) => (value ?? "").trim(),
  validate: (value) => (!value || isValidSpotifyClientId(value) ? null
    : "A Spotify client ID is 32 letters and digits, shown on your app's page in the Spotify Developer Dashboard."),
  formatValue: (value) => (value ? `${value.slice(0, 6)}...` : "(not set)"),
  description: "The client ID of your own Spotify developer app, which Faceclaw signs in with.",
});

/**
 * Staging buffer for the Terminal app's "Add connection" flow: the worker
 * asks the shell to open the phone text editor on this setting, the user
 * types the g2mirror:// connection string there, and the worker reads (and
 * clears) the draft when the user confirms on the glasses. Deliberately not
 * listed in the Settings app; connections are managed inside the Terminal app.
 */
export const terminalNewConnectionSetting = new ConfigSettingString({
  id: "terminal-new-connection",
  label: "Nueva conexión",
  storageKey: "terminal.newConnectionDraft",
  defaultValue: "",
  editorTitle: "g2mirror connection string (g2mirror://token@host)",
  glassesEditTitle: "Add connection",
  normalize: (value) => (value ?? "").replace(/[\x00-\x1f]+/g, "").trim(),
});

/**
 * Staging buffer for the T3 Code app's Pair-environment screen: the phone
 * text editor types the `t3 pair` link into it, and the app reads it back
 * when the user confirms on the glasses. Cleared after each attempt (the link
 * carries a one-time credential).
 */
export const t3codePairingLinkSetting = new ConfigSettingString({
  id: "t3code-pairing-link",
  label: "T3 Code pairing link",
  storageKey: "t3code.pairingDraft",
  defaultValue: "",
  editorTitle: "T3 Code pairing link (from `t3 pair`)",
  glassesEditTitle: "Pair T3 Code",
  normalize: (value) => (value ?? "").replace(/[\x00-\x1f]+/g, " ").trim(),
});

export const t3codeWakeOnAttentionSetting = new ConfigSettingBoolean({
  id: "t3code-wake-on-attention",
  label: "Wake when a thread needs you",
  storageKey: "t3code.wakeOnAttention",
  defaultValue: false,
  description:
    "When a T3 Code agent asks for approval or asks a question while the glasses are asleep, wake them and show the T3 Code thread list.",
});

/**
 * Staging buffer for the Developer app's "Load app from URL" flow: the app
 * opens the phone text editor on this setting, the user types (or scans, or
 * dictates) the URL, and the app reads it back when the load is confirmed on
 * the glasses. Kept across launches so a reload after an edit-and-rebuild only
 * takes a click. Deliberately not listed in the Settings app.
 */
export const developerAppUrlSetting = new ConfigSettingString({
  id: "developer-app-url",
  label: "URL de la app",
  storageKey: "developer.appUrl",
  defaultValue: "",
  editorTitle: "EvenHub app URL (http:// or https://)",
  glassesEditTitle: "Load app from URL",
  normalize: (value) => (value ?? "").replace(/[\x00-\x1f]+/g, "").trim(),
});

export const terminalLaunchPresetsSetting = new ConfigSettingString({
  id: "terminal-launch-presets",
  label: "Opciones de inicio",
  storageKey: "terminal.launchPresets",
  defaultValue: "shell",
  editorTitle: "g2mirror launch presets (comma-separated)",
  glassesEditTitle: "Edit launch presets",
  description:
    "Comma-separated names of g2mirror launch presets that can be started from the glasses. Presets are defined in the server's config; the wire protocol has no way to list them, so name them here. The default server config defines \"shell\".",
});

export const terminalAutoReconnectSetting = new ConfigSettingBoolean({
  id: "terminal-auto-reconnect",
  label: "Reconectar automáticamente",
  storageKey: "terminal.autoReconnect",
  defaultValue: true,
  description:
    "While at least one Terminal window is open, automatically reconnect to the g2mirror server when the connection drops, retrying with backoff until it succeeds.",
});

export const terminalWakeOnBellSetting = new ConfigSettingBoolean({
  id: "terminal-wake-on-bell",
  label: "Encender gafas con aviso del terminal",
  storageKey: "terminal.wakeOnBell",
  defaultValue: false,
  description:
    "When a terminal rings its bell while the glasses are asleep, wake them and focus that terminal's window (or the terminals list if it has no window open).",
});

export const roamGraphNameSetting = new ConfigSettingString({
  id: "roam-graph-name",
  label: "Nombre del grafo de Roam",
  storageKey: "integrations.roam.graphName",
  defaultValue: "",
  editorTitle: "Nombre del grafo de Roam",
  glassesEditTitle: "Edit Roam graph",
  normalize: (value) => (value ?? "").replace(/[\x00-\x1f]+/g, "").trim(),
  formatValue: emptySettingDisplay,
  description: "Name of the Roam Research graph the Roam app reads and writes (as shown in Roam's graph switcher).",
});

export const roamApiTokenSetting = new ConfigSettingString({
  id: "roam-api-token",
  label: "Token API de Roam",
  storageKey: "integrations.roam.apiToken",
  defaultValue: "",
  editorTitle: "Roam API token (roam-graph-token-...)",
  glassesEditTitle: "Edit Roam token",
  normalize: (value) => (value ?? "").replace(/[\x00-\x1f]+/g, "").trim(),
  formatValue: maskToken,
  description: "API token for the graph, created in Roam under Settings > Graph > API tokens. Needs edit access for checking off todos.",
});

export const nightscoutSiteUrlSetting = new ConfigSettingString({
  id: "nightscout-site-url",
  label: "URL de Nightscout",
  storageKey: "integrations.nightscout.siteUrl",
  defaultValue: "",
  editorTitle: "URL de Nightscout",
  glassesEditTitle: "Edit Nightscout URL",
  normalize: normalizeNightscoutSiteUrl,
  formatValue: emptySettingDisplay,
  description: "Base URL of a Nightscout site to fetch glucose readings from, for the dashboard's glucose card.",
});

export const nightscoutApiTokenSetting = new ConfigSettingString({
  id: "nightscout-api-token",
  label: "Token API de Nightscout",
  storageKey: "integrations.nightscout.apiToken",
  defaultValue: "",
  editorTitle: "Token API de Nightscout",
  glassesEditTitle: "Edit API token",
  normalize: normalizeNightscoutApiToken,
  formatValue: maskToken,
  description: "Access token for the Nightscout site's API.",
});

function nightscoutThresholdSetting(id: string, label: string, unit: string, description: string): ConfigSettingString {
  return new ConfigSettingString({
    id: `nightscout-${id}`,
    label,
    storageKey: `integrations.nightscout.${id}`,
    defaultValue: "0",
    editorTitle: `${label} (${unit}; 0 = off)`,
    normalize: normalizeNightscoutThreshold,
    formatValue: (value) => Number(value) > 0 ? `${value} ${unit}` : "Off",
    description: `${description} Enter 0 to disable.`,
  });
}

export const nightscoutMaxCannulaAgeSetting = nightscoutThresholdSetting(
  "max-cannula-age-hours", "Max cannula age", "h", "Warn when time since the last site change exceeds this many hours.",
);
export const nightscoutCartridgeLowSetting = nightscoutThresholdSetting(
  "cartridge-low-units", "Cartridge low threshold", "U", "Warn when the pump reservoir falls below this many units.",
);
export const nightscoutBatteryLowSetting = nightscoutThresholdSetting(
  "battery-low-voltage", "Battery voltage threshold", "V", "Warn when pump battery voltage falls below this value.",
);
export const nightscoutMaxLoopAgeSetting = nightscoutThresholdSetting(
  "max-loop-age-minutes", "Max time since last loop", "min", "Warn when time since the last loop exceeds this many minutes.",
);
export const nightscoutAlwaysShowInTopBarSetting = new ConfigSettingBoolean({
  id: "nightscout-always-show-in-top-bar",
  label: "Mostrar siempre en la barra de estado",
  storageKey: "integrations.nightscout.alwaysShowInTopBar",
  defaultValue: false,
  description: "Keep the Nightscout glucose graph and warnings in the top bar even when all Nightscout windows are closed.",
});
export const nightscoutMissedBolusAlertsSetting = new ConfigSettingBoolean({
  id: "nightscout-missed-bolus-alerts",
  label: "Avisos de bolo olvidado",
  storageKey: "integrations.nightscout.missedBolusAlerts",
  defaultValue: false,
  description: "Muestra un aviso en las gafas cuando la glucosa sube como tras una comida sin bolo ni hidratos registrados. Experimental.",
});
export const nightscoutMissedBolusCooldownSetting = new ConfigSettingString({
  id: "nightscout-missed-bolus-cooldown-minutes",
  label: "Pausa entre avisos de bolo olvidado",
  storageKey: "integrations.nightscout.missedBolusCooldownMinutes",
  defaultValue: "120",
  editorTitle: "Pausa entre avisos de bolo olvidado (min)",
  normalize: normalizeNightscoutThreshold,
  formatValue: (value) => `${value} min`,
  description: "Tras un aviso de bolo olvidado, espera al menos estos minutos antes de mostrar otro.",
});

export function loadNightscoutThresholds(): NightscoutThresholds {
  return {
    maxCannulaAgeHours: Number(nightscoutMaxCannulaAgeSetting.get()),
    cartridgeLowUnits: Number(nightscoutCartridgeLowSetting.get()),
    batteryLowVoltage: Number(nightscoutBatteryLowSetting.get()),
    maxLoopAgeMinutes: Number(nightscoutMaxLoopAgeSetting.get()),
  };
}

// ---------------------------------------------------------------------------
// Navigate app: saved and recent destinations.

const stripControlChars = (value: string | null | undefined): string =>
  (value ?? "").replace(/[\x00-\x1f]+/g, "").trim();

export const navigateHomeAddressSetting = new ConfigSettingString({
  id: "navigate-home-address",
  label: "Dirección de casa",
  storageKey: "navigate.homeAddress",
  defaultValue: "",
  editorTitle: "Dirección de casa",
  glassesEditTitle: "Set Home address",
  normalize: stripControlChars,
  formatValue: emptySettingDisplay,
  description: "Address (or place name) the Navigate app's Home destination routes to.",
});

export const navigateWorkAddressSetting = new ConfigSettingString({
  id: "navigate-work-address",
  label: "Dirección del trabajo",
  storageKey: "navigate.workAddress",
  defaultValue: "",
  editorTitle: "Dirección del trabajo",
  glassesEditTitle: "Set Work address",
  normalize: stripControlChars,
  formatValue: emptySettingDisplay,
  description: "Address (or place name) the Navigate app's Work destination routes to.",
});

export const navigateRememberRecentSetting = new ConfigSettingBoolean({
  id: "navigate-remember-recent",
  label: "Recordar destinos recientes",
  storageKey: "navigate.rememberRecent",
  defaultValue: true,
  description:
    "Keep a short list of places you have navigated to, offered as destinations on the Navigate app's start page. Turning this off clears the list.",
});

/**
 * Custom named destinations beyond Home and Work, as a JSON array of
 * {id, name, address}. Managed inside the Navigate app (its context menu),
 * not listed in the Settings app.
 */
export const navigateSavedDestinationsSetting = new ConfigSettingString({
  id: "navigate-saved-destinations",
  label: "Destinos guardados",
  storageKey: "navigate.savedDestinations",
  defaultValue: "[]",
});

/**
 * Recently navigated-to places, as a JSON array of {name, place, longitude,
 * latitude, atMs}, most recent first. Written by the Navigate app when
 * navigateRememberRecentSetting is on.
 */
export const navigateRecentDestinationsSetting = new ConfigSettingString({
  id: "navigate-recent-destinations",
  label: "Destinos recientes",
  storageKey: "navigate.recentDestinations",
  defaultValue: "[]",
});

/**
 * Staging buffers for the Navigate app's add/edit-destination flow: the
 * worker asks the shell to open the phone text editor on one of these, the
 * user types (or dictates) the name/address, and the worker reads the draft
 * when the user confirms on the glasses. Deliberately not listed in the
 * Settings app.
 */
export const navigateDestinationNameDraftSetting = new ConfigSettingString({
  id: "navigate-destination-name-draft",
  label: "Nombre del destino",
  storageKey: "navigate.destinationNameDraft",
  defaultValue: "",
  editorTitle: "Destination name (e.g. Gym)",
  glassesEditTitle: "Nombre del destino",
  normalize: stripControlChars,
});

export const navigateDestinationAddressDraftSetting = new ConfigSettingString({
  id: "navigate-destination-address-draft",
  label: "Dirección del destino",
  storageKey: "navigate.destinationAddressDraft",
  defaultValue: "",
  editorTitle: "Destination address or place name",
  glassesEditTitle: "Dirección del destino",
  normalize: stripControlChars,
});


export function screenTimeoutSettingToMs(value: ScreenTimeoutSetting): number | null {
  switch (value) {
    case "15s":
      return 15_000;
    case "30s":
      return 30_000;
    case "1m":
      return 60_000;
    case "3m":
      return 180_000;
    case "never":
      return null;
  }
}

/** How long an untouched new-notification popup stays up; null keeps it until dismissed (and for "off", which never opens one). */
export function newNotificationDisplayTimeoutMs(value: NewNotificationDisplay): number | null {
  switch (value) {
    case "5s":
      return 5_000;
    case "15s":
      return 15_000;
    case "1m":
      return 60_000;
    case "off":
    case "until-dismissed":
      return null;
  }
}

export function newNotificationDisplayLabel(value: NewNotificationDisplay): string {
  switch (value) {
    case "off":
      return "Off";
    case "until-dismissed":
      return "Until dismissed";
    case "1m":
      return "1min";
    default:
      return value;
  }
}

export function brightnessLabel(value: BrightnessSetting): string {
  return value === "auto" ? "Automático" : value;
}

/** The exact level for the wire, or null when the ambient sensor drives it. */
export function brightnessSettingToLevel(value: BrightnessSetting): number | null {
  return value === "auto" ? null : Number(value);
}

export function screenTimeoutLabel(value: ScreenTimeoutSetting): string {
  return value === "never" ? "Never" : value;
}

export function batteryDisplayModeLabel(value: BatteryDisplayMode): string {
  if (value === "percentage") return "Percentage";
  if (value === "stacked") return "Stacked";
  if (value === "stacked-percentage") return "Stacked percentage";
  if (value === "dense") return "Dense";
  return "Icon";
}

export function batteryIndicatorVisibilityLabel(value: BatteryIndicatorVisibility): string {
  if (value === "never") return "Never";
  if (value === "low") return `Below ${BATTERY_LOW_VISIBILITY_THRESHOLD}%`;
  return "Always";
}

export function timeFormatLabel(value: TimeFormat): string {
  return value === "12h" ? "12-hour" : "24-hour";
}

export function loadNightscoutSettings(): NightscoutSettings {
  return {
    siteUrl: nightscoutSiteUrlSetting.get(),
    apiToken: nightscoutApiTokenSetting.get(),
  };
}

export function isNightscoutSettingsConfigured(): boolean {
  return nightscoutSiteUrlSetting.get().length > 0 && nightscoutApiTokenSetting.get().length > 0;
}


function normalizeNightscoutSiteUrl(siteUrl: string | null | undefined): string {
  return (siteUrl ?? "").replace(/[\x00-\x1f]+/g, "").trim().replace(/\/+$/, "");
}

function normalizeNightscoutApiToken(apiToken: string | null | undefined): string {
  return (apiToken ?? "").replace(/[\x00-\x1f]+/g, "").trim();
}

function emptySettingDisplay(value: string): string {
  return value || "(empty)";
}

function maskToken(token: string): string {
  if (!token) return "(empty)";
  return token.length <= 6 ? "******" : `${token.slice(0, 2)}...${token.slice(-4)}`;
}


type SettingsMenuOptions<T> = {
  onChange?: (ctx: LayerContext, newValue: T, oldValue: T) => void
  /** Row label in place of the setting's own (for a setting shown in more than one menu). */
  label?: string
}

export function enumSettingMenuItem<TValue extends string, TId extends string = string>(
  setting: ConfigSettingEnum<TValue, TId>,
  opts?: SettingsMenuOptions<TValue>
): MenuItem {
  const label = opts?.label ?? setting.label;
  return {
    label,
    description: setting.description,
    onSelect: (ctx) => {
      const current = setting.get();
      const items = setting.values.map((value): MenuItem => ({
        label: setting.displayValue(value),
        disabled: () => setting.isDisabled(value),
        onSelect: () => {
          const oldValue = setting.get();
          setting.set(value);
          opts?.onChange?.(ctx, value, oldValue);
          ctx.stack.pop();
        },
        render: ({ image, x, y, disabled }) => {
          const selected = setting.get() === value ? " *" : "";
          image.drawText(
            getDefaultSmallFont(),
            x,
            y + LIST_ROW_TEXT_INSET,
            `${setting.displayValue(value)}${selected}`,
            disabled ? 70 : 200,
          );
        },
      }));
      openModalMenu(ctx, label, items, Math.max(0, setting.values.indexOf(current)));
    },
    render: ({ image, x, y, width }) => {
      drawRightValueMenuItem(image, getDefaultSmallFont(), x, y, width, label, setting.displayValue(setting.get()));
    },
  };
}

export function toggleSettingMenuItem<TId extends string = string>(
  setting: ConfigSettingBoolean<TId>,
   opts?: SettingsMenuOptions<boolean>
): MenuItem {
  const label = opts?.label ?? setting.label;
  return {
    label,
    description: setting.description,
    onSelect: (ctx) => {
      setting.set(!setting.get());
      opts?.onChange?.(ctx, setting.get(), !setting.get());
    },
    render: ({ image, x, y, width, selected }) => {
      drawToggleMenuItem(image, getDefaultSmallFont(), x, y, width, label, setting.get(), selected);
    },
  };
}

export function textSettingMenuItem<TId extends string = string>(
  setting: ConfigSettingString<TId>,
): MenuItem {
  return {
    label: setting.label,
    description: setting.description,
    onSelect: (ctx: LayerContext) => {
      void ctx.actions.startTextSettingEdit(setting);
      ctx.stack.push(new EditTextSettingLayer(setting));
    },
    render: ({ image, x, y, width }) => {
      // displayValue honors the setting's formatValue, so secrets (API keys,
      // tokens) can mask themselves instead of rendering in the clear.
      drawRightValueMenuItem(image, getDefaultSmallFont(), x, y, width, setting.label, truncateSetting(setting.displayValue()));
    }
  };
}

function truncateSetting(value: string, maxLength = 22): string {
  const text = value || "(empty)";
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

export class EditTextSettingLayer implements Layer {
  constructor(private readonly setting: ConfigSettingString) {}

  paint(ctx: LayerContext): GrayImage {
    const font = getDefaultSmallFont();
    // Sized to the hosting stack (full lens in the dashboard window, app
    // viewport in the settings app).
    const { width, height } = ctx.stack.getBaseSize();
    const image = new GrayImage(width, height, 0);
    const step = lineStep(font);
    image.drawText(font, 22, 16, this.setting.glassesEditTitle, 220);
    const messageTop = 24 + 2 * font.lineHeight;
    const message = wrapText(font, "Look at the phone app to type a value.", width - 48);
    for (let index = 0; index < message.length; index++) {
      image.drawText(font, 22, messageTop + index * step, message[index]!, 200);
    }
    const valueY = messageTop + (message.length + 2) * step;
    image.drawText(font, 22, valueY, truncateSetting(this.setting.get(), 52), 220);
    const error = this.setting.validationError();
    const errorLines = error ? wrapText(font, error, width - 48) : [];
    errorLines.forEach((line, index) =>
      image.drawText(font, 22, messageTop + (message.length + 4 + index) * step, line, 180));
    // The back hint at the bottom, unless a short window (the RayNeo iO's)
    // leaves it no room under the value and error.
    const contentBottom = errorLines.length ? messageTop + (message.length + 4 + errorLines.length) * step : valueY + step;
    const hintY = height - 24 - font.lineHeight;
    if (hintY >= contentBottom) image.drawText(font, 22, hintY, `${GESTURE_DOUBLE_CLICK} back`, 110);
    return image;
  }

  handleInput(event: InputEvent, ctx: LayerContext): void {
    if (event.type === "double-click") {
      void ctx.actions.endTextSettingEdit();
      ctx.stack.pop();
    }
  }
}
