/** Optional native ASR port. Diagnostics exclude the temporary transcript. */
export type LocalTranscriptionSnapshot = {
  enabled: boolean; status: string; worker: boolean; busy: boolean; inputBufferedBytes: number;
  accepted: number; abstentions: number; dropped: number;
};
export interface DetectorTranscription {
  start(): boolean;
  stop(): void;
  resetStream(): void;
  acceptNative(pcm: unknown, vadState: string): void;
  snapshot(): LocalTranscriptionSnapshot;
  text(): string;
}
