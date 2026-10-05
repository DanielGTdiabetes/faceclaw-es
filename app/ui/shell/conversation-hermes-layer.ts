import { DrawOp, type DisplayList, type ListCall, type ListImage } from "../../graphics/display-list";
import { GrayImage } from "../../graphics/image";
import { getDefaultMediumFont, getDefaultSmallFont } from "../../graphics/ui-fonts";
import { truncateText, wrapText } from "../../graphics/textwrap";
import { type InputEvent } from "../gestures";
import { type Layer, type LayerContext, type PaintBelow } from "../layers";
import { lineStep } from "../metrics";
import { minWindowTop } from "./geometry";

const INSET_X = 32;
/** Matches the min-height window band, wherever the vertical position setting puts it. */
const BAND_HEIGHT = 288;
/** Firmware resource cap shared by the shell scene and display-list images (5-byte header + 4 bpp rows). */
export const HERMES_RESOURCE_LIMIT = 65536;
/**
 * The shell scene drops a plane whose raster is all zero, presentations included, so the layer keeps
 * one near-black pixel. The cover clear paints over it in the same frame: it is never visible.
 */
const ANCHOR_VALUE = 1;

/** Bytes a gray image takes as one 4-bpp firmware resource. */
export function hermesResourceBytes(width: number, height: number): number {
  return 5 + Math.ceil(width / 2) * height;
}

/**
 * Split the text raster into horizontal strips that each fit one firmware resource, cropped to the ink
 * they hold. Empty strips are dropped. Coordinates are in the source image.
 */
export function hermesTextStrips(source: GrayImage, limit = HERMES_RESOURCE_LIMIT): { image: ListImage; x: number; y: number }[] {
  const { width, height, pixels } = source;
  const rowsPerStrip = Math.floor((limit - 5) / Math.ceil(width / 2));
  if (rowsPerStrip < 1) throw new Error(`Hermes text raster too wide for one resource (${width})`);
  const strips: { image: ListImage; x: number; y: number }[] = [];
  for (let start = 0; start < height; start += rowsPerStrip) {
    const end = Math.min(height, start + rowsPerStrip);
    let left = width, right = -1, top = end, bottom = -1;
    for (let y = start; y < end; y++) for (let x = 0; x < width; x++) {
      if (pixels[y * width + x] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
    if (right < left) continue;
    const w = right - left + 1, h = bottom - top + 1, crop = new Uint8Array(w * h);
    for (let row = 0; row < h; row++) crop.set(pixels.subarray((top + row) * width + left, (top + row) * width + left + w), row * w);
    strips.push({ image: { width: w, height: h, pixels: crop }, x: left, y: top });
  }
  return strips;
}

/**
 * Glasses-side presentation: an unclipped CLEAR to black covers the whole frame (window surfaces,
 * shell chrome and anything else composed below), then the text strips draw over it with
 * transparent zero. A clear with no clip ignores stereo depth, so no edge strip of the content
 * below can show in either lens.
 */
export function hermesCoverList(strips: readonly { image: ListImage; x: number; y: number }[], originX: number, originY: number): DisplayList {
  const calls: ListCall[] = [{ op: DrawOp.CLEAR, color: 0 }];
  strips.forEach((strip, resource) => calls.push({ op: DrawOp.IMAGE, resource, x: originX + strip.x, y: originY + strip.y, transparent: true }));
  return { resources: strips.map((strip) => strip.image), calls };
}

/**
 * One final Hermes contribution on the shell surface, independent of the assistant overlay.
 *
 * It never holds text: `text()` re-reads the controller's validated message on each paint and
 * returns "" when listening is suspended/OFF, so a raw network payload cannot reach the lenses
 * through this layer.
 *
 * Opacity without a full-screen raster: a 640×480 raster at 4 bpp is 153 605 bytes, over the 64 KiB
 * resource cap, and encodeShellScene rejects it (the whole shell render then fails silently in the
 * controller log). Instead the layer retains a display list: CLEAR to black over the whole frame,
 * then the text band as strips that each fit one resource. Nothing but the contribution is visible
 * while it shows. This paint is not a display-off: the real off state is Shell.sleep(), applied by
 * the presenter when the contribution ends.
 */
export class HermesContributionLayer implements Layer {
  private retired = false;
  private scroll = 0;

  constructor(private readonly text: () => string, private readonly hooks: { dismiss(): void; removed(): void }) {}

  /** After retirement the layer is a transparent pass-through until the shell drops it. */
  retire(): void { this.retired = true; }
  isRetired(): boolean { return this.retired; }

  paint(ctx: LayerContext, paintBelow: PaintBelow): GrayImage {
    if (this.retired) return paintBelow();
    const { width, height } = ctx.stack.getBaseSize();
    const image = new GrayImage(width, height, 0);
    image.fillRect(0, 0, 1, 1, ANCHOR_VALUE);
    const text = this.text();
    const top = Math.max(0, Math.min(height - BAND_HEIGHT, minWindowTop()));
    const strips = text ? hermesTextStrips(this.paintBand(text, width - 2 * INSET_X).withDrawsBaked()) : [];
    image.drawDisplayList(hermesCoverList(strips, INSET_X, top), 0, 0, width, height);
    return image;
  }

  /** Title and wrapped text in band coordinates (origin at the band's top-left text inset). */
  private paintBand(text: string, available: number): GrayImage {
    const band = new GrayImage(available, BAND_HEIGHT, 0);
    const titleFont = getDefaultMediumFont(), font = getDefaultSmallFont();
    const step = lineStep(font);
    let y = 12;
    band.drawText(titleFont, 0, y, "Hermes", 200);
    y += lineStep(titleFont) + 6;
    const lines = text.split("\n").flatMap((paragraph) => wrapText(font, paragraph, available, { breakLongWords: true }));
    const capacity = Math.max(1, Math.floor((BAND_HEIGHT - 12 - y) / step));
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, lines.length - capacity)));
    const visible = lines.slice(this.scroll, this.scroll + capacity);
    const more = this.scroll + capacity < lines.length;
    visible.forEach((line, index) => {
      const last = index === visible.length - 1 && more;
      band.drawText(font, 0, y, last ? truncateText(font, `${line} …`, available) : line, 235);
      y += step;
    });
    return band;
  }

  handleInput(event: InputEvent, ctx: LayerContext): void {
    if (this.retired) return;
    if (event.type === "click" || event.type === "double-click") { this.hooks.dismiss(); return; }
    if (event.type === "scroll-down") this.scroll++;
    else if (event.type === "scroll-up") this.scroll = Math.max(0, this.scroll - 1);
    else return;
    ctx.actions.requestRender();
  }

  onRemoved(): void {
    this.retired = true;
    this.hooks.removed();
  }
}
