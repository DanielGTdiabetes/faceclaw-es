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

/**
 * One final Hermes contribution on the shell surface, independent of the assistant overlay.
 *
 * It never holds text: `text()` re-reads the controller's validated message on each paint and
 * returns "" when listening is suspended/OFF, so a raw network payload cannot reach the lenses
 * through this layer. Opaque near-black (value 1) covers the windows beneath, so nothing but the
 * contribution is visible while it shows. This paint is not a display-off: the real off state is
 * Shell.sleep(), applied by the presenter when the contribution ends.
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
    image.fillRect(0, 0, width, height, 1);
    const text = this.text();
    if (!text) return image;
    const titleFont = getDefaultMediumFont(), font = getDefaultSmallFont();
    const available = width - 2 * INSET_X, step = lineStep(font);
    const top = Math.max(0, Math.min(height - BAND_HEIGHT, minWindowTop()));
    let y = top + 12;
    image.drawText(titleFont, INSET_X, y, "Hermes", 200);
    y += lineStep(titleFont) + 6;
    const lines = text.split("\n").flatMap((paragraph) => wrapText(font, paragraph, available, { breakLongWords: true }));
    const capacity = Math.max(1, Math.floor((top + BAND_HEIGHT - 12 - y) / step));
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, lines.length - capacity)));
    const visible = lines.slice(this.scroll, this.scroll + capacity);
    const more = this.scroll + capacity < lines.length;
    visible.forEach((line, index) => {
      const last = index === visible.length - 1 && more;
      image.drawText(font, INSET_X, y, last ? truncateText(font, `${line} …`, available) : line, 235);
      y += step;
    });
    return image;
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
