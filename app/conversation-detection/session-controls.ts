import { type ConversationCaptureCoordinator } from "./coordinator";
import { conversationStartPlan } from "./conversation-ui";
import { type ParticipationMode } from "./participation";

export type ConversationSessionPort = {
  detector: ConversationCaptureCoordinator;
  setEnabled(enabled: boolean, transcribe?: boolean, participation?: ParticipationMode): void;
  voiceModel(): string;
  textModel(): string;
};

/** One RAM-only choice shared by the phone and lenses. Binding never starts audio. */
let port: ConversationSessionPort | null = null;
let withText = true;
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
export function onConversationTextSelected(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function lensConversationPlan(session: ConversationSessionPort) {
  return conversationStartPlan(session.detector.snapshot(), session.detector.ownProfileState(),
    session.voiceModel(), session.textModel(), withText);
}
/** Called only by an explicit user control, never by launch/restore/paint. */
export function toggleLensConversation(session: ConversationSessionPort): string {
  if (session.detector.snapshot().enabled) { session.setEnabled(false); return ""; }
  const plan = lensConversationPlan(session);
  if (!plan.canStart) return plan.hint;
  session.setEnabled(true, plan.transcribe, plan.mode);
  return "";
}
