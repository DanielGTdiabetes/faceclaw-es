import { G2_LENS_WIDTH, type GrayImage } from "../../graphics/image";
import { truncateText } from "../../graphics/textwrap";
import { getDefaultSmallFont } from "../../graphics/ui-fonts";
import type { InputEvent } from "../gestures";
import type { Layer, LayerContext } from "../layers";
import { MIN_WINDOW_HEIGHT, minWindowTop } from "./geometry";

// Same box as the assistant reply dialog (input-dialog.ts), so the picture
// sits exactly over the answer it belongs to.
const BOX_X = 40;
const BOX_W = G2_LENS_WIDTH - 80;
const BOX_MARGIN_Y = 28;
const BOX_H = MIN_WINDOW_HEIGHT - 2 * BOX_MARGIN_Y;
const INSET_X = 16;
const INSET_Y = 8;

/**
 * A picture from the assistant (glasses.show_image): a solid box with the
 * image centered and an optional caption line under it. Auto-dismisses after
 * `seconds`; a click or double-click dismisses it early. The image is
 * lens-ready (quantized, no zero pixels) and baked with bitBlt, not retained
 * as a deferred draw: it is one-off content, not a cacheable icon.
 */
export class ShellImageLayer implements Layer {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly image: GrayImage,
    private readonly caption: string,
    seconds: number,
    private readonly onDismiss: () => void,
  ) {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onDismiss();
    }, seconds * 1000);
  }

  paint(_ctx: LayerContext, paintBelow: () => GrayImage): GrayImage {
    const canvas = paintBelow();
    const top = minWindowTop() + BOX_MARGIN_Y;
    // Fill 1, not 0: identical on the lenses, but 0 is the shell surface's color key.
    canvas.fillRect(BOX_X, top, BOX_W, BOX_H, 1);
    canvas.drawRect(BOX_X, top, BOX_W, BOX_H, 90);
    const font = getDefaultSmallFont();
    const captionH = this.caption ? font.lineHeight + 4 : 0;
    const areaW = BOX_W - 2 * INSET_X;
    const areaH = BOX_H - 2 * INSET_Y - captionH;
    const x = BOX_X + INSET_X + Math.max(0, ((areaW - this.image.width) / 2) | 0);
    const y = top + INSET_Y + Math.max(0, ((areaH - this.image.height) / 2) | 0);
    canvas.bitBlt(this.image, x, y, { width: Math.min(this.image.width, areaW), height: Math.min(this.image.height, areaH) });
    if (this.caption) {
      const text = truncateText(font, this.caption, areaW);
      const textX = BOX_X + INSET_X + Math.max(0, ((areaW - font.measureText(text)) / 2) | 0);
      canvas.drawText(font, textX, top + BOX_H - INSET_Y - font.lineHeight, text, 220);
    }
    return canvas;
  }

  handleInput(event: InputEvent, _ctx: LayerContext): void {
    if (event.type === "click" || event.type === "double-click") {
      this.clearTimer();
      this.onDismiss();
    }
  }

  onRemoved(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
