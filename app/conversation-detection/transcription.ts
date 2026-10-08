import { type ConversationTurn } from "./conversation-turns";
import { type ProfileVoiceMatch, type ProfileMatcherSummary } from "./profile-speaker-matcher";
import { type IdentitySnapshot, type IdentitySummary, type SpeakerRef, type WearerActionRef, type WearerAssociationEvent } from "./wearer-identity";

/** RAM-only session selector. "es" forces Spanish (reported as forced, never detected). */
export type TextLanguage = "auto" | "es";

/** ASR counters attributed to the origin phase of each segment/job/result. Scalars only. */
export type TranscriptPhaseAnalysis = {
  phase: "sin-marcar" | "otra-persona" | "yo" | "referencia" | "fin" | "mixta";
  pcmAudioMs: number; loadingAudioMs: number;
  silenceClosures: number; limitClosures: number; shortSegments: number;
  interruptedSegments: number; interruptedAudioMs: number; submittedAudioMs: number;
  dropped: number; decodeCalls: number; decodedAudioMs: number; decodeTotalMs: number; decodeMaxMs: number;
  rejectedLanguage: number; rejectedEmpty: number; rejectedStructure: number; decodeErrors: number; processingErrors: number;
  invalidatedDecodes: number; languageEs: number; languageCa: number; languageOther: number;
  languageForced: number; forcedMismatch: number;
  accepted: number; abstentions: number; delivered: number; deliveredChars: number; deliveryDiscarded: number;
};

/** Optional native ASR port. Diagnostics exclude the temporary transcript. */
export type LocalTranscriptionSnapshot = {
  enabled: boolean; status: string; worker: boolean; busy: boolean; inputBufferedBytes: number;
  accepted: number; abstentions: number; dropped: number;
  /** "soniox" (cloud), "local" or "local (sin red)" after a Soniox fallback. */
  engine?: string;
  /** Actual loaded Whisper model; selection alone does not mean it is running. */
  model?: string;
  /** Scalar Soniox counters; never text or key. */
  soniox?: { sentMs: number; finalTokens: number; messages: number; speakers: number; fallbacks: number; errors: number; lastError: string };
  /** S2: wearer association state; scalars and Soniox labels only, never text. */
  identity?: IdentitySnapshot;
  /** S2: true only while Soniox interventions are produced (never for the local fallback). */
  turnsAvailable?: boolean;
  /** Aggregate RAM-only diagnostics; no transcript, per-segment timeline or confidence. */
  analysis?: {
    /** Windows include overlap, so decodedAudioMs can exceed unique PCM time. */
    segmentation?: "vad" | "windows"; constantWindows?: number;
    pcmAudioMs: number; loadingAudioMs: number;
    silenceClosures: number; limitClosures: number; shortSegments: number;
    interruptedSegments: number; interruptedAudioMs: number; submittedAudioMs: number;
    decodeCalls: number; decodedAudioMs: number; decodeTotalMs: number; decodeMaxMs: number;
    rejectedLanguage: number; rejectedEmpty: number; rejectedStructure: number; decodeErrors: number; processingErrors: number;
    invalidatedDecodes: number; languageEs: number; languageCa: number; languageOther: number; delivered: number;
    /** C1: forced-Spanish labels, mismatches, delivery accounting and per-phase attribution. */
    languageForced?: number; forcedMismatch?: number; deliveredChars?: number; deliveryDiscarded?: number;
    languageMode?: TextLanguage; mixedAudioMsByPhase?: number[]; phases?: TranscriptPhaseAnalysis[];
    /** A3: model in use, ASR-copy level conditioning and aggregate window-level histograms (dBFS). */
    engine?: string; conditioned?: boolean; rejectedHallucination?: number;
    levels?: { windows: number; bucketsDbfs: string; loudWindows: number[]; quietActiveWindows: number[];
      avgNoiseDb: number; avgGainDb: number; maxGainDb: number };
  };
};
/** S2: aggregate of the last Soniox session, kept after OFF until the next accepted start. No text. */
export type SonioxSessionSummary = {
  engineFinal: string;
  sentAudioMs: number; finalAudioProcMs: number | null; totalAudioProcMs: number | null; backlogAtStopMs: number | null;
  /** Monotonic phone clock from the first audio send to the first token / final; includes network and service wait. */
  firstTokenAfterMs: number | null; firstFinalAfterMs: number | null;
  messages: number; finalTokens: number; turns: number; speakersSeen: number;
  invalidTimingTokens: number; invalidProgress: number;
  fallbacks: number; errors: number; lastErrorCategory: string | null;
  identity: IdentitySummary;
  profile?: ProfileMatcherSummary;
  /** Redacted socket state at the failure, if the platform exposes it; no payload or exception text. */
  transportFailure?: SonioxTransportDiagnostics;
  /** Filled by the coordinator from its stopReason after OFF. */
  endedBy?: string;
};

export type SonioxTransportDiagnostics = {
  state: "connecting" | "open" | "closing" | "closed" | "failed";
  queuedBytes: number;
  failure: "none" | "timeout" | "tls" | "network" | "other";
  closeCode: number | null;
};

export type ObservedSpeaker = SpeakerRef & { speaker: string; preview: string };

export interface DetectorTranscription {
  /** The language is captured by an accepted start and stays fixed for that session. */
  start(language?: TextLanguage, profileAssociation?: boolean, maxMs?: number): boolean;
  acceptProfileMatch?(match: ProfileVoiceMatch): void;
  stop(): void;
  resetStream(): void;
  /** Diagnostic mark (0..4). Applies from the next PCM chunk; ignored when unsupported. */
  setPhase?(phase: number): void;
  acceptNative(pcm: unknown, vadState: string): void;
  snapshot(): LocalTranscriptionSnapshot;
  text(): string;
  /** S2: called by the coordinator before its cleanup resets the stream, so OFF is not an audio gap. */
  prepareStop?(): void;
  /** Reference captured by phrase actions; the actions below reject a reference that no longer matches. */
  wearerActionRef?(): WearerActionRef | null;
  identifyWearer?(ref?: WearerActionRef): boolean;
  finishWearerIdentification?(ref?: WearerActionRef): boolean;
  cancelWearerIdentification?(ref?: WearerActionRef): boolean;
  assignWearer?(ref: SpeakerRef): boolean;
  observedSpeakers?(): ObservedSpeaker[];
  subscribeTurns?(listener: (turn: ConversationTurn) => void): () => void;
  subscribeAssociation?(listener: (event: WearerAssociationEvent) => void): () => void;
  turns?(): ConversationTurn[];
  lastSessionSummary?(): SonioxSessionSummary | null;
}
