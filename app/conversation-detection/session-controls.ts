import { type ConversationCaptureCoordinator, type SessionOptions } from "./coordinator";
import { conversationStartPlan } from "./conversation-ui";
import { type ParticipationMode } from "./participation";
import { type TextLanguage } from "./transcription";
import { type SpeakerRef } from "./wearer-identity";

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
/** Soniox (cloud, diarized) by default; local Whisper on demand. RAM only. */
let textEngine: "soniox" | "local" = "soniox";
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
export function conversationTextEngine(): "soniox" | "local" { return textEngine; }
export function setConversationTextEngine(value: "soniox" | "local"): void {
  if (port?.detector.snapshot().enabled || textEngine === value) return;
  textEngine = value;
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

/** S2: the detector surface used by phone and lenses for the wearer association. */
export type WearerControls = Pick<ConversationCaptureCoordinator, "snapshot" | "wearerActionRef" | "identifyWearer"
  | "finishWearerIdentification" | "cancelWearerIdentification" | "assignWearer" | "observedSpeakers">;
export type WearerAction = { label: string; run(): boolean };

/**
 * Explicit identification actions for the current state; empty when OFF or without Soniox.
 * Each action carries the session, stream, attempt and association version captured now: «Listo» or
 * «Cancelar» kept from attempt A never act on attempt B, nor on a later session after OFF/ON, and an
 * «Identificar» kept across another attempt or association change starts nothing (all return false).
 */
export function wearerActions(detector: WearerControls): WearerAction[] {
  const snapshot = detector.snapshot();
  const identity = snapshot.transcription?.identity;
  if (!snapshot.enabled || !identity || identity.state === "no-disponible") return [];
  const ref = detector.wearerActionRef();
  if (!ref) return [];
  if (identity.state === "escuchando-frase") return [
    { label: "Listo, ya la he dicho", run: () => detector.finishWearerIdentification(ref) },
    { label: "Cancelar identificación", run: () => detector.cancelWearerIdentification(ref) },
  ];
  if (identity.state === "esperando-resultado") return [
    { label: "Cancelar identificación", run: () => detector.cancelWearerIdentification(ref) },
  ];
  return [{ label: "Identificar mi voz (frase)", run: () => detector.identifyWearer(ref) }];
}

/**
 * Manual choice among every label of the live stream (associated first) plus «No soy ninguna».
 * Each action carries the session/stream captured now: a menu kept across OFF/ON assigns nothing.
 */
export function wearerChoices(detector: WearerControls): WearerAction[] {
  const snapshot = detector.snapshot();
  if (!snapshot.enabled || !snapshot.transcription?.identity || snapshot.transcription.identity.state === "no-disponible") return [];
  const speakers = detector.observedSpeakers();
  if (!speakers.length) return [];
  const associated = snapshot.transcription.identity.speaker;
  const ref = (speaker: string | null): SpeakerRef => ({ sessionId: speakers[0]!.sessionId, streamId: speakers[0]!.streamId, speaker });
  return [
    ...speakers.map((entry) => ({
      label: `${entry.speaker === associated ? "Yo soy" : "Soy"} la voz ${entry.speaker}${entry.preview ? ` · «${entry.preview}»` : ""}`,
      run: () => detector.assignWearer(ref(entry.speaker)),
    })),
    { label: "No soy ninguna", run: () => detector.assignWearer(ref(null)) },
  ];
}
