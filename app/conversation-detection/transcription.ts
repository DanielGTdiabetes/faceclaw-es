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
export interface DetectorTranscription {
  /** The language is captured by an accepted start and stays fixed for that session. */
  start(language?: TextLanguage): boolean;
  stop(): void;
  resetStream(): void;
  /** Diagnostic mark (0..4). Applies from the next PCM chunk; ignored when unsupported. */
  setPhase?(phase: number): void;
  acceptNative(pcm: unknown, vadState: string): void;
  snapshot(): LocalTranscriptionSnapshot;
  text(): string;
}
