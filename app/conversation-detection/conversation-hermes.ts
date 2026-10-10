import { type ConversationCaptureCoordinator, type DetectorSnapshot } from "./coordinator";
import { ConversationEpisodeTracker, EPISODE_MODALITIES, type EpisodeContext, type EpisodeModality, type EpisodePolicy,
  type EpisodeRef } from "./conversation-episodes";
import { type ConversationTurn } from "./conversation-turns";
import { emptyConversationMetrics, LatencyMetric, LATENCY_BUCKETS_MS } from "./conversation-metrics";
import { type WearerAssociationEvent } from "./wearer-identity";
import { type ConversationChannel, type ConversationResult } from "../assistant/conversation-channel";
import { emptyPrefilterCounters, isSingleForeignVoice } from "./conversation-prefilter";
import { MechanicalGatekeeper, FILTER_POLICY } from "./mechanical-gatekeeper";

type Source = Pick<ConversationCaptureCoordinator, "snapshot" | "subscribe" | "subscribeTurns" | "subscribeAssociation" | "wearerActionRef">;
type Flight = { ref: EpisodeRef; mode: "assess" | "assist"; at: number; turnAt: number;
  baseline: { chunks?: number; sentMs?: number; finalTokens?: number } };
type Channel = Pick<ConversationChannel, "isReady" | "isEnabled" | "setEnabled" | "request" | "cancel">
  & Partial<Pick<ConversationChannel, "supportsOptionalIdentity" | "statistics" | "resetStatistics" | "isSupported"
    | "destination" | "supportsDailyContext" | "setDailyContextEnabled">>;
/**
 * Hermes link of an armed session, independent of capture. `sin-red`: the socket dropped and the same
 * authorized destination may come back; `revocado`: server/token changed or auth failed, no resume.
 */
export type HermesLink = "listo" | "sin-red" | "revocado";
/** Why the last armed session stopped; kept after OFF until the next ON. */
export type HermesStopCause = "" | "off" | "captura" | "motor" | "fin-sesion";
/** Aggregate diagnostics of the current/last armed session. Counters only, never text or labels. */
export type ConversationHermesCounters = {
  turnsAccepted: number; turnsIgnored: number; candidates: number; assessments: number; assists: number;
  topics: number; abstentions: number; messages: number; delivered: number; failures: number;
  /** Turns heard while the link was down: dropped, never replayed after reconnecting. */
  turnsOffline: number; linkLosses: number; linkResumes: number; offlineMs: number;
};
const emptyCounters = (): ConversationHermesCounters => ({ turnsAccepted: 0, turnsIgnored: 0, candidates: 0,
  assessments: 0, assists: 0, topics: 0, abstentions: 0, messages: 0, delivered: 0, failures: 0,
  turnsOffline: 0, linkLosses: 0, linkResumes: 0, offlineMs: 0 });
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
  /** Created only at explicit ON; absence preserves the original route exactly. */
  mechanicalFilterEnabled?(): boolean;
  dailyContextEnabled?(): boolean;
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
  private prefilter = emptyPrefilterCounters();
  private metrics = emptyConversationMetrics();
  private clockAt = 0;
  private wasListening = false;
  private outputTurnAt = 0;
  private outputPresented = false;
  private readonly filter = new MechanicalGatekeeper();
  private filtered = false;
  private pendingTextAt: number | null = null;
  private budgetBlocked = false;
  private notice = "";
  private noticeUntil = 0;
  private singleVoice = { enabled: false, skipped: 0 };
  private link: HermesLink = "listo";
  private linkLostAt = 0;
  private destination: number | undefined;
  /** Daily-memory consent frozen at ON; a reconnect can only restore this, never widen it. */
  private dailyContext = false;
  private stopCause: HermesStopCause = "";
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
   * A null request budget follows the capture session's lifetime (manual ON: no time limit, 24 h native safety bound).
   * Cadence, one pending evaluation and per-request deadlines still apply.
   */
  begin(maxRequests: number | null = 8, modality: EpisodeModality = "identidad-requerida",
    options: { singleVoiceFilter?: boolean } = {}): boolean {
    this.stop();
    if (!EPISODE_MODALITIES.includes(modality)) return false;
    if (modality === "identidad-opcional" && !this.channel.supportsOptionalIdentity?.()) return false;
    if (!this.channel.setEnabled(true)) return false;
    this.enabled = true;
    this.link = "listo"; this.linkLostAt = 0; this.stopCause = "";
    this.destination = this.channel.destination?.();
    this.dailyContext = this.host.dailyContextEnabled?.() === true;
    this.filtered = this.host.mechanicalFilterEnabled?.() === true;
    this.filter.begin();
    this.pendingTextAt = null;
    this.budgetBlocked = false; this.notice = ""; this.noticeUntil = 0;
    this.modality = modality;
    this.counters = emptyCounters();
    this.prefilter = emptyPrefilterCounters();
    this.singleVoice = { enabled: options.singleVoiceFilter === true, skipped: 0 };
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

  /**
   * Ends the armed session. Never touches capture: losing Hermes (network, engine, server) leaves the
   * local transcript running; only the user's OFF or the capture itself ends listening.
   */
  stop(cause: HermesStopCause = "off"): void {
    const wasEnabled = this.enabled;
    if (wasEnabled) { this.updateClock(false); this.finishFlight(); this.closeOffline(); this.stopCause = cause; }
    this.enabled = false;
    this.filter.interrupt(); this.pendingTextAt = null;
    this.flight = null;
    this.channel.setEnabled(false);
    this.cancelTimer?.(); this.cancelTimer = null;
    this.tracker.stop(); this.current = null; this.attempted = "";
    this.associationVersion = 0;
    this.clearOutput();
    this.messageHistory = [];
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
      delivered: this.counters.delivered, link: this.link, stopCause: this.stopCause,
      notice: this.enabled && this.host.now() < this.noticeUntil ? this.notice : "",
      filterStatus: this.filterStatus(),
      listening: this.enabled && this.source.snapshot().state === "escuchando", episode: this.tracker.snapshot() };
  }

  /** Session diagnostics kept after OFF until the next ON: aggregate counters only. */
  diagnostics() {
    if (this.enabled) this.updateClock(this.source.snapshot().state === "escuchando");
    if (this.enabled && this.link !== "listo") this.closeOffline(true);
    const metrics = Object.fromEntries(Object.entries(this.metrics).map(([key, value]) =>
      [key, value instanceof LatencyMetric ? value.snapshot() : typeof value === "object" ? { ...value } : value]));
    return { modality: this.modality, requests: this.requests, counters: { ...this.counters },
      prefilter: { ...this.prefilter }, singleVoice: { ...this.singleVoice },
      filters: { enabled: this.filtered, ...this.filter.snapshot(this.host.now()) },
      channel: this.channel.statistics?.() ?? null, metrics: { ...metrics,
        latencyBucketsMs: [...LATENCY_BUCKETS_MS], requestsPerListeningMinute: this.metrics.listeningMs
          ? Math.round(this.requests * 60_000 / this.metrics.listeningMs * 100) / 100 : null } };
  }

  filterStatus(): string {
    if (this.enabled && this.link === "sin-red") return "Sin conexión con Hermes. La transcripción continúa; se reanudará al volver la red.";
    if (this.enabled && this.link === "revocado") return "Hermes desconectado en esta sesión (servidor o acceso cambiado). La transcripción continúa.";
    if (!this.enabled || !this.filtered) return "";
    const report = this.filter.snapshot(this.host.now());
    return report.remaining === 0
      ? `Hermes en pausa por límite de llamadas. Disponible en ${Math.max(1, Math.ceil(report.retryAfterMs / 60_000))} min. La transcripción continúa.`
      : "";
  }

  private updateFilterNotice(): void {
    if (this.link !== "listo") return;
    const blocked = !!this.filterStatus();
    if (blocked === this.budgetBlocked) return;
    this.budgetBlocked = blocked;
    this.notice = blocked ? this.filterStatus() : "Hermes vuelve a estar disponible. La escucha continúa.";
    this.noticeUntil = this.host.now() + 30_000;
    this.host.changed();
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
    if (!snapshot.enabled || snapshot.state === "error") { this.stop("captura"); return; }
    if (snapshot.transcription?.engine && snapshot.transcription.engine !== "soniox"
      && !(this.modality === "identidad-opcional" && snapshot.transcription.engine === "local")) {
      this.stop("motor"); return;
    }
    if (snapshot.state !== "escuchando") this.interrupt();
    this.host.changed();
  }

  private association(event: WearerAssociationEvent): void {
    if (!this.enabled || !this.source.snapshot().enabled) return;
    if (event.kind === "fin-sesion") {
      if (this.current?.sessionId === event.sessionId && this.current.streamId === event.streamId
        && event.version >= this.associationVersion) this.stop("fin-sesion");
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
      this.filter.interrupt(); this.pendingTextAt = null;
      this.finishFlight(); this.channel.cancel(); this.attempted = ""; this.clearOutput();
    }
    this.host.changed();
  }

  private turn(turn: ConversationTurn): void {
    if (this.enabled && this.link !== "listo") { this.counters.turnsOffline++; return; }
    if (!this.enabled || !this.channel.isReady() || !this.source.snapshot().enabled
      || this.source.snapshot().state !== "escuchando") return;
    if (this.modality === "identidad-opcional" && this.source.snapshot().transcription?.engine === "local" && isLocalWindowTurn(turn)
      && (this.current?.sessionId !== turn.sessionId || this.current.streamId !== turn.streamId)) {
      this.interrupt(); this.clearOutput();
      this.current = { sessionId: turn.sessionId, streamId: turn.streamId };
      this.associationVersion = 0;
      this.tracker.start(turn.sessionId, turn.streamId, this.modality);
    }
    const before = this.tracker.snapshot();
    const accepted = this.tracker.accept(turn);
    const after = this.tracker.snapshot();
    this.prefilter.empty += after.prefilter.empty - before.prefilter.empty;
    this.prefilter.duplicate += after.prefilter.duplicate - before.prefilter.duplicate;
    if (accepted) {
      this.lastTextAt = this.host.now();
      this.pendingTextAt ??= this.lastTextAt;
      this.counters.turnsAccepted++;
      if (this.flight) this.metrics.turnsDuringInference++;
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
      this.filter.interrupt(); this.pendingTextAt = null;
      if (this.outputRef) this.outputStale = true;
    }
    this.host.changed();
  }

  /** Pending work only; the lens presenter already hides a delivered message while not listening. */
  private interrupt(): void {
    this.filter.interrupt(); this.pendingTextAt = null;
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
    this.updateFilterNotice();
    if (!this.channel.isEnabled() && !this.followLink()) return;
    if (!this.channel.isReady()) { this.interrupt(); return; }
    this.tracker.tick();
    const state = this.tracker.snapshot().state;
    if (this.flight && state !== (this.flight.mode === "assess" ? "candidata" : "activa")) {
      this.finishFlight(); this.channel.cancel();
    }
    if (snapshot.state !== "escuchando" || this.flight || (this.maxRequests !== null && this.requests >= this.maxRequests)
      || (this.host.now() - this.lastTextAt < 2000
        && (!this.filtered || this.pendingTextAt === null || this.host.now() - this.pendingTextAt < FILTER_POLICY.continuousSpeechMs))
      || this.host.now() - this.lastRequestAt < 5000) return;
    const context = state === "candidata" ? this.tracker.assessmentContext()
      : state === "activa" ? this.tracker.confirmedContext() : null;
    if (context) this.request(context, state === "candidata" ? "assess" : "assist");
  }

  /**
   * The channel was disabled under an armed session (socket loss resets consent). Capture is never
   * stopped here. Returns true once the channel is re-armed after a fresh authenticated handshake of the
   * same destination with the capabilities this session needs; old context is not replayed.
   */
  private followLink(): boolean {
    const revoked = this.destination !== undefined && this.channel.destination?.() !== this.destination;
    if (this.link === "listo" || (revoked && this.link === "sin-red")) {
      if (this.link === "listo") {
        this.linkLostAt = this.host.now(); this.counters.linkLosses++;
        this.interrupt(); this.clearOutput();
      }
      this.link = revoked ? "revocado" : "sin-red";
      this.notice = this.filterStatus(); this.noticeUntil = this.host.now() + 30_000;
      this.host.changed();
    }
    if (this.link === "revocado" || this.channel.isSupported?.() !== true) return false;
    if (this.modality === "identidad-opcional" && !this.channel.supportsOptionalIdentity?.()) return false;
    // Restore only the consent frozen at ON; a server without daily context gets the plain contract.
    this.channel.setDailyContextEnabled?.(this.dailyContext && this.channel.supportsDailyContext?.() === true);
    if (!this.channel.setEnabled(true)) return false;
    this.closeOffline();
    this.counters.linkResumes++;
    // New context only: the episode heard before/during the outage is not sent after reconnecting.
    this.tracker.stop(); this.current = null; this.associationVersion = 0; this.attempted = "";
    this.filter.interrupt(); this.pendingTextAt = null; this.lastRequestAt = -Infinity;
    this.notice = "Hermes reconectado. La escucha continúa con lo que se diga a partir de ahora.";
    this.noticeUntil = this.host.now() + 30_000;
    this.host.changed();
    return true;
  }

  /** Accumulates offline time; `keepOpen` only measures the running outage for diagnostics. */
  private closeOffline(keepOpen = false): void {
    if (this.link === "listo") return;
    const now = this.host.now();
    this.counters.offlineMs += Math.max(0, now - this.linkLostAt);
    this.linkLostAt = now;
    if (!keepOpen) this.link = "listo";
  }

  private request(context: EpisodeContext, mode: "assess" | "assist"): void {
    const key = `${context.ref.sessionId}/${context.ref.streamId}/${context.ref.associationVersion}/${context.ref.episodeId}/${context.ref.revision}/${mode}`;
    if (key === this.attempted || (this.maxRequests !== null && this.requests >= this.maxRequests)
      || !this.enabled || !this.channel.isReady()) return;
    if (this.singleVoice.enabled && isSingleForeignVoice(context.turns)) {
      this.attempted = key; this.singleVoice.skipped++; this.host.changed(); return;
    }
    if (this.filtered) {
      const decision = this.filter.decide(context, mode, this.host.now());
      // Time-based deferrals retry the latest bounded context. Short turns stay available to grow.
      if (decision !== "send") { this.host.changed(); return; }
    }
    this.attempted = key;
    this.sendHermes(context, mode);
  }

  private sendHermes(context: EpisodeContext, mode: "assess" | "assist"): void {
    if (!this.enabled || !this.channel.isReady() || this.source.snapshot().state !== "escuchando"
      || (this.maxRequests !== null && this.requests >= this.maxRequests)) return;
    this.lastRequestAt = this.host.now();
    if (this.filtered) this.filter.submitted(context, mode, this.host.now());
    this.pendingTextAt = null;
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
import { isLocalWindowTurn } from "./local-conversation-turns";
