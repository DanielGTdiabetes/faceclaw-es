/** Audio only on the user's EVO. No queue/replay; stale or failed streams fall back to the old timers. */
export type SmartTurnTransport = {
  sendText(text: string): boolean;
  sendBinary(pcm: unknown): boolean;
  close(code: number, reason: string): void;
  queuedBytes?(): number;
};
export type SmartTurnListener = { onOpen(): void; onTextMessage(text: string): void; onClosed(): void; onFailure(): void };
export type SmartTurnHost = {
  now(): number;
  connect(listener: SmartTurnListener): SmartTurnTransport | null;
};
export type SmartTurnVerdict = { audioMs: number; speechMs: number; probability: number | null };
export interface SmartTurnPort {
  available?(): boolean;
  start(changed: (speech: boolean) => void): void;
  stop(): void;
  acceptPcm(pcm: unknown, endMs: number): void;
  verdict(startMs: number | null, endMs: number | null): SmartTurnVerdict | null;
}

/** Separate port on the same configured host; credentials and audio never go to another host. */
export function smartTurnUrl(asr: string): string | null {
  const match = /^(wss?:\/\/)(\[[^\]]+\]|[^\s/:?#@]+)(?::\d+)?(?:\/[^\s]*)?$/.exec(asr.trim());
  return match ? `${match[1]}${match[2]}:18776/v1/audio/transcriptions/realtime` : null;
}

export class SmartTurnClient implements SmartTurnPort {
  private socket: SmartTurnTransport | null = null;
  private generation = 0;
  private started = false;
  private ready = false;
  private retryAt = 0;
  private connectingAt = 0;
  private baseMs: number | null = null;
  private sentMs = 0;
  private lastAt = 0;
  private lastSpeechMs = -1;
  private ended: SmartTurnVerdict | null = null;
  private changed: (speech: boolean) => void = () => {};

  constructor(private readonly host: SmartTurnHost) {}
  available(): boolean { return this.ready; }

  start(changed: (speech: boolean) => void): void {
    if (this.started) return;
    this.started = true;
    this.changed = changed;
    this.connect();
  }

  private connect(): void {
    this.connectingAt = this.host.now();
    const generation = ++this.generation;
    const live = () => generation === this.generation && this.started;
    try {
      const socket = this.host.connect({ onOpen() {},
        onTextMessage: (text) => { if (live()) this.message(text); },
        onClosed: () => { if (live()) this.fail(); },
        onFailure: () => { if (live()) this.fail(); } });
      if (live()) {
        this.socket = socket;
        if (!socket) this.fail();
      }
      else socket?.close(1000, "stale");
    } catch { this.fail(); }
  }

  stop(): void {
    this.started = false;
    this.fail();
    this.changed = () => {};
  }

  private fail(): void {
    ++this.generation;
    const socket = this.socket;
    this.socket = null; this.ready = false; this.baseMs = null; this.ended = null;
    this.lastSpeechMs = -1;
    this.retryAt = this.host.now() + 1000;
    try { socket?.close(1000, "stop"); } catch { /* Fallback needs no working socket. */ }
  }

  acceptPcm(pcm: unknown, endMs: number): void {
    if (!this.started || !Number.isFinite(endMs)) return;
    const now = this.host.now();
    // Retry only with live capture, never buffer PCM or keep a reconnect timer alive after OFF.
    if (!this.socket && now >= this.retryAt) this.connect();
    if (!this.ready) {
      if (this.socket && now - this.connectingAt >= 3000) this.fail();
      return;
    }
    if (!this.socket) return;
    try {
      if ((this.socket.queuedBytes?.() ?? 0) > 16000) { this.fail(); return; }
      if (this.baseMs === null || endMs !== this.sentMs + 50 || now - this.lastAt > 250) {
        this.baseMs = endMs - 50; this.ended = null; this.lastSpeechMs = -1;
        if (!this.socket.sendText(JSON.stringify({ type: "g2.reset", startMs: this.baseMs }))) { this.fail(); return; }
      }
      this.sentMs = endMs; this.lastAt = now;
      if (!this.socket.sendBinary(pcm)) this.fail();
    } catch { this.fail(); }
  }

  private message(text: string): void {
    let event: any;
    try { event = JSON.parse(text); } catch { return; }
    if (event?.type === "g2.ready" && event.v === 1) { this.ready = true; return; }
    if (!this.ready || this.baseMs === null || typeof event?.audioMs !== "number"
      || !Number.isFinite(event.audioMs) || event.audioMs < this.baseMs || event.audioMs > this.sentMs) return;
    // A backed-up stream can only use the normal timers, never accelerate with old acoustic evidence.
    if (this.sentMs - event.audioMs > 250 || this.host.now() - this.lastAt > 250) return;
    if (event.type === "g2.speech") {
      if (event.audioMs <= this.lastSpeechMs) return;
      this.lastSpeechMs = event.audioMs; this.ended = null; this.changed(true);
    } else if (event.type === "g2.turn_end" && typeof event.speechMs === "number"
      && Number.isFinite(event.speechMs) && event.speechMs >= Math.max(this.baseMs, this.lastSpeechMs)
      && event.speechMs <= event.audioMs && (event.probability === null
        || typeof event.probability === "number" && Number.isFinite(event.probability)
          && event.probability >= 0 && event.probability <= 1)) {
      this.ended = { audioMs: event.audioMs, speechMs: event.speechMs, probability: event.probability };
      this.changed(false);
    }
  }

  verdict(startMs: number | null, endMs: number | null): SmartTurnVerdict | null {
    const end = this.ended;
    // The accepted text must cover the speech that ended; unrelated/late ASR windows cannot borrow a verdict.
    return end && this.ready && this.host.now() - this.lastAt <= 250 && startMs !== null && endMs !== null
      && startMs <= end.speechMs && endMs >= end.speechMs ? { ...end } : null;
  }
}
