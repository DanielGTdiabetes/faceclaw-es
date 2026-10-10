import { type ConversationTurn } from "./conversation-turns";
import { isLocalWindowTurn } from "./local-conversation-turns";
import { type WearerAssociationEvent } from "./wearer-identity";
import { emptyPrefilterCounters, prefilterTurn, type PrefilterCounters } from "./conversation-prefilter";

/** Proposed policy is supplied by the caller: none of these limits changes installed listening. */
export type EpisodePolicy = {
  candidateMs: number;
  silenceMs: number;
  maxTurns: number;
  maxChars: number;
};
export type EpisodeRef = {
  sessionId: string;
  streamId: number;
  associationVersion: number;
  episodeId: number;
  revision: number;
};
export type EpisodeAssessment = "tema" | "cortesia" | "incierto";
/**
 * How attribution gates a session, captured once at ON for its whole duration.
 * - `identidad-requerida` (default, diagnostic/legacy): only labelled wearer+other candidates qualify.
 * - `identidad-opcional` (manual ON): any comprehensible valid turn may be assessed; recognition of the
 *   wearer only improves attribution. Unknown relations stay unknown and are never promoted.
 */
export type EpisodeModality = "identidad-requerida" | "identidad-opcional";
export const EPISODE_MODALITIES: readonly EpisodeModality[] = ["identidad-requerida", "identidad-opcional"];
export type EpisodeEnd = "off" | "silencio" | "caducidad" | "interrupcion" | "identidad" | "cortesia" | "incierto";
export type EpisodeContext = { ref: EpisodeRef; modality: EpisodeModality; turns: ConversationTurn[] };
export type EpisodeSnapshot = {
  state: "off" | "esperando" | "candidata" | "activa";
  modality: EpisodeModality;
  turns: number;
  chars: number;
  eligible: boolean;
  accepted: number;
  ignored: number;
  prefilter: PrefilterCounters;
  lastEnd: EpisodeEnd | null;
};

/**
 * Pure, RAM-only episode lifecycle. No timers, capture, storage, network or display operations.
 * With required identity, two labelled voices make a candidate eligible; with optional identity any
 * valid, consistently attributed turn does. Eligibility never confirms a topic. The caller
 * must explicitly request a text context and return a semantic verdict before a confirmed context
 * exists. That caller owns authorization to send text to any evaluator, including Hermes.
 */
export class ConversationEpisodeTracker {
  private session: { sessionId: string; streamId: number } | null = null;
  private modality: EpisodeModality = "identidad-requerida";
  private version = 0;
  private wearer: string | null = null;
  private state: EpisodeSnapshot["state"] = "off";
  private buffer: ConversationTurn[] = [];
  private episodeId = 0;
  private revision = 0;
  private lastSeq = 0;
  private openedAt = 0;
  private lastTurnAt = 0;
  private request: EpisodeRef | null = null;
  private lastEnd: EpisodeEnd | null = null;
  private accepted = 0;
  private ignored = 0;
  private prefilter = emptyPrefilterCounters();

  constructor(private readonly now: () => number, private readonly policy: EpisodePolicy) {
    if (![policy.candidateMs, policy.silenceMs, policy.maxTurns, policy.maxChars]
      .every((n) => Number.isFinite(n) && n > 0)
      || !Number.isInteger(policy.maxTurns) || policy.maxTurns < 2 || !Number.isInteger(policy.maxChars)) {
      throw new Error("Invalid episode policy");
    }
    // Caller mutation cannot silently extend a candidate or increase RAM retention.
    this.policy = { ...policy };
  }

  /** Called explicitly for an accepted stream, never starts or extends a capture session. */
  start(sessionId: string, streamId: number, modality: EpisodeModality = "identidad-requerida"): void {
    if (!sessionId || !Number.isInteger(streamId) || streamId < 1) throw new Error("Invalid stream");
    if (!EPISODE_MODALITIES.includes(modality)) throw new Error("Invalid modality");
    this.stop();
    this.session = { sessionId, streamId };
    this.modality = modality;
    this.state = "esperando";
    this.version = 0;
    this.lastSeq = 0;
    this.lastEnd = null;
    this.accepted = 0;
    this.ignored = 0;
    this.prefilter = emptyPrefilterCounters();
  }

  /** Old stream events cannot reset a newer stream. Association changes retire all prior context. */
  association(event: WearerAssociationEvent): boolean {
    if (!this.session || event.sessionId !== this.session.sessionId || event.streamId !== this.session.streamId
      || event.version < this.version) return false;
    if (event.kind === "fin-sesion") { this.stop(); return true; }
    if (event.version !== this.version || event.speaker !== this.wearer) {
      this.end("identidad");
      this.version = event.version;
      this.wearer = event.speaker;
    }
    return true;
  }

  accept(turn: ConversationTurn): boolean {
    this.tick();
    if (!this.session || (this.modality === "identidad-requerida" && !this.wearer) || turn.sessionId !== this.session.sessionId
      || turn.streamId !== this.session.streamId || turn.associationVersion !== this.version
      || turn.seq <= this.lastSeq) { this.ignored++; return false; }
    this.lastSeq = turn.seq;
    // A cut or session end is a lifecycle boundary, not evidence for a continuous topic.
    if (turn.closedBy === "frontera" || turn.closedBy === "fin-sesion") {
      if (turn.closedBy === "fin-sesion") this.stop();
      else this.end("interrupcion");
      return false;
    }
    // Local windows carry the native voice-print label (wearer profile or session voice) and no
    // association; Soniox relations must agree with the live association. Nothing is promoted here.
    const local = this.modality === "identidad-opcional" && isLocalWindowTurn(turn);
    const labelled = local || (turn.relation === "portador" ? !!this.wearer && turn.speaker === this.wearer
      : turn.relation === "otro" ? !!this.wearer && !!turn.speaker && turn.speaker !== this.wearer
      : turn.relation === "desconocido" && (turn.speaker === null || turn.speaker !== this.wearer));
    if (!labelled || this.contradicts(turn) || !(turn.engine === "soniox" && turn.timing === "valido" || local)
      || turn.text.length > this.policy.maxChars) {
      this.ignored++;
      return false;
    }
    const skipped = prefilterTurn(turn, this.buffer);
    if (skipped) {
      this.prefilter[skipped]++;
      this.ignored++;
      return false;
    }
    const now = this.now();
    if (this.state === "esperando") {
      this.state = "candidata";
      this.episodeId++;
      this.openedAt = now;
    }
    this.lastTurnAt = now;
    this.buffer.push({ ...turn });
    while (this.buffer.length > this.policy.maxTurns || this.chars() > this.policy.maxChars) this.buffer.shift();
    this.revision++;
    // The pending assessment stays valid for this episode: a late "tema" may still promote it.
    this.accepted++;
    return true;
  }

  /** Silent gaps/priority changes invalidate pending semantic replies without touching capture. */
  interrupt(): void { if (this.session) this.end("interrupcion"); }

  stop(): void {
    this.end("off");
    this.session = null;
    this.wearer = null;
    this.modality = "identidad-requerida";
    this.state = "off";
  }

  /** Monotonic receipt-clock limits; called by the future owner, also checked on every API route. */
  tick(): void {
    if (this.state === "candidata" && this.now() - this.openedAt >= this.policy.candidateMs) this.end("caducidad");
    else if (this.state === "activa" && this.now() - this.lastTurnAt >= this.policy.silenceMs) this.end("silencio");
  }

  /** Explicit text access for semantic assessment. Merely eligible does not authorize transmission. */
  assessmentContext(): EpisodeContext | null {
    this.tick();
    if (this.state !== "candidata" || !this.eligible()) return null;
    this.request = this.ref();
    return this.context();
  }

  assess(ref: EpisodeRef, verdict: EpisodeAssessment): boolean {
    this.tick();
    if (this.state !== "candidata" || !this.request || !this.matches(ref, this.request)
      || !this.sameEpisode(ref, this.ref()) || !this.eligible()) return false;
    // Speech kept arriving while Hermes evaluated: a stale "tema" still holds (the topic only grew),
    // but a stale dismissal must not end an episode whose newer turns were never assessed.
    if (verdict === "tema") { this.state = "activa"; this.request = null; return true; }
    if (verdict !== "cortesia" && verdict !== "incierto") return false;
    if (!this.matches(ref, this.ref())) return false;
    this.end(verdict);
    return true;
  }

  /** Only a confirmed, current episode provides the context for later assistance. */
  confirmedContext(): EpisodeContext | null {
    this.tick();
    return this.state === "activa" ? this.context() : null;
  }

  /** Bounded local-only view; does not replace the in-flight Hermes assessment reference. */
  gatekeeperContext(mode: "assess" | "assist"): EpisodeContext | null {
    this.tick();
    return this.state === (mode === "assess" ? "candidata" : "activa") && this.eligible() ? this.context() : null;
  }

  /**
   * Late outputs must match the current episode as well as the session and association. A newer
   * revision of the same episode (people kept talking while Hermes answered) is still accepted.
   */
  acceptsOutput(ref: EpisodeRef): boolean {
    this.tick();
    return this.state === "activa" && this.sameEpisode(ref, this.ref());
  }

  snapshot(): EpisodeSnapshot {
    this.tick();
    return { state: this.state, modality: this.modality, turns: this.buffer.length, chars: this.chars(), eligible: this.eligible(),
      accepted: this.accepted, ignored: this.ignored, prefilter: { ...this.prefilter }, lastEnd: this.lastEnd };
  }

  private eligible(): boolean {
    if (this.modality === "identidad-opcional") return this.buffer.length > 0;
    return this.buffer.some((t) => t.relation === "portador") && this.buffer.some((t) => t.relation === "otro");
  }
  /** One speaker label keeps one relation inside a context; a mixed attribution is never sent. */
  private contradicts(turn: ConversationTurn): boolean {
    return turn.speaker !== null && this.buffer.some((t) => t.speaker === turn.speaker && t.relation !== turn.relation);
  }
  private chars(): number { return this.buffer.reduce((n, t) => n + t.text.length, 0); }
  private ref(): EpisodeRef {
    return { ...this.session!, associationVersion: this.version, episodeId: this.episodeId, revision: this.revision };
  }
  private matches(a: EpisodeRef, b: EpisodeRef): boolean {
    return this.sameEpisode(a, b) && a.revision === b.revision;
  }
  private sameEpisode(a: EpisodeRef, b: EpisodeRef): boolean {
    return a.sessionId === b.sessionId && a.streamId === b.streamId && a.associationVersion === b.associationVersion
      && a.episodeId === b.episodeId;
  }
  private context(): EpisodeContext {
    return { ref: this.ref(), modality: this.modality, turns: this.buffer.map((t) => ({ ...t })) };
  }
  private end(reason: EpisodeEnd): void {
    if (this.buffer.length || this.state === "activa") this.lastEnd = reason;
    this.buffer = [];
    this.request = null;
    this.revision++;
    this.state = this.session ? "esperando" : "off";
  }
}
