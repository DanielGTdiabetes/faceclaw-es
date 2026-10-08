import { type ConversationCaptureCoordinator, type DetectorSnapshot } from "./coordinator";
import { ConversationEpisodeTracker, EPISODE_MODALITIES, type EpisodeContext, type EpisodeModality, type EpisodePolicy,
  type EpisodeRef } from "./conversation-episodes";
import { type ConversationTurn } from "./conversation-turns";
import { emptyConversationMetrics, LatencyMetric, LATENCY_BUCKETS_MS } from "./conversation-metrics";
import { type WearerAssociationEvent } from "./wearer-identity";
import { type ConversationChannel, type ConversationResult } from "../assistant/conversation-channel";

type Source = Pick<ConversationCaptureCoordinator, "snapshot" | "subscribe" | "subscribeTurns" | "subscribeAssociation" | "wearerActionRef">;
type Flight = { ref: EpisodeRef; mode: "assess" | "assist"; at: number; turnAt: number;
  baseline: { chunks?: number; sentMs?: number; finalTokens?: number } };
type Channel = Pick<ConversationChannel, "isReady" | "isEnabled" | "setEnabled" | "request" | "cancel">
  & Partial<Pick<ConversationChannel, "supportsOptionalIdentity" | "statistics" | "resetStatistics">>;
/** Aggregate diagnostics of the current/last armed session. Counters only, never text or labels. */
export type ConversationHermesCounters = {
  turnsAccepted: number; turnsIgnored: number; candidates: number; assessments: number; assists: number;
  topics: number; abstentions: number; messages: number; delivered: number; failures: number;
};
const emptyCounters = (): ConversationHermesCounters => ({ turnsAccepted: 0, turnsIgnored: 0, candidates: 0,
  assessments: 0, assists: 0, topics: 0, abstentions: 0, messages: 0, delivered: 0, failures: 0 });
/** A delivered message is kept at least this long even while the conversation goes on. */
export const HERMES_MESSAGE_MIN_MS = 12_000;
/** Upper bound for a delivered message on the lenses. */
export const HERMES_MESSAGE_MAX_MS = 30_000;
/** Phone-only RAM list of the current session; cleared on OFF and never persisted. */
export const HERMES_HISTORY_MAX = 5;
/**
 * Bridge budget for one evaluation. Model latency alone is often 3-5 s, so a tighter budget left
 * no turn able to finish; the bridge accepts up to 30 s.
 */
export const HERMES_REQUEST_TIMEOUT_MS = 15_000;
export type ConversationHermesHistoryEntry = { at: number; text: string };

export type ConversationHermesHost = {
  now(): number;
  /** Wall-clock time for the phone history; defaults to Date.now(). */
  wallClock?(): number;
  every(callback: () => void, ms: number): () => void;
  onOutput(text: string | null): void;
  changed(): void;
  onStopped?(): void;
};

/** Wiring owner: explicit opt-in, bounded evaluation rate, no capture or screen operations. */
export class ConversationHermesRuntime {
  private enabled = false;
  private tracker: ConversationEpisodeTracker;
  private current: { sessionId: string; streamId: number } | null = null;
  private associationVersion = 0;
  private flight: Flight | null = null;
  private outputRef: EpisodeRef | null = null;
  private outputAt = 0;
  private outputConfirmation: (() => boolean) | null = null;
  /** The conversation moved on after delivery: retire once HERMES_MESSAGE_MIN_MS has elapsed. */
  private outputStale = false;
  private messageHistory: ConversationHermesHistoryEntry[] = [];
  private cancelTimer: (() => void) | null = null;
  private lastTextAt = 0;
  private lastRequestAt = -Infinity;
  private attempted = "";
  private requests = 0;
  private maxRequests: number | null = 8;
  private modality: EpisodeModality = "identidad-requerida";
  private counters = emptyCounters();
  private metrics = emptyConversationMetrics();
  private clockAt = 0;
  private wasListening = false;
  private outputTurnAt = 0;
  private outputPresented = false;
  private readonly unsubscribe: (() => void)[];

  constructor(private readonly source: Source, private readonly channel: Channel,
    private readonly host: ConversationHermesHost, policy: EpisodePolicy) {
    this.tracker = new ConversationEpisodeTracker(() => host.now(), policy);
    this.unsubscribe = [source.subscribeAssociation((event) => this.association(event)),
      source.subscribeTurns((turn) => this.turn(turn)), source.subscribe((snapshot) => this.observe(snapshot))];
  }

  /**
   * Called immediately before explicit ON. Never starts capture and never runs on reconnect.
   * The modality is captured for the whole session; optional identity needs a conv/2 bridge.
   * A null request budget follows the capture session's lifetime (manual ON: at most 20 minutes).
   * Cadence, one pending evaluation and per-request deadlines still apply.
   */
  begin(maxRequests: number | null = 8, modality: EpisodeModality = "identidad-requerida"): boolean {
    this.stop();
    if (!EPISODE_MODALITIES.includes(modality)) return false;
    if (modality === "identidad-opcional" && !this.channel.supportsOptionalIdentity?.()) return false;
    if (!this.channel.setEnabled(true)) return false;
    this.enabled = true;
    this.modality = modality;
    this.counters = emptyCounters();
    this.metrics = emptyConversationMetrics();
    this.clockAt = this.host.now(); this.wasListening = false;
    this.channel.resetStatistics?.();
    this.requests = 0;
    this.maxRequests = maxRequests === null ? null
      : Number.isFinite(maxRequests) ? Math.max(1, Math.min(80, Math.floor(maxRequests))) : 8;
    this.lastRequestAt = -Infinity;
    this.cancelTimer = this.host.every(() => this.tick(), 500);
    this.host.changed();
    return true;
  }

  stop(): void {
    const wasEnabled = this.enabled;
    if (wasEnabled) { this.updateClock(false); this.finishFlight(); }
    this.enabled = false;
    this.flight = null;
    this.channel.setEnabled(false);
    this.cancelTimer?.(); this.cancelTimer = null;
    this.tracker.stop(); this.current = null; this.attempted = "";
    this.associationVersion = 0;
    this.clearOutput();
    this.messageHistory = [];
    if (wasEnabled) this.host.onStopped?.();
    this.host.changed();
  }

  dispose(): void { this.stop(); for (const unsubscribe of this.unsubscribe) unsubscribe(); }

  /** Explicit dismissal (tap on the lens overlay). */
  dismissOutput(): void { if (this.outputRef) this.clearOutput(); }

  /** Last delivered messages of the current session, newest first. Empty after OFF. */
  history(): readonly ConversationHermesHistoryEntry[] { return this.messageHistory; }

  /** Capture the exact output before paint; a later replacement, OFF or pause invalidates this receipt. */
  capturePresentation(): (() => void) | null {
    const ref = this.outputRef, confirm = this.outputConfirmation;
    if (!ref || !confirm) return null;
    return () => {
      if (this.outputRef !== ref || this.outputConfirmation !== confirm || !this.enabled
        || !this.source.snapshot().enabled || this.source.snapshot().state !== "escuchando") return;
      if (!this.outputPresented) {
        this.outputPresented = true;
        this.metrics.nativeSent++;
        this.metrics.resultToNativeSent.add(this.host.now() - this.outputAt);
        this.metrics.turnToNativeSent.add(this.host.now() - this.outputTurnAt);
      }
      if (confirm()) this.outputConfirmation = null;
    };
  }

  snapshot() {
    return { enabled: this.enabled, busy: this.flight !== null, requests: this.requests, modality: this.modality,
      delivered: this.counters.delivered,
      listening: this.enabled && this.source.snapshot().state === "escuchando", episode: this.tracker.snapshot() };
  }

  /** Session diagnostics kept after OFF until the next ON: aggregate counters only. */
  diagnostics() {
    if (this.enabled) this.updateClock(this.source.snapshot().state === "escuchando");
    const metrics = Object.fromEntries(Object.entries(this.metrics).map(([key, value]) =>
      [key, value instanceof LatencyMetric ? value.snapshot() : typeof value === "object" ? { ...value } : value]));
    return { modality: this.modality, requests: this.requests, counters: { ...this.counters },
      channel: this.channel.statistics?.() ?? null, metrics: { ...metrics,
        latencyBucketsMs: [...LATENCY_BUCKETS_MS], requestsPerListeningMinute: this.metrics.listeningMs
          ? Math.round(this.requests * 60_000 / this.metrics.listeningMs * 100) / 100 : null } };
  }

  private updateClock(listening: boolean): void {
    const now = this.host.now(), delta = Math.max(0, now - this.clockAt);
    if (this.wasListening) this.metrics.listeningMs += delta;
    this.clockAt = now; this.wasListening = listening && this.enabled;
  }

  /** Finish even canceled flights; source counters are cumulative only within the live capture. */
  private finishFlight(): void {
    const flight = this.flight;
    if (!flight) return;
    this.metrics.busyMs += Math.max(0, this.host.now() - flight.at);
    const snapshot = this.source.snapshot(), baseline = flight.baseline;
    for (const [before, after, key] of [
      [baseline.chunks, snapshot.metrics?.chunks, "chunksDuringInference"],
      [baseline.sentMs, snapshot.transcription?.soniox?.sentMs, "sentAudioMsDuringInference"],
      [baseline.finalTokens, snapshot.transcription?.soniox?.finalTokens, "finalTokensDuringInference"],
    ] as const) {
      if (before !== undefined && after !== undefined && after >= before) this.metrics[key] += after - before;
    }
    if (baseline.chunks !== undefined && snapshot.metrics?.chunks !== undefined) this.metrics.measuredFlights++;
    this.flight = null;
  }

  private observe(snapshot: DetectorSnapshot): void {
    if (!this.enabled) return;
    this.updateClock(snapshot.enabled && snapshot.state === "escuchando");
    if (!snapshot.enabled || snapshot.state === "error"
      || (snapshot.transcription?.engine && snapshot.transcription.engine !== "soniox"
        && !(this.modality === "identidad-opcional" && snapshot.transcription.engine === "local"))) {
      this.stop(); return;
    }
    if (snapshot.state !== "escuchando") this.interrupt();
    this.host.changed();
  }

  private association(event: WearerAssociationEvent): void {
    if (!this.enabled || !this.source.snapshot().enabled) return;
    if (event.kind === "fin-sesion") {
      if (this.current?.sessionId === event.sessionId && this.current.streamId === event.streamId
        && event.version >= this.associationVersion) this.stop();
      return;
    }
    if (!event.sessionId || !event.streamId) return;
    const live = this.source.wearerActionRef();
    if (!live || live.sessionId !== event.sessionId || live.streamId !== event.streamId || live.version !== event.version) return;
    if (this.current?.sessionId !== event.sessionId || this.current.streamId !== event.streamId) {
      this.interrupt(); this.clearOutput();
      this.current = { sessionId: event.sessionId, streamId: event.streamId };
      this.tracker.start(event.sessionId, event.streamId, this.modality);
      this.associationVersion = 0;
    }
    const before = this.tracker.snapshot();
    if (!this.tracker.association(event)) return;
    this.associationVersion = event.version;
    if (this.tracker.snapshot().chars !== before.chars || event.kind === "borrado") {
      this.finishFlight(); this.channel.cancel(); this.attempted = ""; this.clearOutput();
    }
    this.host.changed();
  }

  private turn(turn: ConversationTurn): void {
    if (!this.enabled || !this.channel.isReady() || !this.source.snapshot().enabled
      || this.source.snapshot().state !== "escuchando") return;
    if (this.modality === "identidad-opcional" && this.source.snapshot().transcription?.engine === "local" && isAnonymousLocalTurn(turn)
      && (this.current?.sessionId !== turn.sessionId || this.current.streamId !== turn.streamId)) {
      this.interrupt(); this.clearOutput();
      this.current = { sessionId: turn.sessionId, streamId: turn.streamId };
      this.associationVersion = 0;
      this.tracker.start(turn.sessionId, turn.streamId, this.modality);
    }
    const before = this.tracker.snapshot();
    const accepted = this.tracker.accept(turn);
    if (accepted) {
      this.lastTextAt = this.host.now();
      this.counters.turnsAccepted++;
      if (this.flight) this.metrics.turnsDuringInference++;
      const after = this.tracker.snapshot();
      if (before.state === "esperando" && after.state === "candidata") this.counters.candidates++;
    } else this.counters.turnsIgnored++;
    if (accepted) {
      // A newer turn of the same episode lets the pending evaluation finish: the answer still fits
      // the topic, and cancelling on every turn meant no answer ever arrived while people talked.
      // A delivered message stays readable (retired by tick after the minimum).
      if (this.outputRef) this.outputStale = true;
    } else if (before.chars > 0 && this.tracker.snapshot().chars === 0) {
      // The episode ended: its pending evaluation no longer applies.
      this.finishFlight(); this.channel.cancel();
      if (this.outputRef) this.outputStale = true;
    }
    this.host.changed();
  }

  /** Pending work only; the lens presenter already hides a delivered message while not listening. */
  private interrupt(): void {
    this.finishFlight(); this.channel.cancel(); this.tracker.interrupt();
    this.attempted = "";
    if (this.outputRef) this.outputStale = true;
  }

  private clearOutput(): void { this.outputRef = null; this.outputConfirmation = null; this.outputStale = false; this.host.onOutput(null); }

  private expireOutput(): void {
    if (!this.outputRef) return;
    const age = this.host.now() - this.outputAt;
    if (age >= HERMES_MESSAGE_MAX_MS
      || (age >= HERMES_MESSAGE_MIN_MS && (this.outputStale || !this.tracker.acceptsOutput(this.outputRef)))) this.clearOutput();
  }

  private tick(): void {
    if (!this.enabled) return;
    const snapshot = this.source.snapshot();
    this.observe(snapshot);
    if (!this.enabled) return;
    this.expireOutput();
    // A disconnected channel does not re-arm this runtime when the bridge returns.
    if (!this.channel.isEnabled()) { this.stop(); return; }
    if (!this.channel.isReady()) { this.interrupt(); return; }
    this.tracker.tick();
    const state = this.tracker.snapshot().state;
    if (this.flight && state !== (this.flight.mode === "assess" ? "candidata" : "activa")) {
      this.finishFlight(); this.channel.cancel();
    }
    if (snapshot.state !== "escuchando" || this.flight || (this.maxRequests !== null && this.requests >= this.maxRequests)
      || this.host.now() - this.lastTextAt < 2000 || this.host.now() - this.lastRequestAt < 5000) return;
    const context = state === "candidata" ? this.tracker.assessmentContext()
      : state === "activa" ? this.tracker.confirmedContext() : null;
    if (context) this.request(context, state === "candidata" ? "assess" : "assist");
  }

  private request(context: EpisodeContext, mode: "assess" | "assist"): void {
    const key = `${context.ref.sessionId}/${context.ref.streamId}/${context.ref.associationVersion}/${context.ref.episodeId}/${context.ref.revision}/${mode}`;
    if (key === this.attempted || (this.maxRequests !== null && this.requests >= this.maxRequests)
      || !this.enabled || !this.channel.isReady()) return;
    this.attempted = key;
    this.lastRequestAt = this.host.now();
    this.requests++;
    if (mode === "assess") this.counters.assessments++; else this.counters.assists++;
    const snapshot = this.source.snapshot();
    this.metrics.turnToRequest.add(this.host.now() - this.lastTextAt);
    if (snapshot.lastVadStopAtMs != null) this.metrics.vadStopToRequest.add(this.host.now() - snapshot.lastVadStopAtMs);
    const flight: Flight = { ref: { ...context.ref }, mode, at: this.host.now(), turnAt: this.lastTextAt,
      baseline: { chunks: snapshot.metrics?.chunks, sentMs: snapshot.transcription?.soniox?.sentMs,
        finalTokens: snapshot.transcription?.soniox?.finalTokens } };
    this.flight = flight;
    const accepted = this.channel.request(context, mode, HERMES_REQUEST_TIMEOUT_MS, (result) => this.result(flight, result));
    if (!accepted && this.flight === flight) this.finishFlight();
    this.host.changed();
  }

  private result(flight: Flight, result: ConversationResult | null): void {
    if (this.flight !== flight) return;
    this.metrics[flight.mode === "assess" ? "assessRoundTrip" : "assistRoundTrip"].add(this.host.now() - flight.at);
    this.finishFlight();
    if (result?.timing) {
      const t = result.timing;
      for (const [key, ms] of [["primary", t.primaryMs], ["fallback", t.fallbackMs], ["queue", t.queueMs],
        ["primaryFirstText", t.primaryFirstTextMs], ["fallbackFirstText", t.fallbackFirstTextMs],
        ["cancelWait", t.cancelWaitMs]] as const) if (ms !== undefined) this.metrics[key].add(ms);
      this.metrics.providerAttempts += t.attempts ?? 0; this.metrics.apiCalls += t.apiCalls ?? 0;
      if (t.fallbackReason) { this.metrics.fallbacks++; this.metrics.fallbackReasons[t.fallbackReason]++; }
    }
    if (!result) this.counters.failures++;
    else if (result.mode === "assess") {
      if (result.verdict === "tema") this.counters.topics++; else this.counters.abstentions++;
    } else if (result.text) this.counters.messages++;
    else this.counters.abstentions++;
    if (!result || !this.enabled || !this.channel.isReady() || !this.source.snapshot().enabled
      || this.source.snapshot().state !== "escuchando") { this.host.changed(); return; }
    if (result.mode === "assess") {
      if (this.tracker.assess(result.ref, result.verdict) && result.verdict === "tema") {
        const context = this.tracker.confirmedContext();
        // One immediate assistance request after classification; no token/word-triggered loop.
        if (context) this.request(context, "assist");
      }
    } else if (this.tracker.acceptsOutput(result.ref) && result.text) {
      this.counters.delivered++;
      this.outputRef = { ...result.ref };
      this.outputConfirmation = result.confirmPresented ?? null;
      this.outputAt = this.host.now();
      this.outputTurnAt = flight.turnAt;
      this.outputPresented = false;
      this.outputStale = false;
      this.messageHistory = [{ at: this.host.wallClock?.() ?? Date.now(), text: result.text },
        ...this.messageHistory].slice(0, HERMES_HISTORY_MAX);
      this.host.onOutput(result.text);
    }
    this.host.changed();
  }
}
import { isAnonymousLocalTurn } from "./local-conversation-turns";
