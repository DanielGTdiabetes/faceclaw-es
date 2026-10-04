import { GrayImage } from "../../graphics/image";
import { getDefaultMediumFont, getDefaultSmallFont } from "../../graphics/ui-fonts";
import { truncateText, wrapText } from "../../graphics/textwrap";
import { conversationDetail } from "../../conversation-detection/conversation-ui";
import {
  conversationSession, conversationTextSelected, lensConversationPlan,
  onConversationTextSelected, setConversationTextSelected, toggleLensConversation,
  type ConversationSessionPort,
} from "../../conversation-detection/session-controls";
import { type InputEvent } from "../../ui/gestures";
import { type Layer, type LayerContext } from "../../ui/layers";
import { lineStep } from "../../ui/metrics";
import { createInProcessWindow, type InProcessAppOptions, type InProcessWindow } from "../../ui/shell/in-process-window";
import { shell } from "../../ui/shell/shell";

export const CONVERSATION_WINDOW_ID = "local-conversation";
export const CONVERSATION_SURFACE_ID = "window:local-conversation";

/** Reads the current epoch directly; never caches or attributes transcript text. */
export class LocalConversationLayer implements Layer {
  private scrollBack = 0;
  private lastEpoch = -1;
  constructor(private readonly session: ConversationSessionPort) {}

  paint(ctx: LayerContext): GrayImage {
    const { width, height } = ctx.stack.getBaseSize();
    const image = new GrayImage(width, height, 0);
    const font = getDefaultSmallFont(), titleFont = getDefaultMediumFont();
    const step = lineStep(font), inset = 8, available = width - 2 * inset;
    const snapshot = this.session.detector.snapshot();
    if (snapshot.epoch !== this.lastEpoch) { this.scrollBack = 0; this.lastEpoch = snapshot.epoch; }
    const plan = lensConversationPlan(this.session);
    const state = snapshot.enabled ? snapshot.state : snapshot.state === "error" ? "OFF · error" : "OFF";
    image.drawText(titleFont, inset, inset, truncateText(titleFont, `Conversación local · ${state}`, available), 255);
    let y = inset + lineStep(titleFont) + 4;
    const profile = this.session.detector.ownProfileState();
    image.drawText(font, inset, y, truncateText(font,
      `Mi perfil: ${profile} · Texto: ${(snapshot.enabled ? snapshot.transcription?.enabled : conversationTextSelected()) ? "ON" : "OFF"}`, available), 180);
    y += step;
    const detail = conversationDetail(snapshot, plan.hint);
    const lines = wrapText(font, detail, available);
    // Keep the deadline visible independently of a long reason or error message.
    if (snapshot.enabled) {
      image.drawText(font, inset, y, `${Math.ceil(snapshot.remainingMs / 1000)} s restantes · máximo 2 min`, 220);
      y += step;
    }
    const footerY = height - 2 * step - inset;
    const detailCount = Math.min(3, Math.max(1, Math.floor((footerY - y) / step) - 2));
    for (const line of lines.slice(0, detailCount)) {
      image.drawText(font, inset, y, line, 180); y += step;
    }
    y += 4;
    const text = snapshot.enabled && snapshot.state === "escuchando" && snapshot.transcription?.enabled
      ? this.session.detector.transcriptText() : "";
    const emptyText = !snapshot.enabled ? "Abrir esta app mantiene la captura OFF."
      : !snapshot.transcription?.enabled ? "Sin transcripción · comparación local provisional"
      : snapshot.state === "escuchando" ? "Texto temporal · esperando voz aprovechable" : "Texto borrado mientras la captura está suspendida.";
    const textLines = wrapText(font, text || emptyText, available);
    const count = Math.max(0, Math.floor((footerY - y - 4) / step));
    this.scrollBack = Math.min(this.scrollBack, Math.max(0, textLines.length - count));
    const end = Math.max(count, textLines.length - this.scrollBack);
    for (const line of textLines.slice(Math.max(0, end - count), end)) {
      image.drawText(font, inset, y, line, text ? 255 : 140); y += step;
    }
    image.drawText(font, inset, footerY, truncateText(font,
      snapshot.enabled ? "Toque: OFF · doble toque: OFF y salir" : `Toque: ${plan.canStart ? "iniciar (2 min)" : plan.button} · doble: salir`, available), 220);
    image.drawText(font, inset, footerY + step, truncateText(font,
      "Menú: texto ON/OFF · rueda: texto · indicios provisionales", available), 140);
    return image;
  }

  handleInput(event: InputEvent): void {
    if (event.type === "click") { toggleLensConversation(this.session); this.scrollBack = 0; }
    else if (event.type === "double-click") {
      this.session.setEnabled(false);
      shell.yieldFocusToSidebar();
    } else if (event.type === "scroll-up") this.scrollBack++;
    else if (event.type === "scroll-down") this.scrollBack = Math.max(0, this.scrollBack - 1);
  }
}

export function createLocalConversationWindow(options: InProcessAppOptions): InProcessWindow {
  const session = conversationSession();
  let closed = false, closeTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe = () => {}, unsubscribeChoice = () => {};
  const cancelPoll = () => { if (closeTimer !== null) clearTimeout(closeTimer); closeTimer = null; };
  const app = createInProcessWindow({
    appId: "local-conversation", windowId: CONVERSATION_WINDOW_ID,
    title: "Conversación local", iconLetter: "C", icon: "message-circle", closeable: true,
    actions: options.actions, baseLayer: new LocalConversationLayer(session),
    menuItems: () => {
      const stopping = session.detector.snapshot().enabled;
      return [
      { label: lensConversationPlan(session).button, onSelect: (ctx) => {
        ctx.stack.pop();
        // A stop menu opened before expiry must never start a new session after expiry.
        if (stopping) session.setEnabled(false); else toggleLensConversation(session);
      } },
      { label: `Texto local: ${conversationTextSelected() ? "ON" : "OFF"}`,
        description: "Cambiar solo en OFF. Texto temporal es/valencià, sin envío al asistente.",
        onSelect: (ctx) => { ctx.stack.pop(); setConversationTextSelected(!conversationTextSelected()); } },
      { label: "Detener (OFF)", onSelect: (ctx) => { ctx.stack.pop(); session.setEnabled(false); } },
      ];
    },
    submitFrame: options.submitFrame, setSurfaceVisible: options.setSurfaceVisible,
    removeSurface: options.removeSurface, reconfigureSurface: options.reconfigureSurface,
    onForegroundChanged: (foreground) => { if (foreground && !closed) app.requestRender(); },
    onClosed: () => {
      closed = true; cancelPoll(); unsubscribe(); unsubscribeChoice();
      session.setEnabled(false);
      options.onClosed();
    },
  });
  const refresh = (pollsLeft = 60) => {
    if (closed) return;
    cancelPoll();
    const snapshot = session.detector.snapshot();
    // Clear old text on every invalidation even when hidden; no periodic paint in OFF.
    if (!snapshot.enabled || snapshot.state !== "escuchando" || shell.isWindowVisible(CONVERSATION_WINDOW_ID)) app.requestRender();
    const draining = snapshot.participation?.worker || snapshot.participation?.busy || snapshot.transcription?.worker || snapshot.transcription?.busy;
    if (!snapshot.enabled && draining && pollsLeft > 0) closeTimer = setTimeout(() => refresh(pollsLeft - 1), 500);
  };
  unsubscribe = session.detector.subscribe(() => refresh());
  unsubscribeChoice = onConversationTextSelected(() => refresh());
  return app;
}
