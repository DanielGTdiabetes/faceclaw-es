/** Optional native ASR port. Diagnostics exclude the temporary transcript. */
export type LocalTranscriptionSnapshot = {
  enabled: boolean; status: string; worker: boolean; busy: boolean; inputBufferedBytes: number;
  accepted: number; abstentions: number; dropped: number;
  /** Aggregate RAM-only diagnostics; no transcript, per-segment timeline or confidence. */
  analysis?: {
    pcmAudioMs: number; loadingAudioMs: number;
    silenceClosures: number; limitClosures: number; shortSegments: number;
    interruptedSegments: number; interruptedAudioMs: number; submittedAudioMs: number;
    decodeCalls: number; decodedAudioMs: number; decodeTotalMs: number; decodeMaxMs: number;
    rejectedLanguage: number; rejectedEmpty: number; rejectedStructure: number; decodeErrors: number; processingErrors: number;
    invalidatedDecodes: number; languageEs: number; languageCa: number; languageOther: number; delivered: number;
  };
};
export interface DetectorTranscription {
  start(): boolean;
  stop(): void;
  resetStream(): void;
  acceptNative(pcm: unknown, vadState: string): void;
  snapshot(): LocalTranscriptionSnapshot;
  text(): string;
}
