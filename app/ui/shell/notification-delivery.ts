import { HermesContributionLayer } from "./conversation-hermes-layer";
import { shell } from "./shell";

let active: { layer: HermesContributionLayer; confirm: () => void; close: () => void; confirmed: boolean } | null = null;

/** The same independent overlay used by conversation; never steals an explicit interaction. */
export function presentHermesNotification(text: string, confirm: () => void): (() => void) | null {
  // presentIndependentOverlay would silently retire a visible conversation contribution: refuse instead,
  // so the router falls back to Telegram.
  if (active || shell.hasIndependentOverlay()) return null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let woke = false;
  const layer = new HermesContributionLayer(() => text, { dismiss: () => close(), removed: () => close() });
  const close = () => {
    if (active?.layer !== layer) return;
    active = null;
    if (timer !== null) clearTimeout(timer);
    layer.retire();
    shell.retireIndependentOverlay(layer, woke);
  };
  active = { layer, confirm, close, confirmed: false };
  const shown = shell.presentIndependentOverlay(layer, close);
  if (!shown) { active = null; layer.retire(); return null; }
  woke = shown.woke;
  timer = setTimeout(close, 12_000);
  return close;
}

/** Capture before painting; invoke ONLY after native BLE frame completion on the same display. */
export function captureNotificationPresentation(): (() => void) | null {
  const current = active;
  if (!current || current.confirmed || !shell.isIndependentOverlayVisible(current.layer)) return null;
  return () => {
    if (active !== current || current.confirmed || !shell.isIndependentOverlayVisible(current.layer)) return;
    current.confirmed = true;
    current.confirm();
  };
}
