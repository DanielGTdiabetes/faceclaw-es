import { type DetectorTranscription, type LocalTranscriptionSnapshot, type ObservedSpeaker, type SonioxSessionSummary,
  type TextLanguage, type SonioxTransportDiagnostics } from "../conversation-detection/transcription";
import { ConversationTurns, type ConversationTurn } from "../conversation-detection/conversation-turns";
import { WearerIdentity, type FinalToken, type SpeakerRef, type WearerActionRef, type WearerAssociationEvent } from "../conversation-detection/wearer-identity";
import { ProfileSpeakerMatcher, type ProfileVoiceMatch } from "../conversation-detection/profile-speaker-matcher";

/**
 * Conversation text through Soniox real-time STT with speaker diarization, falling back to the
 * on-device Whisper route (`local`) when there is no key, the socket cannot open, or it drops.
 * https://soniox.com/docs/stt/rt/real-time-transcription
 *
 * Privacy: while Soniox is the engine, the G2 PCM of every voice leaves the phone. Nothing is
 * stored here beyond the rolling RAM text, cleared on stop like the local route. The snapshot
 * exposes scalars only (no text, no key).
 *
 * S2: final tokens keep their timing (validated, never trusted blindly), feed an explicit wearer
 * association (phrase or manual choice) and RAM-only interventions. Nothing is sent anywhere.
 */

declare const com: any;

export const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
export const SONIOX_MODEL = "stt-rt-v5";
const MAX_TEXT_CHARS = 1200;
const KEEPALIVE_MS = 8000;
/** Rounding allowance for token/progress times beyond the audio actually sent. */
const SENT_TOLERANCE_MS = 100;
/** A final token starting this much before the previous valid one is treated as incoherent. */
const MAX_REGRESSION_MS = 500;
/** error_type values documented by the Soniox WebSocket API; anything else becomes `servidor-otro`. */
const DOCUMENTED_ERROR_TYPES = new Set(["invalid_request", "model_not_available", "unauthenticated",
  "organization_balance_exhausted", "organization_monthly_budget_exhausted", "project_monthly_budget_exhausted",
  "permission_denied", "temp_api_key_session_expired", "request_timeout", "max_duration_reached", "limit_exceeded",
  "internal_error", "service_unavailable"]);

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
  diagnostics?(): SonioxTransportDiagnostics;
  close(code: number, reason: string): void;
};
export type SonioxConversationHost = {
  apiKey(): string;
  /** "soniox" unless the user picked the local engine. */
  engine(): ConversationEngine;
  connect(url: string, listener: SocketListener): SocketLike;
  /** Monotonic clock (elapsedRealtime on Android). */
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
    diagnostics: () => JSON.parse(String(socket.transportDiagnostics())) as SonioxTransportDiagnostics,
    close: (code, reason) => { socket.close(code, reason); },
  };
}

type Token = { text?: unknown; is_final?: unknown; speaker?: unknown; start_ms?: unknown; end_ms?: unknown };

let sessionCounter = 0;
/** Never reused within the process: counter + clock + random suffix. */
function newSessionId(now: number): string {
  return `s${(++sessionCounter).toString(36)}-${Math.floor(now).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const emptyStats = () => ({ sentMs: 0, finalTokens: 0, messages: 0, speakers: 0, fallbacks: 0, errors: 0 });

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
  private stats = emptyStats();
  private lastError = "";
  // S2 session state.
  private sessionId: string | null = null;
  private streamId = 0;
  private ending = false;
  private lastValidStart: number | null = null;
  private lastProgress: number | null = null;
  private lastTotal: number | null = null;
  private firstSendAt: number | null = null;
  private firstTokenAfterMs: number | null = null;
  private firstFinalAfterMs: number | null = null;
  private invalidTimingTokens = 0;
  private invalidProgress = 0;
  private lastErrorCategory: string | null = null;
  private transportFailure: SonioxTransportDiagnostics | undefined;
  private sessionSpeakers = new Set<string>();
  private summaryValue: SonioxSessionSummary | null = null;
  private readonly identity: WearerIdentity;
  private readonly turnLog: ConversationTurns;
  private profileMatcher: ProfileSpeakerMatcher | null = null;

  constructor(private readonly local: DetectorTranscription, private readonly host: SonioxConversationHost) {
    this.identity = new WearerIdentity({ now: () => host.now(), every: (callback, ms) => host.every(callback, ms) });
    this.turnLog = new ConversationTurns(this.identity);
  }

  start(language: TextLanguage = "es", profileAssociation = false): boolean {
    if (this.mode !== "off") return false;
    this.language = language;
    this.reset();
    this.summaryValue = null;
    this.ending = false;
    this.identity.clear();
    this.profileMatcher = profileAssociation ? new ProfileSpeakerMatcher((speaker, others) => {
      return this.sonioxLive() && this.identity.associateProfile(speaker, others);
    }) : null;
    this.sessionId = newSessionId(this.host.now());
    this.streamId = 0;
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
          if (!this.sendControl(JSON.stringify(config), "config")) return;
          this.open = true;
          this.status = "listo";
          this.lastSendAt = this.host.now();
          this.cancelKeepalive = this.host.every(() => this.keepalive(), KEEPALIVE_MS);
          this.streamId++;
          this.identity.start(this.sessionId!, this.streamId);
          this.turnLog.start(this.sessionId!, this.streamId);
          this.turnLog.audio(this.stats.sentMs);
        },
        onTextMessage: (message) => { if (generation === this.generation) this.handle(String(message)); },
        onClosed: () => { if (generation === this.generation && this.mode === "soniox") this.fail("conexión cerrada", "red"); },
        onFailure: (message) => { if (generation === this.generation && this.mode === "soniox") this.fail(String(message), "red"); },
      });
    } catch (error) {
      this.fail(String((error as Error)?.message ?? error), "red");
    }
    // Callbacks above (or fail()) may have moved the mode synchronously.
    return this.active();
  }

  private active(): boolean { return this.mode !== "off"; }

  acceptNative(pcm: unknown, vadState: string): void {
    if (this.mode === "local") { this.local.acceptNative(pcm, vadState); return; }
    if (this.mode !== "soniox" || !this.open || !this.socket) return;
    let sent = false;
    try { sent = this.socket.sendBinary(pcm); } catch { /* Same fallback as a rejected native send. */ }
    if (!sent) {
      this.fail("envío de audio fallido", "envio-audio");
      // The rejected chunk never entered the Soniox timeline; deliver it once to the local fallback.
      if (this.snapshot().engine?.startsWith("local") && this.active()) this.local.acceptNative(pcm, vadState);
      return;
    }
    if (this.firstSendAt === null) this.firstSendAt = this.host.now();
    this.stats.sentMs += 50;
    this.lastSendAt = this.host.now();
    this.identity.audio(this.stats.sentMs);
    // Same counter as the boundaries: releases turns whose words can no longer be crossed by a cut.
    this.turnLog.audio(this.stats.sentMs);
  }

  acceptProfileMatch(match: ProfileVoiceMatch): void {
    if (this.sonioxLive() && match?.endMs <= this.stats.sentMs) this.profileMatcher?.accept(match);
  }

  /** A transport gap or yield: ask Soniox to finalize what it heard; the socket stays open. */
  resetStream(): void {
    if (this.mode === "local") { this.local.resetStream(); return; }
    if (this.mode !== "soniox" || !this.open) return;
    if (this.ending) {
      // Best-effort finalization during OFF cleanup must never start a new local worker.
      try { this.socket?.sendText(JSON.stringify({ type: "finalize" })); } catch { /* Closing anyway. */ }
      return;
    }
    // The coordinator's own OFF cleanup also resets the stream; that is not an audio gap.
    if (!this.ending) {
      this.profileMatcher?.reset(this.stats.sentMs);
      this.identity.interrupt();
      this.identity.observeMarker();
      // §4.1: the capture boundary is the audio sent so far; finals that arrive later are split by it.
      this.turnLog.boundary(this.stats.sentMs);
    }
    this.sendControl(JSON.stringify({ type: "finalize" }), "envio-control");
  }

  setPhase(phase: number): void { if (this.mode === "local") this.local.setPhase?.(phase); }

  /**
   * Called before the coordinator's cleanup (release()/resetStream()). Order matters: the open turn is
   * closed first, while the association it was spoken under still answers `relation()`; only then does
   * the identity end, recording a pending attempt as `cancelado-off` and publishing `fin-sesion`.
   */
  prepareStop(): void {
    if (this.mode === "off" || this.ending) return;
    this.ending = true;
    this.turnLog.finish();
    this.identity.end("cancelado-off");
  }

  stop(): void {
    if (this.mode !== "off") {
      this.prepareStop();
      this.summaryValue = this.buildSummary();
    }
    this.generation++;
    if (this.mode === "local") this.local.stop();
    this.closeSocket();
    this.mode = "off";
    this.profileMatcher = null;
    this.status = "inactivo";
    this.reset();
  }

  text(): string {
    if (this.mode === "local") {
      const local = this.local.text();
      const current = this.stats.fallbacks > 0 && local ? `Local · sin identificación:\n${local}` : local;
      return clip(this.fallbackText && current ? `${this.fallbackText}\n${current}` : this.fallbackText || current);
    }
    return clip(this.render());
  }

  snapshot(): LocalTranscriptionSnapshot {
    const identity = this.identity.snapshot();
    if (this.mode === "local") {
      const local = this.local.snapshot();
      return { ...local, engine: this.stats.fallbacks > 0 ? "local (sin red)" : "local", soniox: this.scalars(),
        identity, turnsAvailable: false };
    }
    return {
      enabled: this.mode === "soniox", status: this.status, worker: this.mode === "soniox", busy: false,
      inputBufferedBytes: 0, accepted: this.stats.finalTokens, abstentions: 0, dropped: 0,
      engine: "soniox", soniox: this.scalars(), identity, turnsAvailable: this.mode === "soniox" && this.open && this.turnLog.active(),
    };
  }

  /** Reference captured by phrase action menus; null unless Soniox is live. */
  wearerActionRef(): WearerActionRef | null { return this.sonioxLive() ? this.identity.actionRef() : null; }
  identifyWearer(ref?: WearerActionRef): boolean { return this.sonioxLive() && this.identity.identify(ref); }
  finishWearerIdentification(ref?: WearerActionRef): boolean { return this.sonioxLive() && this.identity.finish(ref); }
  cancelWearerIdentification(ref?: WearerActionRef): boolean { return this.sonioxLive() && this.identity.cancel(ref); }
  assignWearer(ref: SpeakerRef): boolean { return this.sonioxLive() && this.identity.assign(ref); }

  /** Labels of the live stream with a short preview for menus only (never in snapshots or summaries). */
  observedSpeakers(): ObservedSpeaker[] {
    const ref = this.sonioxLive() ? this.identity.ref() : null;
    if (!ref) return [];
    const associated = this.identity.snapshot().speaker;
    return this.identity.observedSpeakers()
      .sort((a, b) => (a === associated ? -1 : b === associated ? 1 : 0))
      .map((speaker) => {
        const last = [...this.finals].reverse().find((entry) => entry.speaker === speaker)?.text.trim() ?? "";
        return { ...ref, speaker, preview: last.length > 30 ? `…${last.slice(-29)}` : last };
      });
  }

  subscribeTurns(listener: (turn: ConversationTurn) => void): () => void { return this.turnLog.subscribe(listener); }
  subscribeAssociation(listener: (event: WearerAssociationEvent) => void): () => void { return this.identity.subscribe(listener); }
  turns(): ConversationTurn[] { return this.turnLog.list(); }
  lastSessionSummary(): SonioxSessionSummary | null { return this.summaryValue ? { ...this.summaryValue } : null; }

  private sonioxLive(): boolean { return this.mode === "soniox" && this.open && !this.ending; }

  private scalars() {
    return { ...this.stats, lastError: this.lastError };
  }

  private startLocal(fallback: boolean): boolean {
    if (fallback) {
      this.stats.fallbacks++;
      // Keep the transcript, but retire «Yo» together with the live association. Numbered labels
      // belong to the completed Soniox stream; Whisper provides no speaker attribution.
      const previous = this.render(false);
      this.fallbackText = previous ? `Texto anterior · Soniox:\n${previous}` : "";
      // Soniox identity and interventions end with their stream; the text keeps its continuity until OFF.
      this.identity.end("motor-local");
      this.turnLog.clear();
    }
    this.mode = "local";
    const started = this.local.start(this.language);
    if (!started) { this.mode = "off"; this.status = "error"; }
    return started;
  }

  private fail(reason: string, category: string): void {
    if (this.mode !== "soniox") return;
    this.stats.errors++;
    this.lastError = reason.slice(0, 120);
    this.lastErrorCategory = category;
    try { this.transportFailure = this.socket?.diagnostics?.(); } catch { /* Diagnostics cannot prevent fallback. */ }
    this.generation++;
    this.closeSocket();
    // Fallback keeps the session alive with on-device Whisper (no network).
    if (!this.startLocal(true)) this.status = "error";
  }

  private keepalive(): void {
    if (this.mode === "soniox" && this.open && this.host.now() - this.lastSendAt >= KEEPALIVE_MS - 500) {
      if (!this.sendControl(JSON.stringify({ type: "keepalive" }), "envio-control")) return;
      this.lastSendAt = this.host.now();
    }
  }

  private sendControl(message: string, category: string): boolean {
    try { if (this.socket?.sendText(message)) return true; } catch { /* Native transport rejected control. */ }
    this.fail("envío de control fallido", category);
    return false;
  }

  /** §4.1: a final token's times are usable only when finite, ordered and within the audio sent. */
  private validTiming(token: Token): { startMs: number; endMs: number } | null {
    const start = token.start_ms, end = token.end_ms;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start < 0 || end < start || end > this.stats.sentMs + SENT_TOLERANCE_MS) return null;
    if (this.lastValidStart !== null && start < this.lastValidStart - MAX_REGRESSION_MS) return null;
    return { startMs: start, endMs: end };
  }

  private validProgress(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    if (value > this.stats.sentMs + SENT_TOLERANCE_MS) return null;
    if (this.lastProgress !== null && value < this.lastProgress) return null;
    return value;
  }

  private handle(raw: string): void {
    let message: any;
    try { message = JSON.parse(raw); } catch { return; }
    this.stats.messages++;
    if (message?.error_code != null) {
      const type = typeof message.error_type === "string" ? message.error_type : "";
      this.fail(`Soniox ${String(message.error_code)}: ${String(message.error_message ?? "")}`,
        DOCUMENTED_ERROR_TYPES.has(type) ? `servidor:${type}` : "servidor-otro");
      return;
    }
    const tokens: Token[] = Array.isArray(message?.tokens) ? message.tokens : [];
    const live = this.mode === "soniox" && this.open && !this.ending;
    let pending = "";
    let pendingSpeaker = "";
    let sawToken = false, sawFinal = false;
    // Precision 3: every token of the message is consumed before its progress is evaluated.
    for (const token of tokens) {
      const text = String(token?.text ?? "");
      if (text === "<end>" || text === "<fin>") {
        if (token?.is_final && live) {
          this.identity.observeMarker();
          this.turnLog.marker(text === "<end>" ? "end" : "fin");
        }
        continue;
      }
      const speaker = token?.speaker == null ? "" : String(token.speaker);
      sawToken = true;
      if (token?.is_final) {
        sawFinal = true;
        this.stats.finalTokens++;
        this.appendFinal(speaker, text);
        if (live) {
          const timing = this.validTiming(token);
          if (timing) this.lastValidStart = timing.startMs;
          else this.invalidTimingTokens++;
          const final: FinalToken = { text, speaker: speaker || null, startMs: timing?.startMs ?? null,
            endMs: timing?.endMs ?? null, valid: timing !== null };
          if (final.speaker) this.sessionSpeakers.add(final.speaker);
          this.identity.observeFinal(final);
          if (timing) this.profileMatcher?.token(final.speaker, timing.startMs, timing.endMs);
          else this.profileMatcher?.reset(this.stats.sentMs);
          this.turnLog.accept(final);
        }
      } else {
        if (!pendingSpeaker) pendingSpeaker = speaker;
        pending += text;
      }
    }
    this.pending = pending;
    this.pendingSpeaker = pendingSpeaker;
    if (this.firstSendAt !== null) {
      if (sawToken && this.firstTokenAfterMs === null) this.firstTokenAfterMs = this.host.now() - this.firstSendAt;
      if (sawFinal && this.firstFinalAfterMs === null) this.firstFinalAfterMs = this.host.now() - this.firstSendAt;
    }
    if (live && message?.final_audio_proc_ms !== undefined) {
      const progress = this.validProgress(message.final_audio_proc_ms);
      if (progress === null) this.invalidProgress++;
      else {
        this.lastProgress = progress;
        this.turnLog.progress(progress);
        this.identity.progress(progress);
        this.profileMatcher?.finalized(progress);
      }
    }
    if (typeof message?.total_audio_proc_ms === "number" && Number.isFinite(message.total_audio_proc_ms)) {
      this.lastTotal = message.total_audio_proc_ms;
    }
    if (message?.finished && this.mode === "soniox" && !this.ending) this.fail("sesión finalizada por el servidor", "fin-servidor");
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

  /** «Yo» for the associated label, `N` for known others, `N?` for labels seen after the association. */
  private label(speaker: string, useIdentity = true): string {
    if (!speaker) return "";
    if (!useIdentity || !this.identity.snapshot().speaker) return `${speaker}: `;
    const relation = this.identity.relation(speaker);
    return relation === "portador" ? "Yo: " : relation === "otro" ? `${speaker}: ` : `${speaker}?: `;
  }

  private render(useIdentity = true): string {
    const lines = this.finals.map((entry) => this.label(entry.speaker, useIdentity) + entry.text.trim()).filter((line) => line.trim());
    const pending = this.pending.trim();
    if (pending) {
      const last = this.finals[this.finals.length - 1];
      if (last && (!this.pendingSpeaker || last.speaker === this.pendingSpeaker) && lines.length) {
        lines[lines.length - 1] += ` ${pending}`;
      } else lines.push(this.label(this.pendingSpeaker, useIdentity) + pending);
    }
    return lines.join("\n");
  }

  private buildSummary(): SonioxSessionSummary {
    const backlog = this.lastProgress === null ? null : Math.max(0, this.stats.sentMs - this.lastProgress);
    return {
      engineFinal: this.mode === "local" ? (this.stats.fallbacks > 0 ? "local (sin red)" : "local") : "soniox",
      sentAudioMs: this.stats.sentMs, finalAudioProcMs: this.lastProgress, totalAudioProcMs: this.lastTotal,
      backlogAtStopMs: backlog, firstTokenAfterMs: this.firstTokenAfterMs, firstFinalAfterMs: this.firstFinalAfterMs,
      messages: this.stats.messages, finalTokens: this.stats.finalTokens, turns: this.turnLog.count(),
      speakersSeen: this.sessionSpeakers.size, invalidTimingTokens: this.invalidTimingTokens,
      invalidProgress: this.invalidProgress, fallbacks: this.stats.fallbacks, errors: this.stats.errors,
      lastErrorCategory: this.lastErrorCategory, identity: this.identity.summary(),
      ...(this.profileMatcher ? { profile: this.profileMatcher.summary() } : {}),
      ...(this.transportFailure ? { transportFailure: { ...this.transportFailure } } : {}),
    };
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
    this.stats = emptyStats();
    this.lastError = "";
    this.lastValidStart = null;
    this.lastProgress = null;
    this.lastTotal = null;
    this.firstSendAt = null;
    this.firstTokenAfterMs = null;
    this.firstFinalAfterMs = null;
    this.invalidTimingTokens = 0;
    this.invalidProgress = 0;
    this.lastErrorCategory = null;
    this.transportFailure = undefined;
    this.sessionSpeakers = new Set();
    this.turnLog.clear();
  }
}

function clip(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  const tail = text.slice(-MAX_TEXT_CHARS);
  const space = tail.indexOf(" ");
  return space >= 0 && space < 40 ? tail.slice(space + 1) : tail;
}
