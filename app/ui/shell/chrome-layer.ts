import { shellCrop } from "../../graphics/shell-scene";
import type { Plane } from "../../graphics/plane";
import { DrawOp, type ListCall, type ListClip } from "../../graphics/display-list";
import { G2_LENS_HEIGHT, G2_LENS_WIDTH, GrayImage, grayToNibble } from "../../graphics/image";
import { getDefaultMediumFont, getDefaultSmallFont } from "../../graphics/ui-fonts";
import { truncateText } from "../../graphics/textwrap";
import { activeAmbientCards } from "./ambient-cards";
import { BATTERY_ICON_WIDTH, DENSE_BATTERY_BLOCK_HEIGHT, drawBattery, drawDenseBatteries, type BatteryDevice } from "../../graphics/battery";
import { readActiveNotificationIcons } from "../../native/notification-icons";
import { readPhoneBatteryState } from "../../native/phone-battery";
import { noteStaleDataUsed, renderPassAllowsStaleData } from "../../util/render-freshness";
import { renderIcon, renderIconWithGlyph, type IconActivity, type IconName } from "../../graphics/icons";
import {
  batteryDisplayModeSetting,
  batteryIndicatorVisible,
  glassesBatteryVisibilitySetting,
  phoneBatteryVisibilitySetting,
  ringBatteryVisibilitySetting,
  watchBatteryVisibilitySetting,
  type AppSwitcherPosition,
  type BatteryIndicatorVisibility,
} from "../dashboard-settings";
import { formatClockDate, formatClockTime } from "../clock-format";
import { getFont } from "../../graphics/bdffont";
import { Layer, LayerStack } from "../layers";
import { scrollToKeepSelectionVisible } from "../menu";
import { lineStep } from "../metrics";
import {
  appViewportRect,
  MIN_WINDOW_HEIGHT,
  minWindowTop,
  SHELL_OPAQUE_BLACK,
  SIDEBAR_WIDTH,
  sidebarStripVisible,
  statusInSwitcherRow,
  SWITCHER_ROW_HEIGHT,
  switcherPosition,
  switcherRect,
  TOP_BAR_HEIGHT,
  windowFramed,
  windowHeaderHeight,
  windowTop,
  type WindowHeightMode,
} from "./geometry";

/**
 * Sidebar icon layout (the app switcher on the left or right edge) comes in
 * two variants. Few enough windows for a single column keeps the roomy 36px
 * slots (32px icons) aligned against the separator; past one column's worth
 * it switches to two 32px slots (28px icons) that exactly fill the 64px
 * sidebar. In the two-column variant the column against the app area fills
 * first and windows past that overflow into the outer column, so the common
 * case keeps every icon next to the content it belongs to. A bottom row
 * always uses the roomy slots, laid out left to right.
 */
type SidebarVariant = { columns: number; columnWidth: number; iconSize: number };
const ONE_COLUMN: SidebarVariant = { columns: 1, columnWidth: 36, iconSize: 32 };
const TWO_COLUMN: SidebarVariant = { columns: 2, columnWidth: 32, iconSize: 28 };

const ICON_SPACING = 8;
/** Icon list top/bottom margins within the sidebar band, below the top bar (and a bottom row's end margins). */
const LIST_MARGIN = 10;
const LIST_HEIGHT = MIN_WINDOW_HEIGHT - TOP_BAR_HEIGHT - 2 * LIST_MARGIN;

/** Bottom-row icons: one tall tab's worth of row, the icon inset 2px all round. */
const ROW_ICON_SIZE = SWITCHER_ROW_HEIGHT - 4;
const ROW_STEP = ROW_ICON_SIZE + ICON_SPACING;

// The status bar in the switcher row (geometry.ts statusInSwitcherRow) keeps
// the top bar's layout, so every element sits as it does there: its 28 rows
// (whose last is the divider, which the row has no use for) centred in the
// row below its separator line.
const ROW_STATUS_TOP = 1 + ((SWITCHER_ROW_HEIGHT - TOP_BAR_HEIGHT) >> 1);
// Its clock ends flush with the row's right end, which is the window's
// right edge; batteries keep the top bar's clock-to-icons gap from it.
const ROW_CLOCK_GAP = 16;
// Between the windows' end of the row (its scroll chevron) and the status.
const ROW_STATUS_GAP = 8;
// Notification icons stop short of room for this many windows' slots (or
// all of them, when there are fewer); the windows take whatever is left.
const ROW_MIN_WINDOW_SLOTS = 3;

/** Icon rows that fit in one sidebar column. */
function rowsPerColumn(variant: SidebarVariant): number {
  return Math.max(1, ((LIST_HEIGHT + ICON_SPACING) / (variant.iconSize + ICON_SPACING)) | 0);
}

function sidebarVariant(windowCount: number): SidebarVariant {
  return windowCount > rowsPerColumn(ONE_COLUMN) ? TWO_COLUMN : ONE_COLUMN;
}

/**
 * Left x of a sidebar column. Column 0 sits against the separator (the
 * strip's inner edge, toward the app area); further columns pack outward.
 */
function columnLeft(variant: SidebarVariant, column: number, position: AppSwitcherPosition): number {
  return position === "right"
    ? G2_LENS_WIDTH - SIDEBAR_WIDTH + column * variant.columnWidth
    : SIDEBAR_WIDTH - (column + 1) * variant.columnWidth;
}

/** Top y of the sidebar's icon list (below the band's top bar). */
function sidebarListTop(appId?: string): number {
  return minWindowTop(appId) + TOP_BAR_HEIGHT + LIST_MARGIN;
}

/**
 * One visible switcher icon's selection cell: the 2px-margined box around
 * the icon that a selection tab or box fills. `atSeparator` is whether the
 * cell touches the separator, so the selection can divert it (a tab) rather
 * than sit apart from it (a box, for sidebar overflow-column icons).
 */
type SwitcherCell = { x: number; y: number; width: number; height: number; atSeparator: boolean };

type SwitcherLayout = {
  position: AppSwitcherPosition;
  iconSize: number;
  /** How many icons fit at once; the list scrolls to keep the selection among them. */
  visibleCount: number;
  /**
   * Cell of the icon `slot` places past the first visible (scrolled-to) one.
   * The single source of slot geometry for both drawing and hit testing.
   */
  cell: (slot: number) => SwitcherCell;
};

/**
 * Switcher geometry for the foreground window (a bottom row sits under it).
 * `windowsRight` is where a bottom row's window icons must end: short of
 * the status bar when it shares the row. `scrollRow` is the first visible
 * window's index.
 */
function switcherLayout(windowCount: number, heightMode: WindowHeightMode, appId?: string, windowsRight?: number, scrollRow = 0): SwitcherLayout {
  const position = switcherPosition();
  if (position === "bottom") {
    const row = switcherRect(heightMode, appId);
    const width = (windowsRight ?? row.x + row.width) - row.x;
    // Under a framed window the first window's cell (the launcher's) starts
    // at the frame's left side, one pixel outside the window, so a selection
    // tab there carries the side straight down (drawWindowFrame squares that
    // corner for it). Scrolled past it, the cells keep the margin the left
    // chevron needs. The count of slots stays the same either way.
    const first = windowFramed(appId) && scrollRow === 0 ? row.x - 1 : row.x + LIST_MARGIN - 2;
    return {
      position,
      iconSize: ROW_ICON_SIZE,
      visibleCount: Math.max(1, ((width - 2 * LIST_MARGIN + ICON_SPACING) / ROW_STEP) | 0),
      cell: (slot) => ({
        x: first + slot * ROW_STEP, y: row.y, width: ROW_ICON_SIZE + 4, height: SWITCHER_ROW_HEIGHT,
        atSeparator: true,
      }),
    };
  }
  // Slots fill the column against the separator top to bottom, then
  // overflow outward.
  const variant = sidebarVariant(windowCount);
  const rows = rowsPerColumn(variant);
  const listTop = sidebarListTop(appId);
  return {
    position,
    iconSize: variant.iconSize,
    visibleCount: rows * variant.columns,
    cell: (slot) => {
      const column = (slot / rows) | 0;
      return {
        x: columnLeft(variant, column, position),
        y: listTop + (slot % rows) * (variant.iconSize + ICON_SPACING) - 2,
        width: variant.columnWidth,
        height: variant.iconSize + 4,
        atSeparator: column === 0,
      };
    },
  };
}

/**
 * Horizontal extent of the sidebar region that actually holds icons: the
 * one-column variant leaves a dead strip on the outer side of its single
 * column. Screenshot cropping uses this to trim the unused part.
 */
export function sidebarContentSpan(windowCount: number): { left: number; right: number } {
  const variant = sidebarVariant(windowCount);
  const width = variant.columns * variant.columnWidth;
  return switcherPosition() === "right"
    ? { left: G2_LENS_WIDTH - SIDEBAR_WIDTH, right: G2_LENS_WIDTH - SIDEBAR_WIDTH + width }
    : { left: SIDEBAR_WIDTH - width, right: SIDEBAR_WIDTH };
}

/**
 * Horizontal extent of the top bar: the foreground window's, short of a side
 * strip overlaid on it (full-panel mode, sidebar focused).
 */
function topBarSpan(state: ShellChromeState): { left: number; right: number } {
  const viewport = appViewportRect(state.foregroundHeightMode, state.foregroundAppId);
  let left = viewport.x, right = viewport.x + viewport.width;
  if (sidebarStripVisible(state.focus, state.foregroundAppId)) {
    const position = switcherPosition();
    if (position === "left") left = Math.max(left, SIDEBAR_WIDTH);
    if (position === "right") right = Math.min(right, G2_LENS_WIDTH - SIDEBAR_WIDTH);
  }
  return { left, right };
}
const NOTIFICATION_ICON_SIZE = 24;
const BORDER_VALUE = 40;

export type ShellChromeWindow = {
  windowId: string;
  title: string;
  attention: boolean;
  /** Draw the window's indicator icon. inverted = black-on-white (focused tab). */
  drawIcon: (image: GrayImage, x: number, y: number, size: number, inverted?: boolean) => void;
};

export type ShellChromeState = {
  windows: ShellChromeWindow[];
  selectedIndex: number;
  focus: "sidebar" | "window";
  /** Height mode of the foreground window; decides where its top bar sits. */
  foregroundHeightMode: WindowHeightMode;
  foregroundAppId?: string;
  battery: {
    headset: number | null;
    headsetCharging: boolean | null;
    ring: number | null;
    ringCharging: boolean | null;
    /** The Wear OS watch (app/g2/wear-remote.ts); null when no watch is reachable. */
    watch: number | null;
    watchCharging: boolean | null;
  };
  /** App-provided tray images, drawn between notification icons and batteries. */
  trayIcons: GrayImage[];
};

/** Placeholder window icon: rounded outline with a single letter. */
export function makeLetterWindowIcon(letter: string): ShellChromeWindow["drawIcon"] {
  return (image, x, y, size, inverted) => {
    const font = getDefaultMediumFont();
    if (!inverted) {
      image.drawRoundedRect(x, y, size, size, 120, 6);
    }
    const textX = x + Math.max(0, ((size - font.measureText(letter)) / 2) | 0);
    const textY = y + Math.max(0, ((size - font.lineHeight) / 2) | 0);
    image.drawText(font, textX, textY, letter, inverted ? SHELL_OPAQUE_BLACK : 210);
  };
}

/**
 * Inverted (black-on-white) variant of an icon raster, for the focused tab:
 * coverage becomes darkness, with full coverage mapping to SHELL_OPAQUE_BLACK
 * (1) rather than 0, since 0 is the surface's transparent color key. Memoized
 * per source object so the variant is a stable image the texture cache can
 * key on (mode-13's inverse LUT can't reproduce this mapping exactly, so it
 * is simply a separate cached image).
 */
const invertedIconCache = new WeakMap<GrayImage, GrayImage>();
function invertedIcon(icon: GrayImage): GrayImage {
  let inverted = invertedIconCache.get(icon);
  if (!inverted) {
    inverted = new GrayImage(icon.width, icon.height, 0);
    for (let i = 0; i < icon.pixels.length; i++) {
      const coverage = icon.pixels[i]!;
      if (coverage > 0) {
        inverted.pixels[i] = Math.max(SHELL_OPAQUE_BLACK, 255 - coverage);
      }
    }
    invertedIconCache.set(icon, inverted);
  }
  return inverted;
}

/** Window icon rendered from an SVG (Lucide), rendered once per size and cached. */
export function makeSvgWindowIcon(name: IconName, glyph?: string, activity?: () => IconActivity): ShellChromeWindow["drawIcon"] {
  return (image, x, y, size, inverted) => {
    const icon = glyph || activity ? renderIconWithGlyph(name, glyph ?? "", size, activity?.() ?? "idle") : renderIcon(name, size);
    if (!icon) return;
    const dx = x + Math.max(0, ((size - icon.width) / 2) | 0);
    const dy = y + Math.max(0, ((size - icon.height) / 2) | 0);
    image.drawImage(inverted ? invertedIcon(icon) : icon, dx, dy);
  };
}

/** SVG icon when a name is given, else the letter placeholder. */
export function windowIcon(icon: IconName | undefined, letter: string, glyph?: string, activity?: () => IconActivity): ShellChromeWindow["drawIcon"] {
  return icon ? makeSvgWindowIcon(icon, glyph, activity) : makeLetterWindowIcon(letter);
}

/** Window icon backed by an arbitrary cached grayscale image renderer. */
export function makeImageWindowIcon(
  render: (size: number) => GrayImage | null,
  fallback: ShellChromeWindow["drawIcon"],
): ShellChromeWindow["drawIcon"] {
  return (image, x, y, size, inverted) => {
    const icon = render(size);
    if (!icon) {
      fallback(image, x, y, size, inverted);
      return;
    }
    const dx = x + Math.max(0, ((size - icon.width) / 2) | 0);
    const dy = y + Math.max(0, ((size - icon.height) / 2) | 0);
    image.drawImage(inverted ? invertedIcon(icon) : icon, dx, dy);
  };
}

/**
 * Base layer of the shell surface: the window sidebar (or bottom row) and
 * the status top bar. Everything not explicitly painted stays 0 (transparent
 * on the color-key shell surface), so the app viewport shows through.
 */
export class ShellChromeLayer implements Layer {
  // First switcher icon shown; adjusted each paint to keep the selection visible.
  private scrollRow = 0;
  // Where the last paint ended a bottom row's window icons, for hit testing.
  private rowWindowsRight: number | undefined;
  // Whether the last paint's selection tab carries the window frame's left
  // side down, so the frame's bottom-left corner is square.
  private frameCornerSquare = false;

  constructor(private readonly getState: () => ShellChromeState) {}

  paint(): GrayImage {
    const image = new GrayImage(G2_LENS_WIDTH, G2_LENS_HEIGHT, 0);
    const state = this.getState();
    const statusInRow = statusInSwitcherRow(state.foregroundAppId);
    // Full-panel mode: the strip is an overlay, present only while the user
    // is in it (the window underneath keeps its full width the rest of the time).
    if (sidebarStripVisible(state.focus, state.foregroundAppId)) {
      this.drawSidebar(image, state, statusInRow ? image : undefined);
    }
    if (!statusInRow) this.drawTopBar(image, state);
    const frame = windowFrameRect(state);
    if (frame) drawWindowFrame(image, frame, this.frameCornerSquare);
    drawAmbientCards(image, topBarSpan(state).right);
    return image;
  }

  paintParts(): Plane[] {
    const state = this.getState(), parts: Plane[] = [];
    const statusInRow = statusInSwitcherRow(state.foregroundAppId);
    const canvas = new GrayImage(G2_LENS_WIDTH, G2_LENS_HEIGHT, 0);
    const bar = topBarSpan(state);
    if (!statusInRow) {
      this.drawTopBar(canvas, state);
      parts.push({ ...shellCrop(canvas, bar.left, windowTop(state.foregroundHeightMode, state.foregroundAppId), bar.right - bar.left, TOP_BAR_HEIGHT, 2), depth: -2 });
    }
    if (sidebarStripVisible(state.focus, state.foregroundAppId)) {
      const stripCanvas = new GrayImage(G2_LENS_WIDTH, G2_LENS_HEIGHT, 0);
      const statusLeft = this.drawSidebar(stripCanvas, state, statusInRow ? canvas : undefined);
      // The window frame rides on the switcher row, whose top edge is its
      // bottom side, and so replays after any top bar, whose bottom row is
      // its top. It plays at the screen's own depth rather than the bar's
      // -2, which on top of a -62 screen depth would shift a side off the
      // screen. (A framed window always has the row on screen.)
      const frame = windowFrameRect(state);
      if (frame) drawWindowFrame(stripCanvas, frame, this.frameCornerSquare);
      // Under a framed window the row's surface spans the frame, whose left
      // side the first selection tab continues.
      const strip = switcherRect(state.foregroundHeightMode, state.foregroundAppId);
      const span = frame ?? strip;
      parts.push(shellCrop(stripCanvas, span.x, strip.y, span.width, strip.height, 1));
      if (statusLeft !== null) {
        // The status bar keeps the top bar's surface and its depth, -2, over
        // the row's right end below its separator line, so the clock ticking
        // doesn't resend the window icons.
        const right = strip.x + strip.width;
        parts.push({ ...shellCrop(canvas, statusLeft, strip.y + 1, right - statusLeft, strip.height - 1, 2), depth: -2 });
      }
    }
    drawAmbientCards(canvas, bar.right, parts);
    return parts;
  }

  handleInput(): void {
    // Shell input is handled by the shell state machine before it reaches the
    // layer stack; the chrome itself never consumes events.
  }

  /**
   * Which window's switcher icon is under (x, y) on screen, if any — the
   * same slot geometry drawSidebar uses, so a touch on the phone's mirror
   * lands on the icon the mirror showed.
   */
  windowIndexAt(x: number, y: number, windowCount: number): number | null {
    if (windowCount === 0) return null;
    const state = this.getState();
    const layout = switcherLayout(windowCount, state.foregroundHeightMode, state.foregroundAppId, this.rowWindowsRight, this.scrollRow);
    const lastVisible = Math.min(windowCount, this.scrollRow + layout.visibleCount);
    for (let index = this.scrollRow; index < lastVisible; index++) {
      const cell = layout.cell(index - this.scrollRow);
      if (x >= cell.x && x < cell.x + cell.width && y >= cell.y && y < cell.y + cell.height) {
        return index;
      }
    }
    return null;
  }

  /**
   * Draw the switcher strip or row. Given `statusImage`, a bottom row shares
   * its right end with the status bar, drawn there (into that image, which
   * may be this one) first, and the window icons take what it leaves.
   * Returns the status bar's left edge, or null without one.
   */
  private drawSidebar(image: GrayImage, state: ShellChromeState, statusImage?: GrayImage): number | null {
    // A side strip aligns with the app's preferred band (legacy tall
    // terminal sessions keep it at the global band position); a bottom row
    // sits under the foreground window.
    const strip = switcherRect(state.foregroundHeightMode, state.foregroundAppId);
    image.fillRect(strip.x, strip.y, strip.width, strip.height, SHELL_OPAQUE_BLACK);

    // Scroll the icon list to keep the selection visible; chevrons mark
    // windows off-screen before/after. Sidebar icons fill the column against
    // the separator top to bottom, then overflow into the outer one, so a
    // visible slot's column is decided by its position within the scrolled
    // window.
    const count = state.windows.length;
    const statusLeft = statusImage && switcherPosition() === "bottom"
      ? this.drawRowStatus(statusImage, state, strip, count) : null;
    const windowsRight = statusLeft === null ? strip.x + strip.width : statusLeft - ROW_STATUS_GAP;
    this.rowWindowsRight = windowsRight;
    const visibleCount = switcherLayout(count, state.foregroundHeightMode, state.foregroundAppId, windowsRight).visibleCount;
    this.scrollRow = scrollToKeepSelectionVisible(this.scrollRow, state.selectedIndex, visibleCount, count);
    const layout = switcherLayout(count, state.foregroundHeightMode, state.foregroundAppId, windowsRight, this.scrollRow);
    const { iconSize, position } = layout;
    const lastVisible = Math.min(count, this.scrollRow + layout.visibleCount);
    const cellOf = (index: number) => layout.cell(index - this.scrollRow);

    // The selection is a "diversion" of the switcher/main separator line:
    // the line bulges toward the main area around the selected icon (rounded
    // on the outer side, open to the main area), so the separator is drawn
    // with a gap there. When the switcher has focus, the diversion is filled
    // white and the icon drawn inverted. Only the sidebar column against the
    // separator touches it; a selected overflow icon gets a self-contained
    // box instead.
    const selVisible = state.selectedIndex >= this.scrollRow && state.selectedIndex < lastVisible;
    const selCell = selVisible ? cellOf(state.selectedIndex) : null;
    drawSeparator(image, state, strip, selCell?.atSeparator ? selCell : null);
    const frame = position === "bottom" ? windowFrameRect(state) : null;
    this.frameCornerSquare = !!frame && selCell?.x === frame.x;

    for (let index = this.scrollRow; index < lastVisible; index++) {
      const window = state.windows[index]!;
      const cell = cellOf(index);
      const x = cell.x + (((cell.width - iconSize) / 2) | 0);
      const y = cell.y + (((cell.height - iconSize) / 2) | 0);
      const selected = index === state.selectedIndex;
      const focused = selected && state.focus === "sidebar";
      if (selected && cell.atSeparator) {
        drawSelectionTab(image, cell, position, focused);
      } else if (selected) {
        // Spans the full column: only 2px of margin flanks the icon in its
        // slot, so anything wider would clip at the screen edge.
        drawSelectionBox(image, cell.x, cell.y, cell.width, cell.height, focused);
      }
      // Paint unselected icons into their own resource so only the replayed copy moves.
      const icon = selected ? image : new GrayImage(iconSize, iconSize + 1);
      const iconX = selected ? x : 0, iconY = selected ? y : 1;
      window.drawIcon(icon, iconX, iconY, iconSize, focused);
      if (window.attention) {
        // Black dot on the white focused tab, white dot otherwise. A deferred
        // image (not a raster fill) so it renders above the icon, which is
        // itself a deferred draw.
        icon.drawImage(attentionDot(focused ? SHELL_OPAQUE_BLACK : 255), iconX + iconSize - 7, iconY - 1);
      }
      if (!selected) image.drawDepthImage(icon, x, y - 1, -2);
    }

    if (position === "bottom") {
      // Chevrons sit in the margins at either end of the icons, pointing off them.
      const chevronY = strip.y + ((strip.height / 2) | 0);
      if (this.scrollRow > 0) {
        drawChevron(image, strip.x + 6, chevronY, "left");
      }
      if (lastVisible < count) {
        drawChevron(image, windowsRight - 6, chevronY, "right");
      }
      return statusLeft;
    }
    // Chevrons center over the icon area, which in the one-column variant is
    // narrower than the sidebar strip.
    const span = sidebarContentSpan(count);
    const chevronX = ((span.left + span.right) / 2) | 0;
    if (this.scrollRow > 0) {
      drawChevron(image, chevronX, strip.y + TOP_BAR_HEIGHT + 6, "up");
    }
    if (lastVisible < count) {
      drawChevron(image, chevronX, strip.y + strip.height - 6, "down");
    }
    return null;
  }

  /**
   * The status bar at the right end of the switcher row, right to left:
   * date and time, batteries, app widgets, then notification icons, each as
   * it sits in the top bar (see ROW_STATUS_TOP). Notification icons stop
   * short of room for a few window slots; the windows get the rest, and
   * whatever they leave over is free space between the two. Returns the
   * left edge of what it drew.
   */
  private drawRowStatus(image: GrayImage, state: ShellChromeState, row: Rect, windowCount: number): number {
    image.fillRect(row.x, row.y + 1, row.width, row.height - 1, SHELL_OPAQUE_BLACK);
    const top = row.y + ROW_STATUS_TOP;
    const font = getDefaultMediumFont();
    const clock = clockText();
    const clockX = row.x + row.width - font.measureText(clock);
    image.drawText(font, clockX, top + Math.max(0, ((TOP_BAR_HEIGHT - font.lineHeight) / 2) | 0), clock, 210);
    // The battery block keeps its usual right margin inside the edge it's given.
    const batteryLeft = this.drawTopBarBatteries(image, state, top, clockX - ROW_CLOCK_GAP + BATTERY_BLOCK_RIGHT_MARGIN);
    const trayLeft = drawTrayIcons(image, state.trayIcons, batteryLeft, top);

    // Right-aligned against the widgets, with the top bar's spacing.
    const slots = Math.min(windowCount, ROW_MIN_WINDOW_SLOTS);
    const windowsFloor = row.x + 2 * LIST_MARGIN + Math.max(0, slots * ROW_STEP - ICON_SPACING) + ROW_STATUS_GAP;
    const iconsRight = trayLeft - 8, step = NOTIFICATION_ICON_SIZE + 4;
    const maxIcons = Math.max(0, ((iconsRight - windowsFloor + 4) / step) | 0);
    if (maxIcons === 0) return trayLeft;
    const { icons, stale } = readActiveNotificationIcons(maxIcons, renderPassAllowsStaleData());
    if (stale) {
      noteStaleDataUsed();
    }
    if (!icons.length) return trayLeft;
    const iconsLeft = iconsRight - icons.length * step + 4;
    const iconY = top + (((TOP_BAR_HEIGHT - NOTIFICATION_ICON_SIZE) / 2) | 0);
    for (let index = 0; index < icons.length; index++) {
      image.drawImage(icons[index]!, iconsLeft + index * step, iconY);
    }
    return iconsLeft;
  }

  private drawTopBar(image: GrayImage, state: ShellChromeState): void {
    const font = getDefaultMediumFont();
    // The bar sits at the top edge of the foreground window's band, wherever
    // its height mode puts that (screen top for max height). It moves when
    // the foreground switches to a window of a different height.
    const barTop = windowTop(state.foregroundHeightMode, state.foregroundAppId);
    // The bar spans the app viewport; with a side strip overlaid (full-panel
    // mode, sidebar focused) it still stops at the strip.
    const { left: barLeft, right: barRight } = topBarSpan(state);
    image.fillRect(barLeft, barTop, barRight - barLeft, TOP_BAR_HEIGHT, SHELL_OPAQUE_BLACK);
    // A framed window's frame draws this line as its top (drawWindowFrame).
    if (!windowFramed(state.foregroundAppId)) {
      image.drawLine(barLeft, barTop + TOP_BAR_HEIGHT - 1, barRight - 1, barTop + TOP_BAR_HEIGHT - 1, BORDER_VALUE);
    }

    const clock = clockText();
    const clockX = barLeft + 10;
    const textY = barTop + Math.max(0, ((TOP_BAR_HEIGHT - font.lineHeight) / 2) | 0);
    image.drawText(font, clockX, textY, clock, 210);

    const batteryLeft = this.drawTopBarBatteries(image, state, barTop, barRight);
    const trayLeft = drawTrayIcons(image, state.trayIcons, batteryLeft, barTop);

    const iconsX = clockX + font.measureText(clock) + 16;
    const maxIcons = Math.max(0, ((trayLeft - 8 - iconsX) / (NOTIFICATION_ICON_SIZE + 4)) | 0);
    if (maxIcons > 0) {
      const { icons, stale } = readActiveNotificationIcons(maxIcons, renderPassAllowsStaleData());
      if (stale) {
        noteStaleDataUsed();
      }
      const iconY = barTop + (((TOP_BAR_HEIGHT - NOTIFICATION_ICON_SIZE) / 2) | 0);
      for (let index = 0; index < icons.length; index++) {
        image.drawImage(icons[index]!, iconsX + index * (NOTIFICATION_ICON_SIZE + 4), iconY);
      }
    }
  }

  /**
   * Labelled battery indicators for the phone, Wear OS watch, G2, and R1,
   * right-aligned in the top bar. The watch one exists only while a watch
   * running the Faceclaw watch app is reachable (no placeholder otherwise).
   * The Settings > Customization > Battery indicators submenu picks the
   * style (label beside a gauge icon or percentage, stacked above either, or
   * dense: device icons beside gauges, two per column) and, per device,
   * whether the indicator shows always, only below 50%, or never. `barRight`
   * is the bar's right edge (short of a right-hand sidebar). Returns the left
   * edge of the battery block.
   */
  private drawTopBarBatteries(image: GrayImage, state: ShellChromeState, barTop: number, barRight: number): number {
    const mode = batteryDisplayModeSetting.get();
    const items: BatteryItem[] = [];
    const phone = readPhoneBatteryState();
    if (phone.battery !== null && Number.isFinite(phone.battery)) {
      pushBatteryItem(items, phoneBatteryVisibilitySetting.get(), "Phone", "phone", phone.battery, Boolean(phone.charging));
    }
    if (state.battery.watch !== null && Number.isFinite(state.battery.watch)) {
      pushBatteryItem(items, watchBatteryVisibilitySetting.get(), "Watch", "watch", state.battery.watch,
        Boolean(state.battery.watchCharging));
    }
    if (state.battery.headset !== null && Number.isFinite(state.battery.headset)) {
      pushBatteryItem(items, glassesBatteryVisibilitySetting.get(), "G2", "glasses", state.battery.headset,
        Boolean(state.battery.headsetCharging));
    }
    if (state.battery.ring !== null && Number.isInteger(state.battery.ring)
        && state.battery.ring >= 0 && state.battery.ring <= 100) {
      pushBatteryItem(items, ringBatteryVisibilitySetting.get(), "R1", "ring", state.battery.ring,
        Boolean(state.battery.ringCharging));
    }
    if (!items.length) return barRight;
    if (mode === "stacked" || mode === "stacked-percentage") {
      return drawStackedBatteries(image, items, barTop, barRight, mode === "stacked-percentage");
    }
    if (mode === "dense") {
      return drawDenseBatteries(image, items, barRight - BATTERY_BLOCK_RIGHT_MARGIN, barTop + DENSE_TOP);
    }

    const font = getDefaultSmallFont();
    const percentageMode = mode === "percentage";
    const labelGap = 5;
    const itemGap = 12;
    const textY = barTop + Math.max(0, ((TOP_BAR_HEIGHT - font.lineHeight) / 2) | 0);
    let x = barRight - BATTERY_BLOCK_RIGHT_MARGIN;
    for (let index = items.length - 1; index >= 0; index--) {
      const item = items[index]!;
      const percentText = `${item.percent}%`;
      const valueWidth = percentageMode ? font.measureText(percentText) : BATTERY_ICON_WIDTH;
      const labelWidth = font.measureText(item.label);
      x -= labelWidth + labelGap + valueWidth;
      image.drawText(font, x, textY, item.label, BATTERY_LABEL_VALUE);
      const valueX = x + labelWidth + labelGap;
      if (percentageMode) {
        if (item.charging) {
          // Inverted text marks charging, matching the dashboard card.
          image.fillRect(valueX - 2, textY - 1, valueWidth + 4, font.lineHeight + 2, 255);
          image.drawText(font, valueX, textY, percentText, 1);
        } else {
          image.drawText(font, valueX, textY, percentText, 200);
        }
      } else {
        const icon = drawBattery(item.percent, item.charging);
        image.bitBlt(icon, valueX, barTop + Math.max(0, ((TOP_BAR_HEIGHT - icon.height) / 2) | 0), {
          transparentZero: true,
        });
      }
      x -= itemGap;
    }
    return x + itemGap;
  }
}

type BatteryItem = { label: string; device: BatteryDevice; percent: number; charging: boolean };

/** The status bar's date and time. */
function clockText(): string {
  const now = new Date();
  return `${formatClockDate(now)} ${formatClockTime(now)}`;
}

const BATTERY_BLOCK_RIGHT_MARGIN = 8;
const BATTERY_LABEL_VALUE = 150;

/** Append an indicator if its visibility setting shows it at this charge. */
function pushBatteryItem(
  items: BatteryItem[],
  visibility: BatteryIndicatorVisibility,
  label: string,
  device: BatteryDevice,
  percent: number,
  charging: boolean,
): void {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  if (!batteryIndicatorVisible(visibility, clamped)) return;
  items.push({ label, device, percent: clamped, charging });
}

// Stacked style geometry, in rows below the bar's top edge. The bar has 27
// usable rows above its bottom border line, too few for the user-sized UI
// font (line height up to 21px) over a 10px gauge, so both stacked lines use
// a fixed 12px bitmap face instead: TerminusV, proportional, with 8px
// capitals and digits on a 10px ascent. Ink then spans rows 3..22: label
// capitals at 3..10, a 2px gap, and the gauge at 13..22 (or the percentage
// digits at 13..20, whose charging highlight box covers 12..21), leaving 3
// rows above and 4 below (before the border) so the pair reads as one
// centered unit.
const STACKED_LABEL_BASELINE = 11;
const STACKED_ICON_TOP = 13;
const STACKED_PERCENT_BASELINE = 21;
const STACKED_ITEM_GAP = 10;

// Dense style: two 10px indicator rows with a 2px gap span rows 2..23, the
// same vertical center as the stacked styles' ink.
const DENSE_TOP = (((TOP_BAR_HEIGHT - 1 - DENSE_BATTERY_BLOCK_HEIGHT) / 2) | 0);

/**
 * Stacked styles: each label centered above its gauge icon (or percentage
 * text), right-aligned in the bar (ending at barRight). Returns the left edge
 * of the battery block.
 */
function drawStackedBatteries(image: GrayImage, items: BatteryItem[], barTop: number, barRight: number, percentage: boolean): number {
  const font = getFont("terminusv12");
  const labelTop = barTop + STACKED_LABEL_BASELINE - font.ascent;
  const percentTop = barTop + STACKED_PERCENT_BASELINE - font.ascent;
  let x = barRight - BATTERY_BLOCK_RIGHT_MARGIN;
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]!;
    const percentText = `${item.percent}%`;
    const labelWidth = font.measureText(item.label);
    const valueWidth = percentage ? font.measureText(percentText) : BATTERY_ICON_WIDTH;
    const itemWidth = Math.max(labelWidth, valueWidth);
    x -= itemWidth;
    image.drawText(font, x + (((itemWidth - labelWidth) / 2) | 0), labelTop, item.label, BATTERY_LABEL_VALUE);
    const valueX = x + (((itemWidth - valueWidth) / 2) | 0);
    if (!percentage) {
      const icon = drawBattery(item.percent, item.charging);
      image.bitBlt(icon, valueX, barTop + STACKED_ICON_TOP, { transparentZero: true });
    } else if (item.charging) {
      // Inverted text marks charging, as in the side-by-side percentage style;
      // the box hugs the digits' 8px ink rather than the full 12px line.
      const inkTop = barTop + STACKED_PERCENT_BASELINE - 8;
      image.fillRect(valueX - 2, inkTop - 1, valueWidth + 4, 10, 255);
      image.drawText(font, valueX, percentTop, percentText, 1);
    } else {
      image.drawText(font, valueX, percentTop, percentText, 200);
    }
    x -= STACKED_ITEM_GAP;
  }
  return x + STACKED_ITEM_GAP;
}

// Ambient cards (encounter popups): compact and deliberately unobtrusive,
// anchored to the bottom-right of the window band and stacking upward, clear
// of the caption area's left-aligned text. Never interactive.
const AMBIENT_CARD_WIDTH = 230;
const AMBIENT_CARD_MARGIN = 6;
const AMBIENT_CARD_GAP = 4;
const AMBIENT_CARD_PADDING_X = 8;
const AMBIENT_CARD_PADDING_Y = 4;
const AMBIENT_MAX_LINES_PER_CARD = 3;

/**
 * Paint the active ambient cards bottom-up: the oldest card sits at the very
 * bottom of the window band and newer ones stack above it. Cards that would
 * cross into the window header are dropped rather than clipped. `right` is the
 * top bar's right edge, which the cards align to.
 */
const ambientKeys = new Map<string, number>();
function drawAmbientCards(image: GrayImage, right: number, parts?: Plane[]): void {
  const cards = activeAmbientCards();
  if (!cards.length) return;
  const font = getDefaultSmallFont();
  const bandTop = minWindowTop();
  const bandBottom = bandTop + MIN_WINDOW_HEIGHT;
  // Right-aligned with the top bar: clear of a right-hand sidebar.
  const x = right - AMBIENT_CARD_WIDTH - AMBIENT_CARD_MARGIN;
  const textWidth = AMBIENT_CARD_WIDTH - 2 * AMBIENT_CARD_PADDING_X;
  let bottom = bandBottom - AMBIENT_CARD_MARGIN;
  for (const card of cards) {
    const lines = [card.title, ...card.lines].slice(0, 1 + AMBIENT_MAX_LINES_PER_CARD);
    const height = 2 * AMBIENT_CARD_PADDING_Y + lines.length * lineStep(font);
    const y = bottom - height;
    if (y < bandTop + windowHeaderHeight()) break;
    const target = parts ? new GrayImage(image.width, image.height, 0) : image;
    target.fillRect(x, y, AMBIENT_CARD_WIDTH, height, SHELL_OPAQUE_BLACK);
    target.drawRect(x, y, AMBIENT_CARD_WIDTH, height, 90);
    for (let index = 0; index < lines.length; index++) {
      target.drawText(
        font,
        x + AMBIENT_CARD_PADDING_X,
        y + AMBIENT_CARD_PADDING_Y + index * lineStep(font),
        truncateText(font, lines[index]!, textWidth),
        index === 0 ? 220 : 160,
      );
    }
    if (parts) {
      let key = ambientKeys.get(card.id);
      if (key === undefined) { key = LayerStack.allocateShellKey(); ambientKeys.set(card.id, key); }
      parts.push(shellCrop(target, x, y, AMBIENT_CARD_WIDTH, height, key));
    }
    bottom = y - AMBIENT_CARD_GAP;
  }
}

/**
 * Draw app tray icons right-to-left, ending just left of the battery block;
 * returns the left edge of the tray region.
 */
function drawTrayIcons(image: GrayImage, trayIcons: GrayImage[], rightEdge: number, barTop: number): number {
  let x = rightEdge;
  for (let index = trayIcons.length - 1; index >= 0; index--) {
    const icon = trayIcons[index]!;
    x -= icon.width + 10;
    image.drawImage(icon, x, barTop + Math.max(0, ((TOP_BAR_HEIGHT - icon.height) / 2) | 0));
  }
  return x;
}

/** The sidebar attention marker, cached per fill value (deferred-image source). */
const attentionDots = new Map<number, GrayImage>();
function attentionDot(value: number): GrayImage {
  let dot = attentionDots.get(value);
  if (!dot) {
    dot = new GrayImage(8, 8, 0);
    dot.fillRoundedRect(0, 0, 8, 8, value, 4);
    attentionDots.set(value, dot);
  }
  return dot;
}

type Rect = { x: number; y: number; width: number; height: number };

/** Corner radius of the foreground window's frame. */
const FRAME_RADIUS = 8;

/**
 * The rounded frame around the foreground window's content (below its
 * header), when it has one (geometry.ts windowFramed): one pixel all round.
 * Its sides run down the pixel just outside each side of the window, and
 * its top is the header's last row: the top bar's, in place of the bar's
 * divider, or the whole one-row header with the status bar in the switcher
 * row. Its bottom is the switcher row's top edge, where drawSeparator draws
 * it so the selection tab can divert it.
 */
function windowFrameRect(state: ShellChromeState): Rect | null {
  if (!windowFramed(state.foregroundAppId)) return null;
  const viewport = appViewportRect(state.foregroundHeightMode, state.foregroundAppId);
  return { x: viewport.x - 1, y: viewport.y - 1, width: viewport.width + 2, height: viewport.height + 2 };
}

/**
 * Draw the window frame (see windowFrameRect) as a retained firmware rounded
 * rect over whatever lies beneath it: no fill, so the window's content shows
 * through, and black outside the curve, cutting the content's square
 * corners to it. It is clipped short of its bottom row, which drawSeparator
 * draws with the selection tab's gap. With `squareBottomLeft` (a selection
 * tab continuing its left side down), the rect is clipped away from that
 * corner's box too, and the side runs straight through it as a one-pixel
 * clipped clear, leaving the content's corner whole.
 */
function drawWindowFrame(image: GrayImage, frame: Rect, squareBottomLeft: boolean): void {
  const border = grayToNibble(BORDER_VALUE), above = frame.height - 1;
  const rounded = (clip: ListClip): ListCall => ({
    op: DrawOp.ROUNDED_RECT, x: 0, y: 0, width: frame.width, height: frame.height, radius: FRAME_RADIUS,
    background: 0, border, outside: 0, clip,
  });
  const calls = squareBottomLeft ? [
    rounded({ x: FRAME_RADIUS, y: 0, width: frame.width - FRAME_RADIUS, height: above }),
    rounded({ x: 0, y: 0, width: FRAME_RADIUS, height: above - FRAME_RADIUS }),
    { op: DrawOp.CLEAR, color: border, clip: { x: 0, y: above - FRAME_RADIUS, width: 1, height: FRAME_RADIUS } },
  ] : [rounded({ x: 0, y: 0, width: frame.width, height: above })];
  image.drawDisplayList({ resources: [], calls }, frame.x, frame.y, frame.width, frame.height);
}

/**
 * How far in from the frame's sides its top and bottom rows start: the
 * first pixel whose centre passes the firmware's rounded-rect test, which
 * the separator must match to join the corners.
 */
function frameEdgeInset(): number {
  const r = FRAME_RADIUS, dy = 2 * r - 1;
  let inset = 0;
  while (inset < r && (2 * (r - inset) - 1) ** 2 + dy * dy > 4 * r * r) inset++;
  return inset;
}

const TAB_RADIUS = 6;
// How far the diversion pokes past the separator into the main area.
const TAB_EXTEND = 0;
const TAB_STROKE = 150;

/**
 * Draw the switcher/main separator line along the strip's inner edge, with
 * a gap where the selection tab `gap` diverts it.
 */
function drawSeparator(
  image: GrayImage,
  state: ShellChromeState,
  strip: { x: number; y: number; width: number; height: number },
  gap: SwitcherCell | null,
): void {
  if (switcherPosition() === "bottom") {
    // Along the row's top edge: the full width of the row, or between the
    // corners of the window frame, whose bottom side this is.
    // A selection tab at the frame's left side squares that corner (see
    // drawWindowFrame), so the line starts right at the side.
    const frame = windowFrameRect(state);
    const left = frame ? frame.x + (gap?.x === frame.x ? 0 : frameEdgeInset()) : strip.x;
    const right = frame ? frame.x + frame.width - 1 - frameEdgeInset() : strip.x + strip.width - 1;
    const y = strip.y;
    if (gap) {
      image.drawLine(left, y, gap.x, y, BORDER_VALUE);
      image.drawLine(gap.x + gap.width, y, right, y, BORDER_VALUE);
    } else {
      image.drawLine(left, y, right, y, BORDER_VALUE);
    }
    return;
  }
  const sep = switcherPosition() === "right" ? strip.x : strip.x + strip.width - 1;
  const bottom = strip.y + strip.height - 1;
  // Start beside the app content, leaving the area alongside the top bar open.
  const top = Math.max(strip.y, windowTop(state.foregroundHeightMode, state.foregroundAppId) + TOP_BAR_HEIGHT);
  if (gap) {
    image.drawLine(sep, top, sep, gap.y, BORDER_VALUE);
    image.drawLine(sep, gap.y + gap.height, sep, bottom, BORDER_VALUE);
  } else {
    image.drawLine(sep, top, sep, bottom, BORDER_VALUE);
  }
}

/**
 * Draw the selection "diversion" of the separator line around a switcher
 * icon whose cell touches the separator: rounded on the outer side, square
 * and open on the side toward the main area, extending TAB_EXTEND px past
 * the separator into it. Focused = filled white; otherwise an outline.
 *
 * Drawn in tab-local coordinates: `along` runs parallel to the separator,
 * `across` from the rounded outer edge (0) to the open edge, and fillAcross
 * maps a run of one along-line onto the screen for the strip's orientation.
 */
function drawSelectionTab(image: GrayImage, cell: SwitcherCell, position: AppSwitcherPosition, focused: boolean): void {
  const vertical = position !== "bottom";
  const along = vertical ? cell.height : cell.width;
  const across = (vertical ? cell.width : cell.height) + TAB_EXTEND;
  const fillAcross = (i: number, from: number, to: number, value: number) => {
    switch (position) {
      case "left":
        image.fillRect(cell.x + from, cell.y + i, to - from, 1, value);
        break;
      case "right":
        image.fillRect(cell.x + cell.width - to, cell.y + i, to - from, 1, value);
        break;
      default:
        image.fillRect(cell.x + i, cell.y + cell.height - to, 1, to - from, value);
    }
  };
  if (focused) {
    for (let i = 0; i < along; i++) {
      fillAcross(i, tabInset(i, 0, along, TAB_RADIUS), across, 255);
    }
    return;
  }
  // Outline: the tab shape minus the same shape inset by a pixel, line by
  // line. Stroking the curve one pixel per line instead would leave gaps
  // wherever the corner steps in by more than one pixel, and the two edges
  // running across have to start at the same inset the curve uses or they
  // part company from it.
  for (let i = 0; i < along; i++) {
    const outer = tabInset(i, 0, along, TAB_RADIUS);
    // The first and last lines are the edges running across: solid out to
    // the open side. In between only the outer edge is stroked.
    const inner = i > 0 && i < along - 1 ? 1 + tabInset(i, 1, along - 1, TAB_RADIUS - 1) : across;
    fillAcross(i, outer, Math.max(outer + 1, Math.min(inner, across)), TAB_STROKE);
  }
}

/**
 * Selection marker for an overflow-column icon, which has no separator to
 * divert: a self-contained rounded box, filled white when the sidebar has
 * focus and outlined otherwise (matching the tab's two states).
 */
function drawSelectionBox(image: GrayImage, x: number, y: number, width: number, height: number, focused: boolean): void {
  if (focused) {
    image.fillRoundedRect(x, y, width, height, 255, TAB_RADIUS);
  } else {
    image.drawRoundedRect(x, y, width, height, TAB_STROKE, TAB_RADIUS);
  }
}

/**
 * How far the tab's outer edge is inset at along-line i (of the tab spanning
 * start..end): 0 in the middle, curving in toward the rounded corners.
 */
function tabInset(i: number, start: number, end: number, radius: number): number {
  const c = i + 0.5;
  let d = 0;
  if (c < start + radius) {
    d = start + radius - c;
  } else if (c > end - radius) {
    d = c - (end - radius);
  } else {
    return 0;
  }
  return Math.max(0, Math.round(radius - Math.sqrt(Math.max(0, radius * radius - d * d))));
}

/**
 * Small triangle marker for switcher overflow, pointing the way the hidden
 * icons are; (x, y) is the middle of its base.
 */
function drawChevron(image: GrayImage, x: number, y: number, direction: "up" | "down" | "left" | "right"): void {
  const half = 5;
  if (direction === "left" || direction === "right") {
    const tipX = direction === "left" ? x - 3 : x + 3;
    image.drawLine(x, y - half, tipX, y, 140);
    image.drawLine(tipX, y, x, y + half, 140);
    return;
  }
  const tipY = direction === "up" ? y - 3 : y + 3;
  image.drawLine(x - half, y, x, tipY, 140);
  image.drawLine(x, tipY, x + half, y, 140);
}
