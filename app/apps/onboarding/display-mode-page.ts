import type { GrayImage } from "../../graphics/image";
import { wrapText } from "../../graphics/textwrap";
import { displayLayoutSetting, type DisplayLayout } from "../../ui/dashboard-settings";
import type { InputEvent } from "../../ui/gestures";
import { Menu, type MenuDrawArgs } from "../../ui/menu-core";
import { LIST_ROW_TEXT_INSET, listRowHeight } from "../../ui/metrics";
import { onboardingFont } from "./onboarding-fonts";
import { drawPageHeading, PAGE_X, type OnboardingNav, type OnboardingPage } from "./onboarding-page";

const CONTENT_GAP = 10;
const BOTTOM_MARGIN = 8;
const COLUMN_GAP = 16;

const DESCRIPTIONS = {
  band: "La banda original de 288 px, a esta altura de tu campo de visión, dejando libre el resto.",
  tall: "Las ventanas ocupan todo el alto de la pantalla.",
  fullscreen: "Todo el alto y todo el ancho de la pantalla. La profundidad se desactiva, porque las ventanas llegan a los bordes.",
};

/**
 * The display mode: how much of the display windows use (a band at one of
 * five heights, Tall, or Full Screen where the layout allows it), with a
 * line about the selected one. Not immersive, and the mode is saved as the
 * selection moves, so this window itself shows each mode as it really is
 * (the dashboard controller moves or resizes it, and every other window).
 * A tap without moving keeps the saved mode, even a Full Screen the current
 * layout shows as Tall (faceclaw-es).
 */
export class DisplayModePage implements OnboardingPage {
  private readonly menu = new Menu<DisplayLayout>({
    wrap: false,
    rowGap: 2,
    highlight: { radius: 8 },
    getHeight: () => listRowHeight(onboardingFont("body")),
    draw: (args) => this.drawRow(args),
  });

  enter(): void {
    // Full Screen comes and goes with the layout; where the layout doesn't
    // allow it, a saved Full Screen shows as Tall, as the shell does.
    const values = displayLayoutSetting.values.filter((value) => !displayLayoutSetting.isDisabled(value));
    const index = values.indexOf(displayLayoutSetting.get());
    this.menu.setItems(values, index >= 0 ? index : values.indexOf("tall"));
  }

  paint(image: GrayImage, focused: boolean): void {
    const top = drawPageHeading(
      image,
      "Modo de pantalla",
      "Desliza para elegir cuánta pantalla usan las ventanas; cambia al momento. Toca para continuar.",
    ) + CONTENT_GAP;
    const body = onboardingFont("body");
    const columnWidth = 20 + Math.max(...this.menu.items.map((value) => body.measureText(displayLayoutSetting.displayValue(value))));
    const menuBox = { x: PAGE_X - 10, y: top, width: columnWidth, height: image.height - top - BOTTOM_MARGIN };
    this.menu.paint(image, menuBox, focused);
    const layout = this.menu.selectedItem;
    if (layout === null) return;
    const detail = onboardingFont("detail");
    const left = menuBox.x + columnWidth + COLUMN_GAP;
    let y = top + LIST_ROW_TEXT_INSET;
    for (const line of wrapText(detail, description(layout), image.width - PAGE_X - left)) {
      if (y + detail.lineHeight > image.height - BOTTOM_MARGIN) break;
      image.drawText(detail, left, y, line, 170);
      y += detail.lineHeight;
    }
  }

  handleInput(event: InputEvent, nav: OnboardingNav): void {
    switch (event.type) {
      case "scroll-up":
      case "scroll-down":
        void this.menu.handleInput(event);
        this.apply();
        return;
      case "click":
        nav.next();
        return;
      default:
        return;
    }
  }

  private apply(): void {
    const layout = this.menu.selectedItem;
    if (layout !== null && layout !== displayLayoutSetting.get()) displayLayoutSetting.set(layout);
  }

  private drawRow({ image, item: layout, x, y, selected }: MenuDrawArgs<DisplayLayout>): void {
    image.drawText(onboardingFont("body"), x + 10, y + LIST_ROW_TEXT_INSET, displayLayoutSetting.displayValue(layout), selected ? 255 : 190);
  }
}

function description(layout: DisplayLayout): string {
  return layout === "tall" || layout === "fullscreen" ? DESCRIPTIONS[layout] : DESCRIPTIONS.band;
}
