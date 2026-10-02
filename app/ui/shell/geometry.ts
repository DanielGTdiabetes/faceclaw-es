import { G2_LENS_HEIGHT, G2_LENS_WIDTH } from "../../graphics/image";
import {
  appSwitcherPositionSetting,
  type AppSwitcherPosition,
  displayModeSetting,
  type DisplayModeSetting,
  verticalPositionSetting,
  navigateDisplayModeSetting,
  navigateVerticalPositionSetting,
  terminalDisplayModeSetting,
  terminalVerticalPositionSetting,
  uiDepthSetting,
} from "../dashboard-settings";

/** Top bar: 24px notification icons plus a little padding. */
export const TOP_BAR_HEIGHT = 28;
/**
 * Width of the sidebar strip as painted (the app switcher on the left or
 * right edge). App windows get the other 576px — the surface width EvenHub
 * apps expect — and keep that width with the switcher at the bottom too,
 * except in the full-panel display mode, where the switcher overlays the
 * app (see sidebarWidth). Icon column layout within the strip (one wide
 * column vs. two narrow ones) is the chrome layer's business.
 */
export const SIDEBAR_WIDTH = 64;

/**
 * Height of the app switcher as a row under the window: one tall tab, the
 * same 36px (a 32px icon plus 2px either side) as a one-column sidebar slot.
 * The row is wide enough that it never needs the sidebar's smaller
 * two-column icons. It comes out of the height available to windows; their
 * width stays 576, centred, leaving SIDEBAR_WIDTH / 2 at each side: one
 * pixel for the side of the window's frame (windowFramed), the rest for the
 * whole display's stereo shift (uiDepth).
 */
export const SWITCHER_ROW_HEIGHT = 36;

/** Which edge the app switcher is on (Settings > Customization). */
export function switcherPosition(): AppSwitcherPosition {
  return appSwitcherPositionSetting.get();
}

/** The Display > Display mode setting (see dashboard-settings.ts). */
function appDisplayMode(appId?: string) {
  return appId === "navigate" ? navigateDisplayModeSetting.get()
    : appId === "terminal" ? terminalDisplayModeSetting.get() : "default";
}

export function displayMode(appId?: string): DisplayModeSetting {
  const mode = appDisplayMode(appId);
  return mode === "global" || mode === "default" ? displayModeSetting.get() : mode;
}

/** The full-panel mode: windows fill the panel; the switcher overlays them only while it has focus. */
function fullPanel(appId?: string): boolean {
  return displayMode(appId) === "640x480";
}

/**
 * How much of the screen's width the sidebar takes away from app windows:
 * the strip, or nothing when the switcher is a bottom row or in the
 * full-panel mode (where the chrome paints the strip over the window while
 * the sidebar has focus).
 */
export function sidebarWidth(appId?: string): number {
  return fullPanel(appId) || switcherPosition() === "bottom" ? 0 : SIDEBAR_WIDTH;
}

/**
 * How much of the screen's height a bottom switcher row takes away from app
 * windows: the row, or nothing beside a side strip or in the full-panel mode
 * (where the row overlays the window's bottom edge while it has focus).
 */
export function switcherRowHeight(appId?: string): number {
  return !fullPanel(appId) && switcherPosition() === "bottom" ? SWITCHER_ROW_HEIGHT : 0;
}

/**
 * Whether the switcher strip is on screen: always when it reserves room; in
 * the full-panel mode (where it overlays the window) only while it has focus.
 */
export function sidebarStripVisible(focus: "sidebar" | "window", appId?: string): boolean {
  return !fullPanel(appId) || focus === "sidebar";
}

/**
 * Screen rect of the switcher strip. A side strip aligns to the min-height
 * band (like the shell overlays). A bottom row sits right under the given
 * (foreground) window and spans its width, so a band shorter than the
 * screen has no gap below it; it moves when the foreground switches to a
 * window of another height, as the top bar does. In the full-panel mode the
 * row overlays the bottom edge of the screen.
 */
export function switcherRect(heightMode: WindowHeightMode, appId?: string): { x: number; y: number; width: number; height: number } {
  switch (switcherPosition()) {
    case "bottom":
      return {
        x: appViewportLeft(appId),
        y: switcherRowHeight(appId) > 0
          ? windowTop(heightMode, appId) + windowBandHeight(heightMode, appId)
          : G2_LENS_HEIGHT - SWITCHER_ROW_HEIGHT,
        width: appViewportWidth(appId),
        height: SWITCHER_ROW_HEIGHT,
      };
    case "right":
      return { x: G2_LENS_WIDTH - SIDEBAR_WIDTH, y: minWindowTop(appId), width: SIDEBAR_WIDTH, height: MIN_WINDOW_HEIGHT };
    default:
      return { x: 0, y: minWindowTop(appId), width: SIDEBAR_WIDTH, height: MIN_WINDOW_HEIGHT };
  }
}

/**
 * Whether the foreground window's content gets a rounded frame (drawn by
 * the chrome layer): with a reserved bottom switcher row, whose top edge is
 * the frame's bottom side, as the top bar's divider is its top. Its left and right sides take the pixel just outside
 * the 576-wide window; there's no room in the full-panel mode, nor need
 * beside a side strip.
 */
export function windowFramed(appId?: string): boolean {
  return switcherRowHeight(appId) > 0;
}

/**
 * Whether a screen point lies on the switcher's side of the screen, for
 * touches on the phone's mirror: anywhere in a side strip's column, or from
 * the top of a bottom row (under the given foreground window) down.
 */
export function isOnSwitcherEdge(x: number, y: number, heightMode: WindowHeightMode, appId?: string): boolean {
  switch (switcherPosition()) {
    case "bottom":
      return y >= switcherRect(heightMode, appId).y;
    case "right":
      return x >= G2_LENS_WIDTH - SIDEBAR_WIDTH;
    default:
      return x < SIDEBAR_WIDTH;
  }
}

/** Width of app windows: the panel's in the full-panel mode, else 576 (see SIDEBAR_WIDTH). */
function appViewportWidth(appId?: string): number {
  return fullPanel(appId) ? G2_LENS_WIDTH : G2_LENS_WIDTH - SIDEBAR_WIDTH;
}

/**
 * Left edge (x) of app windows: past a left strip, centred above a bottom
 * row (see SWITCHER_ROW_HEIGHT), else the screen edge.
 */
export function appViewportLeft(appId?: string): number {
  if (fullPanel(appId)) return 0;
  switch (switcherPosition()) {
    case "left":
      return SIDEBAR_WIDTH;
    case "bottom":
      return SIDEBAR_WIDTH / 2;
    default:
      return 0;
  }
}

/**
 * Stereo depth of the whole display (Settings > Customization > Depth), in
 * the firmware's depth units; the shell scene carries it to the compositor,
 * which shifts the screen and everything drawn over it per lens. Only with
 * the switcher at the bottom, where the windows' side margins, less the
 * window frame's pixel, leave room for the shift.
 */
export function uiDepth(): number {
  return switcherPosition() === "bottom" ? Number(uiDepthSetting.get()) : 0;
}

/**
 * Explicit app sizes (including Use global) replace the requested height.
 * The default keeps legacy per-window heights, such as tall terminal sessions.
 */
export function effectiveHeightMode(mode: WindowHeightMode, appId?: string): WindowHeightMode {
  return displayMode(appId) === "576x288" ? (appDisplayMode(appId) === "default" ? mode : "min") : "max";
}

/**
 * X of the display's true horizontal centre, in app-viewport coordinates. A
 * side strip pushes the viewport off centre, so UI the wearer physically
 * aims with — a compass rose, a calibration crosshair — has to offset by it
 * rather than use the viewport's own centre.
 */
export function screenCenterInViewportX(): number {
  return Math.round(G2_LENS_WIDTH / 2) - appViewportLeft();
}

/**
 * On the color-key shell surface, pixel value 0 is transparent; 1 is the
 * darkest opaque shade (identical to 0 after 4bpp quantization). Shell
 * painting must use this for intentional black.
 */
export const SHELL_OPAQUE_BLACK = 1;

/**
 * Windows come in three heights. "min" covers the same 288px band the stock
 * firmware uses, leaving most of the field of view clear; "medium" is one
 * top bar taller, so the content area below the bar is a full 288px (the
 * EvenHub app surface height); "max" uses the whole 480px screen (terminal
 * views), less a bottom switcher row. All include a top bar drawn by the
 * shell at the window's top edge.
 */
export type WindowHeightMode = "min" | "medium" | "max";

/** Total height (top bar + content) of a min-height window. */
export const MIN_WINDOW_HEIGHT = 288;

/**
 * Height of the screen area windows are placed in: the whole screen, less
 * a bottom switcher row's height.
 */
function windowAreaHeight(appId?: string): number {
  return G2_LENS_HEIGHT - switcherRowHeight(appId);
}

/** Total height (top bar + content) of a window's band in the given mode. */
export function windowBandHeight(mode: WindowHeightMode, appId?: string): number {
  switch (effectiveHeightMode(mode, appId)) {
    case "max":
      return windowAreaHeight(appId);
    case "medium":
      return MIN_WINDOW_HEIGHT + TOP_BAR_HEIGHT;
    default:
      return MIN_WINDOW_HEIGHT;
  }
}

/**
 * Fraction of the slack above a window band, from the Display > Vertical
 * position setting: each band height distributes its own free space by the
 * same fraction, so all heights sit consistently within the screen.
 */
function verticalPositionFraction(appId?: string): number {
  const position = appId === "navigate" ? navigateVerticalPositionSetting.get()
    : appId === "terminal" ? terminalVerticalPositionSetting.get() : "global";
  switch (position === "global" ? verticalPositionSetting.get() : position) {
    case "top":
      return 0;
    case "upper":
      return 0.25;
    case "lower":
      return 0.75;
    case "bottom":
      return 1;
    default:
      return 0.5;
  }
}

/**
 * Top edge (y) of a min-height window. The sidebar and shell overlays always
 * align to this band, even while a taller window is foreground.
 */
export function minWindowTop(appId?: string): number {
  return windowTop("min", appId);
}

/**
 * Top edge (y) of a window's top bar; max-height windows pin to the screen
 * top. A bottom switcher row hangs under the band, so the band and row
 * together distribute the screen's slack.
 */
export function windowTop(mode: WindowHeightMode, appId?: string): number {
  return Math.round((windowAreaHeight(appId) - windowBandHeight(mode, appId)) * verticalPositionFraction(appId));
}

/** App-content viewport size for a height mode (independent of vertical position). */
export function appViewportSize(mode: WindowHeightMode, appId?: string): { width: number; height: number } {
  return {
    width: appViewportWidth(appId),
    height: windowBandHeight(mode, appId) - TOP_BAR_HEIGHT,
  };
}

/** Screen rect of a window's app-content viewport (below its top bar). */
export function appViewportRect(mode: WindowHeightMode, appId?: string): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: appViewportLeft(appId),
    y: windowTop(mode, appId) + TOP_BAR_HEIGHT,
    ...appViewportSize(mode, appId),
  };
}
