import { type ConversationCaptureCoordinator, type DetectorSnapshot } from "./coordinator";
import { ConversationEpisodeTracker, EPISODE_MODALITIES, type EpisodeContext, type EpisodeModality, type EpisodePolicy,
  type EpisodeRef } from "./conversation-episodes";
import { type ConversationTurn } from "./conversation-turns";
import { type WearerAssociationEvent } from "./wearer-identity";
import { type ConversationChannel, type ConversationChannelStats, type ConversationResult } from "../assistant/conversation-channel";

type Source = Pick<ConversationCaptureCoordinator, "snapshot" | "subscribe" | "subscribeTurns" | "subscribeAssociation" | "wearerActionRef">;
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
  private flight: { ref: EpisodeRef; mode: "assess" | "assist" } | null = null;
  private outputRef: EpisodeRef | null = null;
  private outputAt = 0;
  /** The conversation moved on after delivery: retire once HERMES_MESSAGE_MIN_MS has elapsed. */
  private outputStale = false;
  private messageHistory: ConversationHermesHistoryEntry[] = [];
  private cancelTimer: (() => void) | null = null;
  private lastTextAt = 0;
  private lastRequestAt = -Infinity;
  private attempted = "";
  private requests = 0;
  private maxRequests = 8;
  private modality: EpisodeModality = "identidad-requerida";
  private counters = emptyCounters();
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
   */
  begin(maxRequests = 8, modality: EpisodeModality = "identidad-requerida"): boolean {
    this.stop();
    if (!EPISODE_MODALITIES.includes(modality)) return false;
    if (modality === "identidad-opcional" && !this.channel.supportsOptionalIdentity?.()) return false;
    if (!this.channel.setEnabled(true)) return false;
    this.enabled = true;
    this.modality = modality;
    this.counters = emptyCounters();
    this.channel.resetStatistics?.();
    this.requests = 0;
    this.maxRequests = Number.isFinite(maxRequests) ? Math.max(1, Math.min(80, Math.floor(maxRequests))) : 8;
    this.lastRequestAt = -Infinity;
    this.cancelTimer = this.host.every(() => this.tick(), 500);
    this.host.changed();
    return true;
  }

  stop(): void {
    const wasEnabled = this.enabled;
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

  snapshot() {
    return { enabled: this.enabled, busy: this.flight !== null, requests: this.requests, modality: this.modality,
      delivered: this.counters.delivered,
      listening: this.enabled && this.source.snapshot().state === "escuchando", episode: this.tracker.snapshot() };
  }

  /** Session diagnostics kept after OFF until the next ON: aggregate counters only. */
  diagnostics(): { modality: EpisodeModality; requests: number; counters: ConversationHermesCounters;
    channel: ConversationChannelStats | null } {
    return { modality: this.modality, requests: this.requests, counters: { ...this.counters },
      channel: this.channel.statistics?.() ?? null };
  }

  private observe(snapshot: DetectorSnapshot): void {
    if (!this.enabled) return;
    if (!snapshot.enabled || snapshot.state === "error"
      || (snapshot.transcription?.engine && snapshot.transcription.engine !== "soniox")) {
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
      this.flight = null; this.channel.cancel(); this.attempted = ""; this.clearOutput();
    }
    this.host.changed();
  }

  private turn(turn: ConversationTurn): void {
    if (!this.enabled || !this.channel.isReady() || !this.source.snapshot().enabled
      || this.source.snapshot().state !== "escuchando") return;
    const before = this.tracker.snapshot();
    const accepted = this.tracker.accept(turn);
    if (accepted) {
      this.lastTextAt = this.host.now();
      this.counters.turnsAccepted++;
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
      this.flight = null; this.channel.cancel();
      if (this.outputRef) this.outputStale = true;
    }
    this.host.changed();
  }

  /** Pending work only; the lens presenter already hides a delivered message while not listening. */
  private interrupt(): void {
    this.flight = null; this.channel.cancel(); this.tracker.interrupt();
    this.attempted = "";
    if (this.outputRef) this.outputStale = true;
  }

  private clearOutput(): void { this.outputRef = null; this.outputStale = false; this.host.onOutput(null); }

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
      this.flight = null; this.channel.cancel();
    }
    if (snapshot.state !== "escuchando" || this.flight || this.requests >= this.maxRequests
      || this.host.now() - this.lastTextAt < 2000 || this.host.now() - this.lastRequestAt < 5000) return;
    const context = state === "candidata" ? this.tracker.assessmentContext()
      : state === "activa" ? this.tracker.confirmedContext() : null;
    if (context) this.request(context, state === "candidata" ? "assess" : "assist");
  }

  private request(context: EpisodeContext, mode: "assess" | "assist"): void {
    const key = `${context.ref.sessionId}/${context.ref.streamId}/${context.ref.associationVersion}/${context.ref.episodeId}/${context.ref.revision}/${mode}`;
    if (key === this.attempted || this.requests >= this.maxRequests || !this.enabled || !this.channel.isReady()) return;
    this.attempted = key;
    this.lastRequestAt = this.host.now();
    this.requests++;
    if (mode === "assess") this.counters.assessments++; else this.counters.assists++;
    const flight = { ref: { ...context.ref }, mode };
    this.flight = flight;
    const accepted = this.channel.request(context, mode, HERMES_REQUEST_TIMEOUT_MS, (result) => this.result(flight, result));
    if (!accepted && this.flight === flight) this.flight = null;
    this.host.changed();
  }

  private result(flight: { ref: EpisodeRef; mode: "assess" | "assist" }, result: ConversationResult | null): void {
    if (this.flight !== flight) return;
    this.flight = null;
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
      this.outputAt = this.host.now();
      this.outputStale = false;
      this.messageHistory = [{ at: this.host.wallClock?.() ?? Date.now(), text: result.text },
        ...this.messageHistory].slice(0, HERMES_HISTORY_MAX);
      this.host.onOutput(result.text);
    }
    this.host.changed();
  }
}
