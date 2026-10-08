import { GrayImage } from "../../graphics/image";
import { getDefaultMediumFont, getDefaultSmallFont } from "../../graphics/ui-fonts";
import { truncateText, wrapText } from "../../graphics/textwrap";
import { conversationDetail, textLanguageLabel, wearerLine } from "../../conversation-detection/conversation-ui";
import {
  conversationSession, conversationTextLanguage, conversationTextSelected, lensConversationPlan,
  onConversationTextSelected, setConversationTextSelected, toggleLensConversation, wearerActions, wearerChoices,
  type ConversationSessionPort,
  CONVERSATION_MODELS, conversationModel, setConversationModel, conversationUsesHermes, setConversationUsesHermes,
  setConversationTextLanguage,
} from "../../conversation-detection/session-controls";
import { openModalMenu, type MenuItem } from "../../ui/menu";
import { type InputEvent } from "../../ui/gestures";
import { type Layer, type LayerContext } from "../../ui/layers";
import { lineStep } from "../../ui/metrics";
import { createInProcessWindow, type InProcessAppOptions, type InProcessWindow } from "../../ui/shell/in-process-window";
import { shell } from "../../ui/shell/shell";
import { hermesConversationPresentation, onHermesConversationPresentation } from "../../ui/shell/conversation-hermes-ui";
import { conversationModelLabel, conversationModelOption } from "../../native/conversation-model-options";
import { asrModelState, onAsrModelStateChanged, startAsrModelDownload, cancelAsrModelDownload } from "../../native/asr-model";

export const CONVERSATION_WINDOW_ID = "local-conversation";
export const CONVERSATION_SURFACE_ID = "window:local-conversation";
/** Hermes armed for this session. Fail-safe: an unavailable presentation module keeps the classic view. */
function hermesArmed(): boolean {
  try { return hermesConversationPresentation(); } catch { return false; }
}

/** Hermes mode on the lenses: no transcript, no verdicts; only Hermes' final contributions appear (shell overlay). */
export const HERMES_LISTENING_LINE = "Hermes en conversación · lentes apagadas mientras escucha · solo verás sus aportaciones";

/** Reads the current epoch directly; never caches or attributes transcript text. */
export class LocalConversationLayer implements Layer {
  private scrollBack = 0;
  private lastEpoch = -1;
  private notice = "";
  constructor(private readonly session: ConversationSessionPort) {}

  paint(ctx: LayerContext): GrayImage {
    const { width, height } = ctx.stack.getBaseSize();
    const image = new GrayImage(width, height, 0);
    const font = getDefaultSmallFont(), titleFont = getDefaultMediumFont();
    const step = lineStep(font), inset = 8, available = width - 2 * inset;
    const snapshot = this.session.detector.snapshot();
    if (snapshot.epoch !== this.lastEpoch) { this.scrollBack = 0; this.lastEpoch = snapshot.epoch; }
    if (this.session.setManualEnabled) {
      const state = snapshot.enabled ? "ON" : "OFF";
      image.drawText(titleFont, inset, inset, `Conversación · ${state}`, 255);
      const detail = snapshot.enabled ? conversationUsesHermes() ? HERMES_LISTENING_LINE
        : snapshot.state === "escuchando" ? this.session.detector.transcriptText() || "Escuchando todas las voces…"
        : snapshot.reason
        : this.notice || `${conversationModelLabel()} · ${conversationUsesHermes() ? "Texto y Hermes" : "Solo texto"}. Elige motor y modo en el menú. Máximo 20 min; termina tras más de 5 min sin voz.`;
      let y = inset + lineStep(titleFont) + 4;
      const lines = wrapText(font, detail, available);
      const count = Math.max(1, Math.floor((height - y - 2 * step - inset) / step));
      this.scrollBack = Math.min(this.scrollBack, Math.max(0, lines.length - count));
      const end = snapshot.enabled && !conversationUsesHermes() ? Math.max(count, lines.length - this.scrollBack) : count;
      for (const line of lines.slice(Math.max(0, end - count), end)) {
        image.drawText(font, inset, y, line, 180); y += step;
      }
      image.drawText(font, inset, height - 2 * step - inset, snapshot.enabled ? "Toque: detener" : "Toque: iniciar conversación", 220);
      image.drawText(font, inset, height - step - inset, "Doble toque: detener y salir", 140);
      return image;
    }
    const plan = lensConversationPlan(this.session);
    const state = snapshot.enabled ? snapshot.state : snapshot.state === "error" ? "OFF · error" : "OFF";
    image.drawText(titleFont, inset, inset, truncateText(titleFont, `Conversación local · ${state}`, available), 255);
    let y = inset + lineStep(titleFont) + 4;
    const profile = this.session.detector.ownProfileState();
    image.drawText(font, inset, y, truncateText(font,
      `Perfil: ${profile} · Texto: ${(snapshot.enabled ? snapshot.transcription?.enabled : conversationTextSelected()) ?
        ((snapshot.enabled ? snapshot.languageMode : conversationTextLanguage()) === "es" ? "castellano" : "auto") : "OFF"}`, available), 180);
    y += step;
    // S2: wearer association (or the phrase to say) on its own line while ON; never an alert.
    const wearer = wearerLine(snapshot);
    if (wearer) {
      image.drawText(font, inset, y, truncateText(font, wearer, available), 255);
      y += step;
    }
    // The deadline has its own line below; the detail must not repeat it.
    const detail = conversationDetail(snapshot, plan.hint, false);
    const lines = wrapText(font, detail, available);
    // Keep the deadline visible independently of a long reason or error message.
    if (snapshot.enabled) {
      image.drawText(font, inset, y, `${Math.ceil(snapshot.remainingMs / 1000)} s restantes · máximo ${(snapshot.sessionLimitMs ?? 120_000) / 60_000} min`, 220);
      y += step;
    }
    const footerY = height - 2 * step - inset;
    const detailCount = Math.min(3, Math.max(1, Math.floor((footerY - y) / step) - 2));
    for (const line of lines.slice(0, detailCount)) {
      image.drawText(font, inset, y, line, 180); y += step;
    }
    y += 4;
    if (snapshot.enabled && hermesArmed()) {
      // Hermes armed: the transcript is never read nor drawn on the lenses.
      for (const line of wrapText(font, HERMES_LISTENING_LINE, available).slice(0, Math.max(1, Math.floor((footerY - y - 4) / step)))) {
        image.drawText(font, inset, y, line, 180); y += step;
      }
      image.drawText(font, inset, footerY, truncateText(font, "Toque: OFF · doble toque: OFF y salir", available), 220);
      image.drawText(font, inset, footerY + step, truncateText(font, "Menú: identificación de voz y controles", available), 140);
      return image;
    }
    const text = snapshot.enabled && snapshot.state === "escuchando" && snapshot.transcription?.enabled
      ? this.session.detector.transcriptText() : "";
    const emptyText = !snapshot.enabled ? "Abrir esta app mantiene la captura OFF."
      : !snapshot.transcription?.enabled ? "Sin transcripción · comparación local provisional"
      : snapshot.state === "escuchando" ? "Escuchando todas las voces · primer texto en unos 7 s, luego cada 3 s" : "Texto borrado mientras la captura está suspendida.";
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
      "Rueda: texto · provisional; puede errar con ruido", available), 140);
    return image;
  }

  handleInput(event: InputEvent): void {
    if (event.type === "click") {
      this.notice = this.session.setManualEnabled
        ? this.session.setManualEnabled(!this.session.detector.snapshot().enabled) : toggleLensConversation(this.session);
      this.scrollBack = 0;
    }
    else if (event.type === "double-click") {
      this.session.setEnabled(false);
      shell.yieldFocusToSidebar();
    } else if (event.type === "scroll-up") this.scrollBack++;
    else if (event.type === "scroll-down") this.scrollBack = Math.max(0, this.scrollBack - 1);
  }
}

/**
 * S2: identification actions plus «Soy la voz…», a list of every label of the live stream. The list
 * is built when opened and carries that session/stream, so a menu kept across OFF/ON assigns nothing.
 */
export function wearerMenuItems(session: ConversationSessionPort): MenuItem[] {
  const items: MenuItem[] = wearerActions(session.detector).map((action) => ({
    label: action.label, onSelect: (ctx) => { ctx.stack.pop(); action.run(); },
  }));
  if (wearerChoices(session.detector).length) {
    items.push({ label: "Soy la voz…", description: "Elegir o corregir qué voz eres. Cancela un intento pendiente.",
      onSelect: (ctx) => {
        ctx.stack.pop();
        const choices = wearerChoices(session.detector);
        if (!choices.length) return;
        openModalMenu(ctx, "¿Cuál es tu voz?", choices.map((choice) => ({
          label: choice.label, onSelect: (inner) => { inner.stack.pop(); choice.run(); },
        })));
      } });
  }
  return items;
}

export function createLocalConversationWindow(options: InProcessAppOptions): InProcessWindow {
  const session = conversationSession();
  let closed = false, closeTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe = () => {}, unsubscribeChoice = () => {}, unsubscribeHermes = () => {};
  /** Hermes mode paints only on visible changes (state, seconds, wearer line), never per text chunk. */
  let hermesPaintKey = "";
  const cancelPoll = () => { if (closeTimer !== null) clearTimeout(closeTimer); closeTimer = null; };
  const app = createInProcessWindow({
    appId: "local-conversation", windowId: CONVERSATION_WINDOW_ID,
    title: "Conversación", iconLetter: "C", icon: "message-circle", closeable: true,
    actions: options.actions, baseLayer: new LocalConversationLayer(session),
    menuItems: () => {
      const opened = session.detector.snapshot();
      const stopping = opened.enabled;
      if (session.setManualEnabled) {
        const model = conversationModel();
        return [{
          label: `${conversationUsesHermes() ? "Hermes en conversación" : "Solo texto"}: ${stopping ? "ON · detener" : "OFF · iniciar"}`,
          onSelect: (ctx) => { ctx.stack.pop();
            if (stopping) session.setManualEnabled!(false);
            else if (!session.detector.snapshot().enabled) session.setManualEnabled!(true);
          },
        }, ...(stopping ? [] : [{ label: `Motor: ${conversationModelLabel()}`, onSelect: (ctx: LayerContext) => {
          ctx.stack.pop();
          if (session.detector.snapshot().enabled) return;
          openModalMenu(ctx, "Motor de conversación", CONVERSATION_MODELS.map((id) => ({
            label: conversationModelOption(id), onSelect: (inner) => { inner.stack.pop(); setConversationModel(id); },
          })));
        } }, { label: `Modo: ${conversationUsesHermes() ? "Texto y Hermes" : "Solo texto"}`, onSelect: (ctx: LayerContext) => {
          ctx.stack.pop(); setConversationUsesHermes(!conversationUsesHermes());
        } }, { label: `Idioma: ${model === "android-system" ? "Español (Pixel)" : conversationTextLanguage() === "auto" ? "Automático" : "Solo español"}`, onSelect: (ctx: LayerContext) => {
          ctx.stack.pop(); if (model !== "android-system") setConversationTextLanguage(conversationTextLanguage() === "auto" ? "es" : "auto");
        } }, ...(model === "soniox" || model === "android-system" || asrModelState(model).status === "ready" ? [] : [{
          label: `${asrModelState(model).status === "downloading" ? "Pausar descarga" : "Descargar"}: ${conversationModelOption(model)}`,
          onSelect: (ctx: LayerContext) => {
            ctx.stack.pop(); if (session.detector.snapshot().enabled) return;
            if (asrModelState(model).status === "downloading") cancelAsrModelDownload(model); else startAsrModelDownload(model);
          },
        }])])];
      }
      // While ON show the engine really active, as the phone does; the shared choice applies to the next start.
      const textShown = stopping ? opened.transcription?.enabled === true : conversationTextSelected();
      return [
      { label: lensConversationPlan(session).button, onSelect: (ctx) => {
        ctx.stack.pop();
        // A menu acts as it was labelled when opened: a stop menu retained across expiry never
        // starts, and a start menu retained while another input started a session never stops it.
        if (stopping) session.setEnabled(false);
        else if (!session.detector.snapshot().enabled) toggleLensConversation(session);
      } },
      { label: `Texto local: ${textShown ? "ON" : "OFF"}${stopping ? " · sesión en curso" : ""}`,
        description: `Cambiar solo en OFF. Texto temporal ${textLanguageLabel(stopping ? opened.languageMode : conversationTextLanguage())}, sin envío al asistente.`,
        onSelect: (ctx) => { ctx.stack.pop(); if (!stopping) setConversationTextSelected(!conversationTextSelected()); } },
      ...(stopping ? wearerMenuItems(session) : []),
      { label: "Detener (OFF)", onSelect: (ctx) => { ctx.stack.pop(); session.setEnabled(false); } },
      ];
    },
    // While a session is ON (at most 120 s) the idle timeout must not blank the lenses mid-conversation,
    // as Transcribe does for its capture. OFF keeps the normal screen timeout. With Hermes armed the
    // lenses must stay dark while listening, so capture never holds the screen on.
    keepsScreenOn: () => !closed && session.detector.snapshot().enabled && !hermesArmed()
      && (!session.setManualEnabled || !conversationUsesHermes()),
    submitFrame: options.submitFrame, setSurfaceVisible: options.setSurfaceVisible,
    removeSurface: options.removeSurface, reconfigureSurface: options.reconfigureSurface,
    onForegroundChanged: (foreground) => { if (foreground && !closed) app.requestRender(); },
    onClosed: () => {
      closed = true; cancelPoll(); unsubscribe(); unsubscribeChoice(); unsubscribeHermes();
      session.setEnabled(false);
      options.onClosed();
    },
  });
  const refresh = (pollsLeft = 60) => {
    if (closed) return;
    cancelPoll();
    const snapshot = session.detector.snapshot();
    if (snapshot.enabled && hermesArmed()) {
      const key = `${snapshot.epoch}|${snapshot.state}|${Math.ceil(snapshot.remainingMs / 1000)}|${wearerLine(snapshot)}`;
      if (key !== hermesPaintKey) { hermesPaintKey = key; app.requestRender(); }
      return;
    }
    hermesPaintKey = "";
    // Clear old text on every invalidation even when hidden; no periodic paint in OFF.
    if (!snapshot.enabled || snapshot.state !== "escuchando" || shell.isWindowVisible(CONVERSATION_WINDOW_ID)) app.requestRender();
    const draining = snapshot.participation?.worker || snapshot.participation?.busy || snapshot.transcription?.worker || snapshot.transcription?.busy;
    if (!snapshot.enabled && draining && pollsLeft > 0) closeTimer = setTimeout(() => refresh(pollsLeft - 1), 500);
  };
  unsubscribe = session.detector.subscribe(() => refresh());
  unsubscribeChoice = onConversationTextSelected(() => refresh());
  const modelSubscriptions = CONVERSATION_MODELS.flatMap((id) => id === "soniox" || id === "android-system" ? [] : [onAsrModelStateChanged(id, () => refresh())]);
  const oldUnsubscribeChoice = unsubscribeChoice;
  unsubscribeChoice = () => { oldUnsubscribeChoice(); for (const off of modelSubscriptions) off(); };
  try {
    unsubscribeHermes = onHermesConversationPresentation(() => { hermesPaintKey = ""; refresh(); });
  } catch { /* Classic view without Hermes presentation; nothing to release. */ }
  return app;
}
