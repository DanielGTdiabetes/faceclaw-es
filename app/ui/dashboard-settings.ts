import { normalizeNightscoutThreshold, type NightscoutThresholds } from "../apps/nightscout/nightscout-alerts";
import { GESTURE_DOUBLE_CLICK, InputEvent } from "./gestures";
import { DEFAULT_BRIGHTNESS_CURVE, normalizeBrightnessCurve, brightnessCurveError } from "../g2/brightness-curve";
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
import { isLocalModelReady } from "../native/llama";
import { drawRightValueMenuItem, drawToggleMenuItem, MenuItem, openModalMenu } from "./menu";
import { MENU_ANIMATION_KEY } from "./menu-animation-pref";
import { LIST_ROW_TEXT_INSET, lineStep } from "./metrics";
import { Layer, type LayerContext } from "./layers";
import { GrayImage } from "~/graphics/image";

export type NightscoutSettings = {
  siteUrl: string;
  apiToken: string;
};
export type BatteryDisplayMode = "icon" | "percentage" | "stacked" | "stacked-percentage";
/** When a top-bar battery indicator is shown: always, only below 50%, or never. */
export type BatteryIndicatorVisibility = "always" | "low" | "never";
export type TimeFormat = "24h" | "12h";
export type ScreenTimeoutSetting = "15s" | "30s" | "1m" | "3m" | "never";
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
};

export class ConfigSettingEnum<TValue extends string, TId extends string = string> extends ConfigSetting<TValue, TId> {
  readonly values: readonly TValue[];
  private readonly normalizer: (value: string | null | undefined) => TValue;
  private readonly disabledPredicate: (value: TValue) => boolean;

  constructor(options: ConfigSettingEnumOptions<TValue, TId>) {
    super(options);
    this.values = options.values;
    this.disabledPredicate = options.isDisabled ?? (() => false);
    if (options.normalize) {
      this.normalizer = (value: string | null | undefined) => {
        const normalized = options.normalize(value) as TValue|undefined;
        if (normalized === undefined) return this.defaultValue;
        return normalized;
      }
    } else {
      this.normalizer = (value) => this.values.includes(value as TValue) ? value as TValue : this.defaultValue;
    }
  }

  get(): TValue {
    return this.normalizer(getStringSetting(this.storageKey, this.defaultValue));
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

  constructor(options: ConfigSettingStringOptions<TId>) {
    super(options);
    this.editorTitle = options.editorTitle ?? options.label;
    this.glassesEditTitle = options.glassesEditTitle ?? `Edit ${options.label}`;
    this.inputKind = options.inputKind ?? "text";
    this.normalizer = options.normalize ?? ((value) => value ?? "");
    this.validator = options.validate;
    stringSettingsById.set(this.id, this);
  }

  get(): string {
    return this.normalizer(getStringSetting(this.storageKey, this.defaultValue));
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
    const saved = this.normalizer(getStringSetting(this.storageKey + ".valid", this.defaultValue));
    return this.validationError(saved) ? this.defaultValue : saved;
  }
}


export const batteryDisplayModeSetting = new ConfigSettingEnum<BatteryDisplayMode>({
  id: "batteryDisplayMode",
  label: "Estilo",
  storageKey: "dashboard.systemCard.batteryDisplayMode",
  defaultValue: "stacked",
  values: ["icon", "percentage", "stacked", "stacked-percentage"],
  formatValue: batteryDisplayModeLabel,
  description: "How the top bar shows battery levels: a gauge icon or exact percentage beside the label, or a compact gauge or percentage with the label stacked above it.",
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
  "glassesBatteryVisibility", "G2", "display.battery.glassesVisibility",
);
export const ringBatteryVisibilitySetting = batteryVisibilitySetting(
  "ringBatteryVisibility", "R1", "display.battery.ringVisibility",
);
/** The Wear OS watch; the indicator only exists while a watch is reachable. */
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

export const timeFormatSetting = new ConfigSettingEnum<TimeFormat>({
  id: "timeFormat",
  label: "Formato de hora",
  storageKey: "display.timeFormat",
  defaultValue: "24h",
  values: ["24h", "12h"],
  formatValue: timeFormatLabel,
  description: "Whether the top-bar clock shows 24-hour or 12-hour time.",
});

/**
 * How much of the 640x480 panel the UI uses. "576x288" is the stock band
 * (sidebar + a 288px-tall window at the vertical position); "576x480" keeps
 * the sidebar and gives every window the full height; "640x480" is the whole
 * panel, with the sidebar an overlay that shows only while it has focus.
 */
export const DISPLAY_MODE_VALUES = ["576x288", "576x480", "640x480"] as const;
export type DisplayModeSetting = (typeof DISPLAY_MODE_VALUES)[number];

const DISPLAY_MODE_LABELS: Record<DisplayModeSetting, string> = {
  "576x288": "Band · 576×288",
  "576x480": "Tall · 576×480",
  "640x480": "Full panel · 640×480",
};

export function displayModeLabel(value: DisplayModeSetting): string {
  return DISPLAY_MODE_LABELS[value] ?? value;
}

export const displayModeSetting = new ConfigSettingEnum<DisplayModeSetting>({
  id: "display-mode",
  label: "Modo de pantalla",
  storageKey: "display.mode",
  defaultValue: "576x288",
  values: DISPLAY_MODE_VALUES,
  formatValue: displayModeLabel,
  description:
    "Band: the stock 576×288 window beside the sidebar. Tall: the sidebar plus full-height windows. Full panel: the whole 640×480 display; the sidebar overlays the app only while you are in it. Open apps reopen in the new size.",
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
  description: "2–16 lux:percent pairs, separated by commas. Percent is within your minimum–maximum range. Start at 0:0, end at 100%, and increase lux without decreasing percent. Incomplete edits stay in the preview; brightness keeps using the last valid curve.",
});
const SCREEN_FADE_MS = 280;

export const menuAnimationSetting = new ConfigSettingBoolean({
  id: "menu-animation",
  label: "Animación de menús",
  storageKey: MENU_ANIMATION_KEY,
  defaultValue: true,
  description: "Slide the highlight, scroll, and bounce at the ends in menus, lists, and the launcher and Files icon grids. When off, they move instantly.",
});

export const screenFadeSetting = new ConfigSettingBoolean({
  id: "screen-fade",
  label: "Transición de pantalla",
  storageKey: "display.screenFade",
  defaultValue: true,
  description: "Fade the display in and out when the screen turns on or off. When off, it switches instantly.",
});

export function getBrightnessPreferences() {
  const level = brightnessSettingToLevel(brightnessSetting.get());
  return { auto: level === null, level: level ?? 50,
    minimum: Number(autoBrightnessMinSetting.get()), maximum: Number(autoBrightnessMaxSetting.get()),
    curve: autoBrightnessCurveSetting.getValidValue(), fadeMs: screenFadeSetting.get() ? SCREEN_FADE_MS : 0 };
}

export const screenTimeoutSetting = new ConfigSettingEnum<ScreenTimeoutSetting>({
  id: "screen-timeout",
  label: "Apagar pantalla tras",
  storageKey: "display.screenTimeout",
  defaultValue: "30s",
  values: ["15s", "30s", "1m", "3m", "never"],
  formatValue: screenTimeoutLabel,
  description: "How long the display stays on after the last input before turning itself off. \"Never\" keeps it on until turned off manually.",
});

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

// Wear OS watch remote (app/g2/wear-remote.ts, wear/). All three are read on
// every watch message, so a change applies immediately.
export const watchRemoteEnabledSetting = new ConfigSettingBoolean({
  id: "watch-remote-enabled",
  label: "Control desde el reloj",
  storageKey: "watch.remoteEnabled",
  defaultValue: true,
  description:
    "Accept input from the Faceclaw Wear OS app: spatial swipes, taps, holds, crown, voice queries and app commands. The ring's scheme is unaffected. Turn off to ignore the watch.",
});

export const watchCanUnlockSetting = new ConfigSettingBoolean({
  id: "watch-can-unlock",
  label: "Permitir desbloqueo desde el reloj",
  storageKey: "watch.canUnlock",
  defaultValue: true,
  description:
    "Let the watch unlock the glasses' lock screen (which otherwise waits for the phone to be unlocked). Your watch is on your wrist; turn this off if you would rather it stay a phone-only unlock.",
});

export const watchCrownClockwiseNextSetting = new ConfigSettingBoolean({
  id: "watch-crown-clockwise-next",
  label: "Corona en sentido horario = siguiente",
  storageKey: "watch.crownClockwiseNext",
  defaultValue: false,
  description:
    "Choose which crown direction moves to the next item. Off: clockwise moves to the previous item. On: clockwise moves to the next item.",
});

export const watchMirrorAssistantSetting = new ConfigSettingBoolean({
  id: "watch-mirror-assistant",
  label: "Mostrar asistente en el reloj",
  storageKey: "watch.mirrorAssistant",
  defaultValue: true,
  description: "Stream assistant replies and on-glasses alerts to the watch so they can be read from the wrist.",
});

export type VerticalPosition = "top" | "upper" | "middle" | "lower" | "bottom";

const VERTICAL_POSITION_LABELS: Record<VerticalPosition, string> = {
  top: "Top",
  upper: "Upper",
  middle: "Middle",
  lower: "Lower",
  bottom: "Bottom",
};

export const verticalPositionSetting = new ConfigSettingEnum<VerticalPosition>({
  id: "vertical-position",
  label: "Posición vertical",
  storageKey: "display.verticalPosition",
  defaultValue: "middle",
  values: ["top", "upper", "middle", "lower", "bottom"],
  formatValue: (value) => VERTICAL_POSITION_LABELS[value] ?? value,
  description:
    "Where standard (reduced-height) windows sit vertically within the display area, to position them within your field of view. Full-height windows use the whole screen. Navigate and Terminal can override these display settings.",
});

/** Per-app layouts can inherit the display preferences or choose their own size. */
export type AppDisplayMode = "default" | "global" | DisplayModeSetting;

function appDisplayModeSetting(appId: string, defaultValue: AppDisplayMode): ConfigSettingEnum<AppDisplayMode> {
  return new ConfigSettingEnum<AppDisplayMode>({
    id: `${appId}-display-mode`,
    label: "Modo de pantalla",
    storageKey: `${appId}.displayMode`,
    defaultValue,
    values: appId === "terminal" ? ["default", "global", ...DISPLAY_MODE_VALUES] : ["global", ...DISPLAY_MODE_VALUES],
    formatValue: (value) => value === "default" ? "Tall sessions (default)" : value === "global" ? "Use global" : displayModeLabel(value),
    description: appId === "terminal"
      ? "Screen size for Terminal. The default keeps session windows tall and the terminals list at the global size. Use global follows Display settings for all Terminal windows. Resizing an open session reconnects its view at the new size."
      : "Screen size for Navigate. Choose Band to leave more of your field of view clear, or Use global to follow Display settings. Applies to the current route too.",
  });
}

function appVerticalPositionSetting(appId: string): ConfigSettingEnum<"global" | VerticalPosition> {
  return new ConfigSettingEnum<"global" | VerticalPosition>({
    id: `${appId}-vertical-position`,
    label: "Posición vertical",
    storageKey: `${appId}.verticalPosition`,
    defaultValue: "global",
    values: ["global", "top", "upper", "middle", "lower", "bottom"],
    formatValue: (value) => value === "global" ? "Use global" : VERTICAL_POSITION_LABELS[value],
    description: "Where reduced-height windows for this app sit in your field of view. Use global follows Display settings. Full-height windows fill the display vertically.",
  });
}

export const navigateDisplayModeSetting = appDisplayModeSetting("navigate", "global");
export const navigateVerticalPositionSetting = appVerticalPositionSetting("navigate");
export const terminalDisplayModeSetting = appDisplayModeSetting("terminal", "default");
export const terminalVerticalPositionSetting = appVerticalPositionSetting("terminal");

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

export type RingConnectionMode = "glasses" | "direct";

export const ringConnectionModeSetting = new ConfigSettingEnum<RingConnectionMode>({
  id: "ring-connection-mode",
  label: "Conexión del anillo",
  storageKey: "developer.ringConnectionMode",
  defaultValue: "glasses",
  values: ["glasses", "direct"],
  formatValue: (value) => (value === "direct" ? "Directa" : "Solo a través de las gafas"),
  description:
    "How R1 ring input reaches the phone. Only via glasses: the ring's own link to the glasses carries its gestures, and the phone never opens a Bluetooth connection to the ring. Direct: also connect to the ring from the phone (currently unreliable). Takes effect on the next connection to the glasses.",
});

// "whisper" (no "onboard-" prefix) is OpenAI's CLOUD realtime model
// (gpt-realtime-whisper); "onboard-whisper" is the on-device sherpa-onnx
// Whisper backend. Same underlying model family, two different places it
// runs -- see the same note in native/voice-control.ts. The "whisper" value
// keeps its name (it's a persisted setting on real installs) but its label
// below now says "OpenAI" to tell the two apart in the picker.
export type VoiceProvider = "onboard" | "onboard-whisper" | "elevenlabs" | "whisper" | "soniox";

const voiceProviderLabels: Record<VoiceProvider, string> = {
  onboard: "Local (Moonshine, solo inglés)",
  "onboard-whisper": "Local (Whisper, español)",
  elevenlabs: "ElevenLabs",
  whisper: "OpenAI (Whisper)",
  soniox: "Soniox",
};

export const voiceProviderSetting = new ConfigSettingEnum<VoiceProvider>({
  id: "voice-provider",
  label: "Reconocimiento de voz",
  storageKey: "voice.provider",
  defaultValue: "onboard-whisper",
  values: ["onboard", "onboard-whisper", "elevenlabs", "whisper", "soniox"],
  formatValue: (value) => voiceProviderLabels[value] ?? value,
  isDisabled: (value) => {
    if (value === "elevenlabs") return elevenLabsApiKeySetting.get().trim().length === 0;
    if (value === "whisper") return openAiApiKeySetting.get().trim().length === 0;
    if (value === "soniox") return sonioxApiKeySetting.get().trim().length === 0;
    return false;
  },
  description: "Para español, selecciona Local (Whisper, español) y descarga el modelo multilingüe de abajo. El audio se transcribe en el móvil. Moonshine solo reconoce inglés. Los proveedores en la nube necesitan una clave API.",
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
  external: "OpenClaw (agente externo)",
};

export const assistantBackendSetting = new ConfigSettingEnum<AssistantBackendKind>({
  id: "assistant-backend",
  label: "Proveedor del asistente",
  storageKey: "assistant.backend",
  defaultValue: "direct",
  values: global.isIOS ? ["direct"] : ["direct", "external"],
  formatValue: (value) => assistantBackendLabels[value] ?? value,
  description:
    global.isIOS ? "Cloud models called with your OpenAI or Anthropic API key. Add your key in Settings > API Keys." : "Who answers assistant queries: an LLM called from the phone (a cloud API with your key, or the downloaded on-phone model), or your own long-running agent (e.g. OpenClaw) reached through the faceclaw-agent-bridge plugin.",
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
    return false;
  },
  description:
    global.isIOS ? "Model used by the voice assistant. Auto prefers Terra with an OpenAI key, then Sonnet with an Anthropic key." : "Model used by the voice assistant. Auto prefers Terra when an OpenAI key is set, then Sonnet when an Anthropic key is set, then the downloaded on-phone model.",
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
  label: "Mostrar siempre en la barra superior",
  storageKey: "integrations.nightscout.alwaysShowInTopBar",
  defaultValue: false,
  description: "Keep the Nightscout glucose graph and warnings in the top bar even when all Nightscout windows are closed.",
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
}

export function enumSettingMenuItem<TValue extends string, TId extends string = string>(
  setting: ConfigSettingEnum<TValue, TId>,
  opts?: SettingsMenuOptions<TValue>
): MenuItem {
  return {
    label: setting.label,
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
      openModalMenu(ctx, setting.label, items, Math.max(0, setting.values.indexOf(current)));
    },
    render: ({ image, x, y, width }) => {
      drawRightValueMenuItem(image, getDefaultSmallFont(), x, y, width, setting.label, setting.displayValue(setting.get()));
    },
  };
}

export function toggleSettingMenuItem<TId extends string = string>(
  setting: ConfigSettingBoolean<TId>,
   opts?: SettingsMenuOptions<boolean>
): MenuItem {
  return {
    label: setting.label,
    description: setting.description,
    onSelect: (ctx) => {
      setting.set(!setting.get());
      opts?.onChange?.(ctx, setting.get(), !setting.get());
    },
    render: ({ image, x, y, width, selected }) => {
      drawToggleMenuItem(image, getDefaultSmallFont(), x, y, width, setting.label, setting.get(), selected);
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
    image.drawText(font, 22, messageTop + (message.length + 2) * step, truncateSetting(this.setting.get(), 52), 220);
    const error = this.setting.validationError();
    if (error) wrapText(font, error, width - 48).forEach((line, index) =>
      image.drawText(font, 22, messageTop + (message.length + 4 + index) * step, line, 180));
    image.drawText(font, 22, height - 24 - font.lineHeight, `${GESTURE_DOUBLE_CLICK} back`, 110);
    return image;
  }

  handleInput(event: InputEvent, ctx: LayerContext): void {
    if (event.type === "double-click") {
      void ctx.actions.endTextSettingEdit();
      ctx.stack.pop();
    }
  }
}
