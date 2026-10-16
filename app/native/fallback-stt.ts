import type { CloudSttClient, CloudSttOptions, CloudSttTranscriptEvent } from "./cloud-stt";

/**
 * Decodes one already captured utterance (16 kHz PCM16LE) with the on-device
 * model. Rejects when no local model can run.
 */
export type LocalTranscribe = (pcm: Uint8Array) => Promise<string>;

export type FallbackTimings = {
  /** Remote session must be ready (configured) within this many ms of start. */
  connectMs: number;
  /** Final transcript must arrive within this many ms of finish(). */
  finalMs: number;
  /** Bounded wait for loading/decoding on the phone. */
  localMs?: number;
};

export const DEFAULT_FALLBACK_TIMINGS: FallbackTimings = { connectMs: 2000, finalMs: 3000, localMs: 30000 };

/** Thirty seconds of utterance audio, the same cap the native fallback decoder applies. */
export const MAX_FALLBACK_BYTES = 16000 * 2 * 30;

/**
 * Push-to-talk wrapper for a self-hosted recognizer (the EVO-X2 service):
 * keeps the utterance's PCM in RAM and, when the remote side fails or misses
 * a deadline before its final, transcribes that PCM with the on-device model
 * instead. Exactly one final is accepted per capture: whichever of remote or
 * local settles first wins, and a late answer from the other is dropped.
 *
 * Unlike ReconnectingSttClient this does not reconnect within a capture; the
 * next capture opens a fresh remote session. Audio never goes to any other
 * remote provider, and nothing is persisted.
 */
export class FallbackSttClient implements CloudSttClient {
  private remote: CloudSttClient | null = null;
  private state: "remote" | "failed" | "settled" = "remote";
  private ready = false;
  private finishing = false;
  private localStarted = false;
  private chunks: Uint8Array[] = [];
  private bytes = 0;
  private overflow = false;
  private completion: Promise<void> | null = null;
  private resolveCompletion: (() => void) | null = null;
  private rejectCompletion: ((error: Error) => void) | null = null;
  private terminalError: Error | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private finalTimer: ReturnType<typeof setTimeout> | null = null;
  private localTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly create: (options: CloudSttOptions) => CloudSttClient,
    private readonly options: CloudSttOptions,
    private readonly local: LocalTranscribe,
    private readonly timings: FallbackTimings = DEFAULT_FALLBACK_TIMINGS,
  ) {}

  start(): void {
    if (this.remote || this.state !== "remote") return;
    const remote = this.create({
      ...this.options,
      onReady: () => {
        if (this.remote !== remote) return;
        this.ready = true;
        this.clearConnectTimer();
        this.options.onReady?.();
      },
      onTranscript: (event) => { if (this.remote === remote) this.remoteTranscript(event); },
      onStatus: (status) => { if (this.remote === remote) this.options.onStatus(status); },
      onError: (message) => { if (this.remote === remote) this.fail(message); },
      onDisconnected: (message) => { if (this.remote === remote) this.fail(message); },
    });
    this.remote = remote;
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      if (!this.ready) this.fail("no answer within " + this.timings.connectMs + " ms");
    }, this.timings.connectMs);
    try {
      remote.start();
    } catch (error) {
      this.fail(String((error as Error)?.message ?? error));
    }
  }

  acceptPcm(pcm: Uint8Array): void {
    if (this.state === "settled" || pcm.length === 0) return;
    const room = MAX_FALLBACK_BYTES - this.bytes;
    if (pcm.length > room) this.overflow = true;
    if (room > 0) {
      const kept = pcm.length <= room ? pcm.slice() : pcm.slice(0, room);
      this.chunks.push(kept);
      this.bytes += kept.length;
    }
    if (this.state === "remote") this.remote?.acceptPcm(pcm);
  }

  finish(): Promise<void> {
    if (!this.completion) {
      this.completion = new Promise((resolve, reject) => {
        this.resolveCompletion = resolve;
        this.rejectCompletion = reject;
      });
      // Some non-UI consumers ignore finish(); callers that await still receive the rejection.
      void this.completion.catch(() => {});
    }
    if (this.state === "settled") {
      if (this.terminalError) this.rejectCompletion?.(this.terminalError);
      else this.resolveCompletion?.();
      return this.completion;
    }
    if (this.finishing) return this.completion;
    this.finishing = true;
    if (this.state === "failed") {
      this.transcribeLocally();
      return this.completion;
    }
    this.finalTimer = setTimeout(() => {
      this.finalTimer = null;
      this.fail("no final within " + this.timings.finalMs + " ms");
    }, this.timings.finalMs);
    try {
      const pending = this.remote?.finish();
      if (pending) void pending.catch((error) => this.fail(String(error)));
    } catch (error) {
      this.fail(String(error));
    }
    return this.completion;
  }

  commitSegment(): void {
    if (this.state === "remote") this.remote?.commitSegment?.();
  }

  stop(): void {
    if (this.state !== "settled") this.settle(new Error("Voice capture cancelled."));
  }

  private remoteTranscript(event: CloudSttTranscriptEvent): void {
    if (this.state !== "remote") return;
    if (!event.isFinal) {
      this.options.onTranscript(event);
      return;
    }
    if (!this.finishing) {
      // A final the server produced on its own mid-utterance: that audio is
      // accounted for, so a later fallback must not transcribe it again.
      this.releaseAudio();
      this.options.onTranscript(event);
      return;
    }
    // An empty result is also produced by this server when another session interferes.
    // Let Whisper verify silence instead of accepting lost speech as successful recognition.
    if (!event.text.trim() && this.bytes > 0) {
      this.fail("empty final transcript");
      return;
    }
    this.settle();
    this.options.onTranscript(event);
  }

  private fail(reason: string): void {
    if (this.state !== "remote") return;
    this.state = "failed";
    this.clearConnectTimer();
    this.clearFinalTimer();
    const remote = this.remote;
    this.remote = null; // Drops any late event from the abandoned session.
    remote?.stop();
    const auth = /\b(401|403)\b/.test(reason);
    this.options.onStatus(auth
      ? "EVO-X2 rejected the key; using on-device voice."
      : `EVO-X2 unavailable (${reason}); using on-device voice.`);
    if (this.finishing) this.transcribeLocally();
  }

  private transcribeLocally(): void {
    if (this.localStarted || this.state === "settled") return;
    if (this.overflow) {
      this.reportError("On-device voice cannot recover a capture longer than 30 seconds. Please repeat in shorter phrases.");
      return;
    }
    this.localStarted = true;
    const pcm = concat(this.chunks, this.bytes);
    this.releaseAudio();
    this.options.onStatus("Transcribing on the phone...");
    this.localTimer = setTimeout(() => {
      this.localTimer = null;
      if (this.state !== "settled") this.reportError("On-device voice timed out. Please repeat.");
    }, this.timings.localMs ?? 30000);
    let pending: Promise<string>;
    try {
      pending = this.local(pcm);
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then((text) => {
      if (this.state === "settled") return;
      this.settle();
      this.options.onTranscript({ text: String(text ?? "").trim(), isFinal: true, authoritative: true });
    }, (error) => {
      if (this.state === "settled") return;
      this.reportError(`EVO-X2 unavailable and on-device voice failed: ${String((error as Error)?.message ?? error)}`);
    });
  }

  private reportError(message: string): void {
    this.settle(new Error(message));
    this.options.onError(message);
  }

  private settle(error: Error | null = null): void {
    this.state = "settled";
    this.terminalError = error;
    this.clearConnectTimer();
    this.clearFinalTimer();
    if (this.localTimer !== null) clearTimeout(this.localTimer);
    this.localTimer = null;
    const remote = this.remote;
    this.remote = null;
    // The remote client closes itself after its last final; stopping again is harmless.
    remote?.stop();
    this.releaseAudio();
    if (error) this.rejectCompletion?.(error);
    else this.resolveCompletion?.();
  }

  private releaseAudio(): void {
    this.chunks = [];
    this.bytes = 0;
    this.overflow = false;
  }

  private clearConnectTimer(): void {
    if (this.connectTimer !== null) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private clearFinalTimer(): void {
    if (this.finalTimer !== null) clearTimeout(this.finalTimer);
    this.finalTimer = null;
  }
}

function concat(chunks: Uint8Array[], bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
