import { hermesReadingWindow } from "../../conversation-detection/hermes-reading";
import type { Layer } from "../layers";
import { HermesContributionLayer } from "./conversation-hermes-layer";
import { shell } from "./shell";

/**
 * Lens presentation for «Hermes en conversación».
 *
 * Product rule: while the experimental detector listens with Hermes armed, the lenses stay dark
 * (real Shell.sleep(), never a black paint) and show no transcript, verdicts, progress or errors.
 * Validated contributions and bounded call-limit notices are shown in a
 * shell overlay of its own that never touches the AssistantSession, chat history, tools or audio.
 *
 * This module reads the controller through a structural contract (no import of the controller),
 * so there is no initialization cycle between shell, apps and controller. It never selects Hermes,
 * never starts/stops capture and never calls the conversation channel.
 */

/** Subset of DashboardController the presentation reads. */
type PresentationReceipt = (() => void) & { isValid?(): boolean; validForMs?(): number };
export type HermesConversationSource = {
  readonly conversationHermesMessage: string;
  dismissConversationHermesMessage(): void;
  onConversationHermesChange(listener: () => void): () => void;
  readonly conversationHermes: { snapshot(): { enabled: boolean; listening: boolean; notice?: string; working?: boolean; link?: string; outputCalendarOffer?: boolean; outputVersion?: number; wearerTurnVersion?: number; presentationEpoch?: number }; capturePresentation?(): PresentationReceipt | null };
};

/** Shell display operations; the default port wraps the real Shell methods. */
export type HermesDisplayPort = {
  /** Real sleep when nothing explicit is open. Returns whether the screen went off. */
  blankForListening(): boolean;
  /** Push the overlay, waking a dark screen. null: refused (explicit interaction has priority). */
  present(layer: Layer, onYield: () => void): { woke: boolean } | null;
  /** Remove the overlay; restoreSleep re-sleeps only if nothing explicit opened meanwhile. */
  retire(layer: Layer, restoreSleep: boolean): void;
  repaint(layer: Layer): void;
  isVisible?(layer: Layer): boolean;
  holdForReading?(layer: Layer, reading: boolean): void;
};

export type HermesLayerFactory = (text: () => string, hooks: { dismiss(): void; removed(): void }) => Layer & { retire(): void };

/** Upper bound matching the transport's maximum assistance output. */
export const HERMES_LENS_MAX_CHARS = 1200;

/** Plain text for the lenses: no control characters, collapsed spaces, bounded length. */
export function sanitizeHermesText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let text = "";
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\n" || char === "\t" || char === "\r") text += char === "\n" ? "\n" : " ";
    else if (code >= 0x20 && !(code >= 0x7f && code <= 0x9f) && code !== 0x2028 && code !== 0x2029) text += char;
  }
  text = text.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  if (text.length > HERMES_LENS_MAX_CHARS) text = `${text.slice(0, HERMES_LENS_MAX_CHARS - 1).trimEnd()}…`;
  return text;
}

/**
 * Presentation counts for the phone metrics dialog, reset when Hermes is armed for a session.
 * Counts only: no text, timing or identity. `presented` means the overlay was pushed and a shell
 * render requested, not that the frame reached the glasses or was seen.
 */
export type HermesPresentationCounts = {
  presented: number; woke: number; replaced: number; refused: number; retired: number; released: number;
  visibleMs?: number; visibleResponses?: number;
};

type RetirementReason = "min" | "max" | "replaced" | "dismiss" | "off";
type ReadingEntry = { text: string; key: string; selectedAt: number; presentedAt: number | null;
  confirm: PresentationReceipt | null; valid: boolean; calendarOffer: boolean; wearerTurnAtAck: number; presentationEpoch: number };
export type HermesReadingClock = {
  now(): number;
  after(callback: () => void, ms: number): () => void;
  retired(entry: { visibleMs: number; reason: RetirementReason }): void;
};
const readingClock: HermesReadingClock = {
  now: () => Date.now(),
  after(callback, ms) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); },
  // Release builds strip console.*; write straight to logcat under its own tag (absent off-device).
  retired: (entry) => {
    try { if (typeof android !== "undefined") android.util.Log.i("FaceclawHermesUi", JSON.stringify(entry)); }
    catch { /* Diagnostics only. */ }
  },
};

function emptyCounts(): HermesPresentationCounts {
  return { presented: 0, woke: 0, replaced: 0, refused: 0, retired: 0, released: 0 };
}

/** Deduplicated presentation state machine. One instance per binding. */
export class HermesConversationPresenter {
  private counts = emptyCounts();
  private layer: (Layer & { retire(): void }) | null = null;
  private woke = false;
  /** Last controller message already handled (shown, refused or dismissed); "" after a clear. */
  private handled = "";
  private armed = false;
  /** Set on the arming edge; consumed once, the first time the armed session listens. */
  private darkPending = false;
  private disposed = false;
  private shown: ReadingEntry | null = null;
  private pending: ReadingEntry | null = null;
  /** At most the latest normal answer behind a protected pending offer. */
  private afterOffer: ReadingEntry | null = null;
  private presentationEpoch = 0;
  private cancelReadingTimer: (() => void) | null = null;
  /** Last text rendered, refused or dismissed on the lenses; "" once nothing is shown. */
  private rendered = "";

  constructor(private readonly source: HermesConversationSource, private readonly display: HermesDisplayPort,
    private readonly createLayer: HermesLayerFactory, private readonly armedChanged: () => void = () => {},
    private readonly clock: HermesReadingClock = readingClock) {}

  /** Called for every controller change; cheap and idempotent. */
  update(): void {
    if (this.disposed) return;
    const snapshot = this.snapshot();
    if (snapshot.enabled !== this.armed) {
      this.armed = snapshot.enabled;
      this.darkPending = snapshot.enabled;
      if (snapshot.enabled) this.counts = emptyCounts();
      this.armedChanged();
    }
    if (this.armed && this.darkPending && snapshot.listening) {
      // Once per armed session: entering listening turns the lenses off. Later pauses (chat, PTT,
      // keyboard) never re-blank on resume; the normal idle timeout handles a screen left on.
      this.darkPending = false;
      this.display.blankForListening();
    }
    const raw = this.source.conversationHermesMessage;
    const state = this.source.conversationHermes.snapshot();
    if (this.presentationEpoch !== (state.presentationEpoch ?? 0)) {
      this.presentationEpoch = state.presentationEpoch ?? 0;
      this.pending = null; this.afterOffer = null;
    }
    const key = state.outputVersion === undefined ? raw : `${state.outputVersion}:${raw}`;
    if (!snapshot.enabled || !snapshot.listening || state.link === "revocado") {
      // Suspended/OFF listening never shows a contribution, even one still pending expiry,
      // and that event is not shown later when listening resumes.
      this.handled = key;
      this.pending = null;
      this.afterOffer = null;
      this.finishShown("off");
      this.retire(true);
      return;
    }
    if (!raw) {
      this.handled = "";
      if (!this.pending?.calendarOffer) this.pending = null;
      this.afterOffer = null;
      if (this.shown && !this.shown.calendarOffer) { this.shown.valid = false; this.shown.confirm = null; }
    } else if (key !== this.handled) {
      this.handled = key;
      const entry: ReadingEntry = { text: sanitizeHermesText(raw), key, selectedAt: this.clock.now(),
        presentedAt: null, confirm: this.source.conversationHermes.capturePresentation?.() ?? null, valid: true,
        calendarOffer: state.outputCalendarOffer === true, wearerTurnAtAck: state.wearerTurnVersion ?? 0,
        presentationEpoch: this.presentationEpoch };
      if (entry.text) {
        if (this.pending?.calendarOffer && !entry.calendarOffer) this.afterOffer = entry;
        else { this.pending = entry; this.afterOffer = null; }
      }
    }
    this.pruneOffers();
    // Re-evaluate on accepted wearer turns too: a reply may have arrived before that turn.
    const replace = this.shown && !this.shown.calendarOffer && this.shown.presentedAt !== null
      && (state.wearerTurnVersion ?? 0) > this.shown.wearerTurnAtAck;
    if (this.pending && (!this.isReading() || replace)) this.select(this.takePending()!);
    this.advanceReading();
    this.show();
  }

  /** Render the current text once; an unchanged text (also one refused or dismissed) is not shown again. */
  private show(): void {
    const message = this.message();
    if (!message) { this.rendered = ""; this.retire(true); return; }
    if (message === this.rendered) return;
    this.rendered = message;
    this.renderMessage(message);
  }

  private renderMessage(message: string): void {
    if (!sanitizeHermesText(message)) return;
    if (this.layer) {
      // The same overlay changes text in place: one overlay, one wake.
      this.display.repaint(this.layer);
      this.updateReadingHold();
      return;
    }
    const layer = this.createLayer(() => this.liveText(), {
      dismiss: () => this.dismissByUser(layer),
      removed: () => this.released(layer),
    });
    this.layer = layer;
    const shown = this.display.present(layer, () => this.released(layer));
    if (!shown) {
      // An explicit interaction owns the display: this answer is dropped, never shown later.
      this.layer = null; this.counts.refused++;
      if (this.shown?.text === message) { this.cancelReadingTimer?.(); this.cancelReadingTimer = null; this.shown = null; }
      return;
    }
    this.counts.presented++;
    if (shown.woke) this.counts.woke++;
    if (this.layer === layer) this.woke = shown.woke;
    this.updateReadingHold();
  }

  /** Treat the controller's current message as already handled (restore/reconnect/bind): never shown. */
  ignoreExisting(): void {
    const raw = this.source.conversationHermesMessage, state = this.source.conversationHermes.snapshot();
    this.handled = state.outputVersion === undefined ? raw : `${state.outputVersion}:${raw}`;
  }

  isArmed(): boolean { return this.armed; }
  diagnostics(): HermesPresentationCounts { return { ...this.counts }; }
  hasOverlay(): boolean { return this.layer !== null; }

  capturePresentation(): (() => void) | null {
    const layer = this.layer, entry = this.shown;
    if (!layer || !entry || !this.liveText() || this.display.isVisible?.(layer) === false) return null;
    return () => {
      if (!this.disposed && this.layer === layer && this.shown === entry
        && this.liveText() && this.display.isVisible?.(layer) !== false) {
        // Text already on the lenses gets its reading window even if the controller cleared it
        // meanwhile (new turn); only a still-current answer sends the bridge receipt.
        if (entry.presentedAt === null) {
          entry.presentedAt = this.clock.now();
          entry.wearerTurnAtAck = this.source.conversationHermes.snapshot().wearerTurnVersion ?? 0;
          this.scheduleReading();
        }
        if (entry.valid) entry.confirm?.();
      }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.pending = null;
    this.afterOffer = null;
    this.finishShown("off");
    this.retire(false);
    this.disposed = true;
    if (this.armed) { this.armed = false; this.armedChanged(); }
  }

  private snapshot(): { enabled: boolean; listening: boolean } {
    try {
      const snapshot = this.source.conversationHermes.snapshot();
      return { enabled: Boolean(snapshot.enabled), listening: Boolean(snapshot.enabled && snapshot.listening) };
    } catch {
      return { enabled: false, listening: false };
    }
  }

  private message(): string {
    if (this.shown) return this.shown.text;
    if (this.source.conversationHermes.snapshot().working) return "…";
    return this.source.conversationHermes.snapshot().notice || "";
  }

  private isReading(): boolean {
    return !!this.shown && (this.shown.presentedAt === null
      || this.clock.now() - this.shown.presentedAt < hermesReadingWindow(this.shown.text, this.shown.calendarOffer).minMs);
  }

  private select(entry: ReadingEntry): void {
    if (this.shown) { this.finishShown("replaced"); this.counts.replaced++; }
    this.shown = entry;
    entry.selectedAt = this.clock.now();
    this.scheduleReading();
  }

  private takePending(): ReadingEntry | null {
    const next = this.pending;
    this.pending = this.afterOffer;
    this.afterOffer = null;
    return next;
  }

  private pruneOffers(): void {
    const usable = (entry: ReadingEntry) => !entry.calendarOffer
      || (entry.presentationEpoch === this.presentationEpoch && entry.confirm?.isValid?.() === true);
    if (this.pending && !usable(this.pending)) this.takePending();
    if (this.shown && !usable(this.shown)) this.finishShown("off");
  }

  private advanceReading(): void {
    this.pruneOffers();
    if (!this.shown && this.pending) this.select(this.takePending()!);
    const entry = this.shown;
    if (!entry) return;
    const age = this.clock.now() - (entry.presentedAt ?? entry.selectedAt);
    const window = hermesReadingWindow(entry.text, entry.calendarOffer, entry.presentedAt !== null);
    if (age >= window.maxMs || (!this.isReading() && (!entry.valid || this.pending))) {
      const next = this.takePending();
      if (next) this.select(next);
      else this.finishShown(age >= window.maxMs ? "max" : "min");
    } else if (!entry.valid && entry.presentedAt === null && !this.layer) this.finishShown("min");
    this.updateReadingHold();
  }

  private updateReadingHold(): void {
    if (this.layer) this.display.holdForReading?.(this.layer, this.isReading());
  }

  private scheduleReading(): void {
    this.cancelReadingTimer?.(); this.cancelReadingTimer = null;
    if (!this.shown) return;
    const entry = this.shown;
    const age = this.clock.now() - (entry.presentedAt ?? entry.selectedAt);
    const window = hermesReadingWindow(entry.text, entry.calendarOffer, entry.presentedAt !== null);
    const next = entry.presentedAt === null ? window.maxMs : age < window.minMs ? window.minMs : window.maxMs;
    const receiptMs = entry.calendarOffer ? entry.confirm?.validForMs?.() ?? 0 : Infinity;
    this.cancelReadingTimer = this.clock.after(() => {
      this.cancelReadingTimer = null;
      if (this.disposed) return;
      this.advanceReading();
      this.show();
      this.scheduleReading();
    }, Math.max(1, Math.min(next - age, receiptMs)));
    this.updateReadingHold();
  }

  private finishShown(reason: RetirementReason): void {
    this.cancelReadingTimer?.(); this.cancelReadingTimer = null;
    const entry = this.shown; this.shown = null;
    if (entry?.presentedAt !== null && entry?.presentedAt !== undefined) {
      const visibleMs = Math.max(0, this.clock.now() - entry.presentedAt);
      this.counts.visibleMs = (this.counts.visibleMs ?? 0) + visibleMs;
      this.counts.visibleResponses = (this.counts.visibleResponses ?? 0) + 1;
      this.clock.retired({ visibleMs, reason });
    }
    this.updateReadingHold();
  }

  /** The layer never stores text: every paint re-reads the controller's current validated message. */
  private liveText(): string {
    if (this.disposed) return "";
    if (this.shown?.calendarOffer && this.shown.confirm?.isValid?.() !== true) return "";
    const snapshot = this.snapshot();
    return snapshot.listening ? sanitizeHermesText(this.message()) : "";
  }

  private retire(restoreSleep: boolean): void {
    const layer = this.layer;
    if (!layer) return;
    const woke = this.woke;
    this.layer = null;
    this.woke = false;
    this.counts.retired++;
    layer.retire();
    this.display.retire(layer, restoreSleep && woke);
  }

  /** Tap on the overlay: clear through the controller, which notifies back and retires it. */
  private dismissByUser(layer: Layer): void {
    if (this.layer !== layer) return;
    const next = this.takePending();
    this.finishShown("dismiss");
    if (next) { this.select(next); this.rendered = next.text; this.renderMessage(next.text); return; }
    this.source.dismissConversationHermesMessage();
    // The controller always emits on dismiss; this covers a listener that failed to.
    if (this.layer === layer) this.retire(true);
  }

  /** Removed by another path (sleep, explicit interaction): never shown again for this event. */
  private released(layer: Layer & { retire(): void }): void {
    if (this.layer !== layer) return;
    this.pending = null;
    this.afterOffer = null;
    this.finishShown("dismiss");
    this.layer = null;
    this.woke = false;
    this.counts.released++;
    layer.retire();
    this.source.dismissConversationHermesMessage();
  }
}

let current: { source: HermesConversationSource; presenter: HermesConversationPresenter; dispose(): void } | null = null;
const presentationListeners = new Set<() => void>();

/** True while the bound controller has Hermes armed for the running session. */
export function hermesConversationPresentation(): boolean {
  if (!current) return false;
  try {
    return Boolean(current.source.conversationHermes.snapshot().enabled);
  } catch {
    return false;
  }
}

/** Presentation counts of the bound presenter (last armed session), or null when unbound. */
export function hermesPresentationDiagnostics(): HermesPresentationCounts | null {
  return current ? current.presenter.diagnostics() : null;
}

/** Notified on arming/disarming edges only (never per chunk or metric). */
export function onHermesConversationPresentation(listener: () => void): () => void {
  presentationListeners.add(listener);
  return () => presentationListeners.delete(listener);
}

function emitPresentation(): void {
  for (const listener of Array.from(presentationListeners)) {
    try { listener(); } catch (error) { console.warn("hermes presentation listener failed", error); }
  }
}

function shellDisplay(): HermesDisplayPort {
  return {
    blankForListening: () => shell.blankForIndependentListening(),
    present: (layer, onYield) => shell.presentIndependentOverlay(layer, onYield),
    retire: (layer, restoreSleep) => shell.retireIndependentOverlay(layer, restoreSleep),
    repaint: (layer) => shell.repaintIndependentOverlay(layer),
    isVisible: (layer) => shell.isIndependentOverlayVisible(layer),
    holdForReading: (layer, reading) => shell.holdIndependentOverlayForReading(layer, reading),
  };
}

/** Called immediately before shell paint; invoke only after a native frame finishes with `sent`. */
export function captureHermesPresentation(): (() => void) | null {
  return current?.presenter.capturePresentation() ?? null;
}

/**
 * Bind the lens presentation to the controller. Call once at startup, after the controller and the
 * shell exist (for example at the end of the DashboardController constructor, after shell.configure).
 * Binding does not show anything already pending, select Hermes, or start audio. The returned
 * function releases the subscription and removes a showing overlay without re-sleeping; call it
 * when the controller is torn down. A second bind replaces the first.
 */
export function bindHermesConversationUi(controller: HermesConversationSource,
  display: HermesDisplayPort = shellDisplay(),
  createLayer: HermesLayerFactory = (text, hooks) => new HermesContributionLayer(text, hooks)): () => void {
  current?.dispose();
  const presenter = new HermesConversationPresenter(controller, display, createLayer, emitPresentation);
  // A message present before binding (restore/reconnect) is treated as already handled: never shown.
  presenter.ignoreExisting();
  let unsubscribe: (() => void) | null = controller.onConversationHermesChange(() => presenter.update());
  const binding = {
    source: controller, presenter,
    dispose: () => {
      unsubscribe?.(); unsubscribe = null;
      presenter.dispose();
      if (current === binding) current = null;
    },
  };
  current = binding;
  presenter.update();
  return binding.dispose;
}

/** Phone control state; pure so the view model only formats it. */
export type HermesPhoneInput = {
  selected: boolean;
  supported: boolean;
  detectorOn: boolean;
  armed: boolean;
  listening: boolean;
  requests: number;
  episode: string;
  notice: string;
};

export function hermesPhoneButton(selected: boolean): string {
  return `Hermes en conversación: ${selected ? "ON" : "OFF"}`;
}

/** Diagnostic line for the phone only; never shown on the lenses. */
export function hermesPhoneStatus(input: HermesPhoneInput): string {
  if (input.notice) return input.notice;
  if (input.detectorOn && input.armed) {
    return `Activo en esta sesión · ${input.listening ? "escuchando" : "en pausa"} · episodio ${input.episode} · ${input.requests} evaluaciones`;
  }
  if (input.detectorOn && input.selected) return "Seleccionado, pero esta sesión no lo usa (requiere texto Soniox y modo conversación al iniciar). Cambia solo en OFF.";
  if (input.detectorOn) return "Cambia solo con la conversación OFF.";
  if (input.selected && !input.supported) return "Seleccionado · el puente actual no anuncia conv/1, no se activará.";
  if (input.selected) return "Seleccionado para el próximo ON (solo RAM). No implica que el servidor haya recibido nada.";
  if (!input.supported) return "No disponible: el puente no anuncia conv/1.";
  return "OFF · solo RAM. Se aplica al iniciar la conversación.";
}

/**
 * One explicit tap. Never starts audio: it only asks the controller to change the RAM selection and
 * reports a brief notice when the controller refuses (no false ON).
 */
export function toggleHermesSelection(controller: {
  conversationHermesSelected(): boolean;
  setConversationHermesSelected(enabled: boolean): boolean;
}, detectorOn: boolean): string {
  const wanted = !controller.conversationHermesSelected();
  if (controller.setConversationHermesSelected(wanted)) return "";
  if (detectorOn) return "Cambia solo con la conversación OFF.";
  return wanted ? "No disponible: el puente no anuncia conv/1. Sigue OFF." : "No se pudo cambiar. Reintenta con la conversación OFF.";
}
