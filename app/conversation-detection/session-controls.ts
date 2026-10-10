import { type ConversationCaptureCoordinator, type SessionOptions } from "./coordinator";
import { conversationStartPlan } from "./conversation-ui";
import { type ParticipationMode } from "./participation";
import { type TextLanguage } from "./transcription";
import { type SpeakerRef } from "./wearer-identity";

export type ConversationSessionPort = {
  detector: ConversationCaptureCoordinator;
  setEnabled(enabled: boolean, transcribe?: boolean, participation?: ParticipationMode, options?: SessionOptions): void;
  /** The product ON/OFF; legacy diagnostic controls remain available separately. */
  setManualEnabled?(enabled: boolean): string;
  filterStatus?(): string;
  voiceModel(): string;
  textModel(): string;
};

/** One RAM-only choice shared by the phone and lenses. Binding never starts audio. */
let port: ConversationSessionPort | null = null;
let withText = true;
/** Automatic Spanish/Catalan recognition by default. RAM only; assistant settings unchanged. */
let textLanguage: TextLanguage = "auto";
let diagnostics = false;
/** Local Whisper by default for continuous listening without cloud transcription charges. RAM only. */
let textEngine: "soniox" | "local" = "local";
export const CONVERSATION_MODELS = ["soniox", "whisper-base-es", "whisper-small-es", "whisper-medium-es"] as const;
export type ConversationModel = typeof CONVERSATION_MODELS[number];
let localModel: Exclude<ConversationModel, "soniox"> = "whisper-small-es";
let useHermes = true;
/** Explicit RAM-only opt-in; restarting never silently opts into persistent summaries. */
let dailyContext = false;
/** Whisper speaker attribution in manual conversations (pause windows + session voices). RAM only. */
let localSpeakers = true;
/** Skip evaluating contexts heard from a single non-wearer voice (TV, radio, someone else's call). */
let singleVoiceFilter = false;
export function conversationLocalSpeakers(): boolean { return localSpeakers; }
export function setConversationLocalSpeakers(value: boolean): void {
  if (port?.detector.snapshot().enabled || localSpeakers === value) return;
  localSpeakers = value;
  for (const listener of listeners) listener();
}
export function conversationSingleVoiceFilter(): boolean { return singleVoiceFilter; }
export function setConversationSingleVoiceFilter(value: boolean): void {
  if (port?.detector.snapshot().enabled || singleVoiceFilter === value) return;
  singleVoiceFilter = value;
  for (const listener of listeners) listener();
}
/** One explicit listening choice, shared by phone and lenses; never starts audio by itself. */
export function selectConversationListeningMode(mode: "hermes" | "text"): boolean {
  if (port?.detector.snapshot().enabled) return false;
  setConversationUsesHermes(mode !== "text");
  return true;
}
export function conversationDailyContextSelected(): boolean { return dailyContext; }
export function setConversationDailyContextSelected(value: boolean): void {
  if (port?.detector.snapshot().enabled || dailyContext === value) return;
  dailyContext = value;
  for (const listener of listeners) listener();
}
export function conversationLocalModel(): Exclude<ConversationModel, "soniox"> { return localModel; }
export function conversationModel(): ConversationModel { return textEngine === "soniox" ? "soniox" : localModel; }
export function setConversationModel(value: ConversationModel): void {
  if (port?.detector.snapshot().enabled || !CONVERSATION_MODELS.includes(value)) return;
  if (value !== "soniox") localModel = value;
  textEngine = value === "soniox" ? "soniox" : "local";
  for (const listener of listeners) listener();
}
export function conversationUsesHermes(): boolean { return useHermes; }
export function setConversationUsesHermes(value: boolean): void {
  if (port?.detector.snapshot().enabled || useHermes === value) return;
  useHermes = value;
  for (const listener of listeners) listener();
}
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
