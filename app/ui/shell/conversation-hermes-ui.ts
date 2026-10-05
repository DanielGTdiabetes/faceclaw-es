import type { Layer } from "../layers";
import { HermesContributionLayer } from "./conversation-hermes-layer";
import { shell } from "./shell";

/**
 * Lens presentation for «Hermes en conversación».
 *
 * Product rule: while the experimental detector listens with Hermes armed, the lenses stay dark
 * (real Shell.sleep(), never a black paint) and show no transcript, verdicts, progress or errors.
 * Only the controller's validated final contribution (`conversationHermesMessage`) is shown, in a
 * shell overlay of its own that never touches the AssistantSession, chat history, tools or audio.
 *
 * This module reads the controller through a structural contract (no import of the controller),
 * so there is no initialization cycle between shell, apps and controller. It never selects Hermes,
 * never starts/stops capture and never calls the conversation channel.
 */

/** Subset of DashboardController the presentation reads. */
export type HermesConversationSource = {
  readonly conversationHermesMessage: string;
  dismissConversationHermesMessage(): void;
  onConversationHermesChange(listener: () => void): () => void;
  readonly conversationHermes: { snapshot(): { enabled: boolean; listening: boolean } };
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

/** Deduplicated presentation state machine. One instance per binding. */
export class HermesConversationPresenter {
  private layer: (Layer & { retire(): void }) | null = null;
  private woke = false;
  /** Last controller message already handled (shown, refused or dismissed); "" after a clear. */
  private handled = "";
  private armed = false;
  /** Set on the arming edge; consumed once, the first time the armed session listens. */
  private darkPending = false;
  private disposed = false;

  constructor(private readonly source: HermesConversationSource, private readonly display: HermesDisplayPort,
    private readonly createLayer: HermesLayerFactory, private readonly armedChanged: () => void = () => {}) {}

  /** Called for every controller change; cheap and idempotent. */
  update(): void {
    if (this.disposed) return;
    const snapshot = this.snapshot();
    if (snapshot.enabled !== this.armed) {
      this.armed = snapshot.enabled;
      this.darkPending = snapshot.enabled;
      this.armedChanged();
    }
    if (this.armed && this.darkPending && snapshot.listening) {
      // Once per armed session: entering listening turns the lenses off. Later pauses (chat, PTT,
      // keyboard) never re-blank on resume; the normal idle timeout handles a screen left on.
      this.darkPending = false;
      this.display.blankForListening();
    }
    const message = this.source.conversationHermesMessage;
    if (!message) {
      this.handled = "";
      this.retire(true);
      return;
    }
    if (!snapshot.enabled || !snapshot.listening) {
      // Suspended/OFF listening never shows a contribution, even one still pending expiry,
      // and that event is not shown later when listening resumes.
      this.handled = message;
      this.retire(true);
      return;
    }
    if (message === this.handled) return;
    this.handled = message;
    if (!sanitizeHermesText(message)) return;
    if (this.layer) {
      // A newer validated contribution replaces the text in place: one overlay, one wake.
      this.display.repaint(this.layer);
      return;
    }
    const layer = this.createLayer(() => this.liveText(), {
      dismiss: () => this.dismissByUser(layer),
      removed: () => this.released(layer),
    });
    this.layer = layer;
    const shown = this.display.present(layer, () => this.released(layer));
    if (!shown) { this.layer = null; return; }
    if (this.layer === layer) this.woke = shown.woke;
  }

  /** Treat the controller's current message as already handled (restore/reconnect/bind): never shown. */
  ignoreExisting(): void { this.handled = this.source.conversationHermesMessage; }

  isArmed(): boolean { return this.armed; }
  hasOverlay(): boolean { return this.layer !== null; }

  dispose(): void {
    if (this.disposed) return;
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

  /** The layer never stores text: every paint re-reads the controller's current validated message. */
  private liveText(): string {
    if (this.disposed) return "";
    const snapshot = this.snapshot();
    return snapshot.listening ? sanitizeHermesText(this.source.conversationHermesMessage) : "";
  }

  private retire(restoreSleep: boolean): void {
    const layer = this.layer;
    if (!layer) return;
    const woke = this.woke;
    this.layer = null;
    this.woke = false;
    layer.retire();
    this.display.retire(layer, restoreSleep && woke);
  }

  /** Tap on the overlay: clear through the controller, which notifies back and retires it. */
  private dismissByUser(layer: Layer): void {
    if (this.layer !== layer) return;
    this.source.dismissConversationHermesMessage();
    // The controller always emits on dismiss; this covers a listener that failed to.
    if (this.layer === layer) this.retire(true);
  }

  /** Removed by another path (sleep, explicit interaction): never shown again for this event. */
  private released(layer: Layer & { retire(): void }): void {
    if (this.layer !== layer) return;
    this.layer = null;
    this.woke = false;
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
  };
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
