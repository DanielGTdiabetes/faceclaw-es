import { type ConversationCaptureCoordinator, type SessionOptions } from "./coordinator";
import { conversationStartPlan } from "./conversation-ui";
import { type ParticipationMode } from "./participation";
import { type TextLanguage } from "./transcription";

export type ConversationSessionPort = {
  detector: ConversationCaptureCoordinator;
  setEnabled(enabled: boolean, transcribe?: boolean, participation?: ParticipationMode, options?: SessionOptions): void;
  voiceModel(): string;
  textModel(): string;
};

/** One RAM-only choice shared by the phone and lenses. Binding never starts audio. */
let port: ConversationSessionPort | null = null;
let withText = true;
/** Spanish-first product default, including after process restart. RAM only; assistant settings unchanged. */
let textLanguage: TextLanguage = "es";
let diagnostics = false;
const listeners = new Set<() => void>();

export function bindConversationSession(value: ConversationSessionPort): void { port = value; }
export function conversationSession(): ConversationSessionPort {
  if (!port) throw new Error("Conversación local todavía no preparada.");
  return port;
}
export function conversationTextSelected(): boolean { return withText; }
export function setConversationTextSelected(value: boolean): void {
  if (port?.detector.snapshot().enabled || withText === value) return;
  withText = value;
  for (const listener of listeners) listener();
}
/** Changes only while OFF; the next ON freezes it for that session. */
export function conversationTextLanguage(): TextLanguage { return textLanguage; }
export function setConversationTextLanguage(value: TextLanguage): void {
  if (port?.detector.snapshot().enabled || textLanguage === value || (value !== "auto" && value !== "es")) return;
  textLanguage = value;
  for (const listener of listeners) listener();
}
export function conversationDiagnosticsSelected(): boolean { return diagnostics; }
export function setConversationDiagnosticsSelected(value: boolean): void {
  if (port?.detector.snapshot().enabled || diagnostics === value) return;
  diagnostics = value;
  for (const listener of listeners) listener();
}
/** Options read once at start; every entry point (phone, lenses, "Solo transcripción") uses them. */
export function conversationSessionOptions(): SessionOptions { return { language: textLanguage, diagnostics }; }
export function onConversationTextSelected(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function lensConversationPlan(session: ConversationSessionPort) {
  return conversationStartPlan(session.detector.snapshot(), session.detector.ownProfileState(),
    session.voiceModel(), session.textModel(), withText, textLanguage);
}
/** Called only by an explicit user control, never by launch/restore/paint. */
export function toggleLensConversation(session: ConversationSessionPort): string {
  if (session.detector.snapshot().enabled) { session.setEnabled(false); return ""; }
  const plan = lensConversationPlan(session);
  if (!plan.canStart) return plan.hint;
  session.setEnabled(true, plan.transcribe, plan.mode, conversationSessionOptions());
  return "";
}
