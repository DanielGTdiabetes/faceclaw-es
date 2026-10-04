import { type DetectorTranscription, type LocalTranscriptionSnapshot, type TextLanguage } from "../conversation-detection/transcription";

/**
 * Conversation text through Soniox real-time STT with speaker diarization, falling back to the
 * on-device Whisper route (`local`) when there is no key, the socket cannot open, or it drops.
 * https://soniox.com/docs/stt/rt/real-time-transcription
 *
 * Privacy: while Soniox is the engine, the G2 PCM of every voice leaves the phone. Nothing is
 * stored here beyond the rolling RAM text, cleared on stop like the local route. The snapshot
 * exposes scalars only (no text, no key).
 */

declare const com: any;

export const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
export const SONIOX_MODEL = "stt-rt-v5";
const MAX_TEXT_CHARS = 1200;
const KEEPALIVE_MS = 8000;

export type SocketListener = {
  onOpen(): void;
  onTextMessage(message: string): void;
  onClosed(): void;
  onFailure(message: string): void;
};
export type SocketLike = {
  sendText(message: string): boolean;
  /** Receives the original native PCM array (Java byte[] on Android); no JS copy. */
  sendBinary(pcm: unknown): boolean;
  close(code: number, reason: string): void;
};
export type SonioxConversationHost = {
  apiKey(): string;
  /** "soniox" unless the user picked the local engine. */
  engine(): ConversationEngine;
  connect(url: string, listener: SocketListener): SocketLike;
  now(): number;
  every(callback: () => void, ms: number): () => void;
};
export type ConversationEngine = "soniox" | "local";

/** Android socket: OkHttp-backed FaceclawWebSocket; callbacks arrive on the constructing thread. */
export function androidSonioxSocket(url: string, listener: SocketListener): SocketLike {
  const proxy = new com.faceclaw.app.FaceclawWebSocketListener({
    onOpen: () => listener.onOpen(),
    onTextMessage: (message: string) => listener.onTextMessage(String(message)),
    onClosed: () => listener.onClosed(),
    onFailure: (message: string) => listener.onFailure(String(message)),
  });
  const socket = new com.faceclaw.app.FaceclawWebSocket(url, proxy, null, null);
  return {
    sendText: (message) => Boolean(socket.sendText(message)),
    sendBinary: (pcm) => Boolean(socket.sendBinary(pcm)),
    close: (code, reason) => { socket.close(code, reason); },
  };
}

type Token = { text?: unknown; is_final?: unknown; speaker?: unknown };

export class SonioxConversationTranscription implements DetectorTranscription {
  private socket: SocketLike | null = null;
  private mode: "off" | "soniox" | "local" = "off";
  private status = "inactivo";
  private language: TextLanguage = "es";
  private generation = 0;
  private open = false;
  private finals: { speaker: string; text: string }[] = [];
  private pending = "";
  private pendingSpeaker = "";
  private lastSendAt = 0;
  private cancelKeepalive: (() => void) | null = null;
  private fallbackText = "";
  private stats = { sentMs: 0, finalTokens: 0, messages: 0, speakers: 0, fallbacks: 0, errors: 0 };
  private lastError = "";

  constructor(private readonly local: DetectorTranscription, private readonly host: SonioxConversationHost) {}

  start(language: TextLanguage = "es"): boolean {
    if (this.mode !== "off") return false;
    this.language = language;
    this.reset();
    const key = this.host.apiKey().trim();
    if (this.host.engine() === "local" || !key) return this.startLocal(false);
    this.mode = "soniox";
    this.status = "cargando";
    const generation = ++this.generation;
    try {
      this.socket = this.host.connect(SONIOX_WS_URL, {
        onOpen: () => {
          if (generation !== this.generation || this.mode !== "soniox") return;
          const config = {
            api_key: key,
            model: SONIOX_MODEL,
            audio_format: "pcm_s16le",
            sample_rate: 16000,
            num_channels: 1,
            language_hints: language === "es" ? ["es"] : ["es", "ca"],
            enable_speaker_diarization: true,
            enable_endpoint_detection: true,
          };
          if (!this.socket?.sendText(JSON.stringify(config))) { this.fail("config no enviada"); return; }
          this.open = true;
          this.status = "listo";
          this.lastSendAt = this.host.now();
          this.cancelKeepalive = this.host.every(() => this.keepalive(), KEEPALIVE_MS);
        },
        onTextMessage: (message) => { if (generation === this.generation) this.handle(String(message)); },
        onClosed: () => { if (generation === this.generation && this.mode === "soniox") this.fail("conexión cerrada"); },
        onFailure: (message) => { if (generation === this.generation && this.mode === "soniox") this.fail(String(message)); },
      });
    } catch (error) {
      this.fail(String((error as Error)?.message ?? error));
    }
    // Callbacks above (or fail()) may have moved the mode synchronously.
    return this.active();
  }

  private active(): boolean { return this.mode !== "off"; }

  acceptNative(pcm: unknown, vadState: string): void {
    if (this.mode === "local") { this.local.acceptNative(pcm, vadState); return; }
    if (this.mode !== "soniox" || !this.open || !this.socket) return;
    if (!this.socket.sendBinary(pcm)) { this.fail("envío de audio fallido"); return; }
    this.stats.sentMs += 50;
    this.lastSendAt = this.host.now();
  }

  /** A transport gap: ask Soniox to finalize what it heard; the socket stays open. */
  resetStream(): void {
    if (this.mode === "local") { this.local.resetStream(); return; }
    if (this.mode === "soniox" && this.open) this.socket?.sendText(JSON.stringify({ type: "finalize" }));
  }

  setPhase(phase: number): void { if (this.mode === "local") this.local.setPhase?.(phase); }

  stop(): void {
    this.generation++;
    if (this.mode === "local") this.local.stop();
    this.closeSocket();
    this.mode = "off";
    this.status = "inactivo";
    this.reset();
  }

  text(): string {
    if (this.mode === "local") {
      const local = this.local.text();
      return clip(this.fallbackText && local ? `${this.fallbackText}\n${local}` : this.fallbackText || local);
    }
    return clip(this.render());
  }

  snapshot(): LocalTranscriptionSnapshot {
    if (this.mode === "local") {
      const local = this.local.snapshot();
      return { ...local, engine: this.stats.fallbacks > 0 ? "local (sin red)" : "local", soniox: this.scalars() };
    }
    return {
      enabled: this.mode === "soniox", status: this.status, worker: this.mode === "soniox", busy: false,
      inputBufferedBytes: 0, accepted: this.stats.finalTokens, abstentions: 0, dropped: 0,
      engine: "soniox", soniox: this.scalars(),
    };
  }

  private scalars() {
    return { ...this.stats, lastError: this.lastError };
  }

  private startLocal(fallback: boolean): boolean {
    if (fallback) {
      this.stats.fallbacks++;
      this.fallbackText = this.render();
    }
    this.mode = "local";
    const started = this.local.start(this.language);
    if (!started) { this.mode = "off"; this.status = "error"; }
    return started;
  }

  private fail(reason: string): void {
    if (this.mode !== "soniox") return;
    this.stats.errors++;
    this.lastError = reason.slice(0, 120);
    this.generation++;
    this.closeSocket();
    // Fallback keeps the session alive with on-device Whisper (no network).
    if (!this.startLocal(true)) this.status = "error";
  }

  private keepalive(): void {
    if (this.mode === "soniox" && this.open && this.host.now() - this.lastSendAt >= KEEPALIVE_MS - 500) {
      this.socket?.sendText(JSON.stringify({ type: "keepalive" }));
      this.lastSendAt = this.host.now();
    }
  }

  private handle(raw: string): void {
    let message: any;
    try { message = JSON.parse(raw); } catch { return; }
    this.stats.messages++;
    if (message?.error_code != null) {
      this.fail(`Soniox ${String(message.error_code)}: ${String(message.error_message ?? "")}`);
      return;
    }
    const tokens: Token[] = Array.isArray(message?.tokens) ? message.tokens : [];
    let pending = "";
    let pendingSpeaker = "";
    for (const token of tokens) {
      const text = String(token?.text ?? "");
      if (text === "<end>" || text === "<fin>") continue;
      const speaker = token?.speaker == null ? "" : String(token.speaker);
      if (token?.is_final) {
        this.stats.finalTokens++;
        this.appendFinal(speaker, text);
      } else {
        if (!pendingSpeaker) pendingSpeaker = speaker;
        pending += text;
      }
    }
    this.pending = pending;
    this.pendingSpeaker = pendingSpeaker;
    if (message?.finished && this.mode === "soniox") this.fail("sesión finalizada por el servidor");
  }

  private appendFinal(speaker: string, text: string): void {
    const last = this.finals[this.finals.length - 1];
    if (last && last.speaker === speaker) last.text += text;
    else {
      if (text.trim() === "" && !last) return;
      this.finals.push({ speaker, text: text.trimStart() });
      this.stats.speakers = new Set(this.finals.map((entry) => entry.speaker).filter(Boolean)).size;
    }
    while (this.finals.length > 1 && this.render().length > MAX_TEXT_CHARS) this.finals.shift();
  }

  private render(): string {
    const lines = this.finals.map((entry) => label(entry.speaker) + entry.text.trim()).filter((line) => line.trim());
    const pending = this.pending.trim();
    if (pending) {
      const last = this.finals[this.finals.length - 1];
      if (last && (!this.pendingSpeaker || last.speaker === this.pendingSpeaker) && lines.length) {
        lines[lines.length - 1] += ` ${pending}`;
      } else lines.push(label(this.pendingSpeaker) + pending);
    }
    return lines.join("\n");
  }

  private closeSocket(): void {
    this.cancelKeepalive?.();
    this.cancelKeepalive = null;
    const socket = this.socket;
    this.socket = null;
    if (socket && this.open) { try { socket.sendText(""); } catch { /* closing anyway */ } }
    this.open = false;
    try { socket?.close(1000, "bye"); } catch { /* ignore */ }
  }

  private reset(): void {
    this.finals = [];
    this.pending = "";
    this.pendingSpeaker = "";
    this.fallbackText = "";
    this.stats = { sentMs: 0, finalTokens: 0, messages: 0, speakers: 0, fallbacks: 0, errors: 0 };
    this.lastError = "";
  }
}

function label(speaker: string): string { return speaker ? `${speaker}: ` : ""; }

function clip(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  const tail = text.slice(-MAX_TEXT_CHARS);
  const space = tail.indexOf(" ");
  return space >= 0 && space < 40 ? tail.slice(space + 1) : tail;
}
