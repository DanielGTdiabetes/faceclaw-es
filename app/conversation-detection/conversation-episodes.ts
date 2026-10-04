import { type ConversationTurn } from "./conversation-turns";
import { type WearerAssociationEvent } from "./wearer-identity";

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
export type EpisodeEnd = "off" | "silencio" | "caducidad" | "interrupcion" | "identidad" | "cortesia" | "incierto";
export type EpisodeContext = { ref: EpisodeRef; turns: ConversationTurn[] };
export type EpisodeSnapshot = {
  state: "off" | "esperando" | "candidata" | "activa";
  turns: number;
  chars: number;
  eligible: boolean;
  accepted: number;
  ignored: number;
  lastEnd: EpisodeEnd | null;
};

/**
 * Pure, RAM-only episode lifecycle. No timers, capture, storage, network or display operations.
 * Two labelled voices make a candidate eligible for assessment, never confirm a topic. The caller
 * must explicitly request a text context and return a semantic verdict before a confirmed context
 * exists. That caller owns authorization to send text to any evaluator, including Hermes.
 */
export class ConversationEpisodeTracker {
  private session: { sessionId: string; streamId: number } | null = null;
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
  start(sessionId: string, streamId: number): void {
    if (!sessionId || !Number.isInteger(streamId) || streamId < 1) throw new Error("Invalid stream");
    this.stop();
    this.session = { sessionId, streamId };
    this.state = "esperando";
    this.version = 0;
    this.lastSeq = 0;
    this.lastEnd = null;
    this.accepted = 0;
    this.ignored = 0;
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
    if (!this.session || !this.wearer || turn.sessionId !== this.session.sessionId
      || turn.streamId !== this.session.streamId || turn.associationVersion !== this.version
      || turn.seq <= this.lastSeq) { this.ignored++; return false; }
    this.lastSeq = turn.seq;
    // A cut or session end is a lifecycle boundary, not evidence for a continuous topic.
    if (turn.closedBy === "frontera" || turn.closedBy === "fin-sesion") {
      if (turn.closedBy === "fin-sesion") this.stop();
      else this.end("interrupcion");
      return false;
    }
    const labelled = turn.relation === "portador" ? turn.speaker === this.wearer
      : turn.relation === "otro" ? !!turn.speaker && turn.speaker !== this.wearer
      : turn.relation === "desconocido";
    if (!labelled || turn.timing !== "valido" || !turn.text.trim() || turn.text.length > this.policy.maxChars) {
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
    this.request = null;
    this.accepted++;
    return true;
  }

  /** Silent gaps/priority changes invalidate pending semantic replies without touching capture. */
  interrupt(): void { if (this.session) this.end("interrupcion"); }

  stop(): void {
    this.end("off");
    this.session = null;
    this.wearer = null;
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
      || !this.matches(ref, this.ref()) || !this.eligible()) return false;
    if (verdict === "tema") { this.state = "activa"; this.request = null; return true; }
    if (verdict !== "cortesia" && verdict !== "incierto") return false;
    this.end(verdict);
    return true;
  }

  /** Only a confirmed, current episode provides the context for later assistance. */
  confirmedContext(): EpisodeContext | null {
    this.tick();
    return this.state === "activa" ? this.context() : null;
  }

  /** Late outputs must match the current context as well as the session and association. */
  acceptsOutput(ref: EpisodeRef): boolean {
    this.tick();
    return this.state === "activa" && this.matches(ref, this.ref());
  }

  snapshot(): EpisodeSnapshot {
    this.tick();
    return { state: this.state, turns: this.buffer.length, chars: this.chars(), eligible: this.eligible(),
      accepted: this.accepted, ignored: this.ignored, lastEnd: this.lastEnd };
  }

  private eligible(): boolean {
    return this.buffer.some((t) => t.relation === "portador") && this.buffer.some((t) => t.relation === "otro");
  }
  private chars(): number { return this.buffer.reduce((n, t) => n + t.text.length, 0); }
  private ref(): EpisodeRef {
    return { ...this.session!, associationVersion: this.version, episodeId: this.episodeId, revision: this.revision };
  }
  private matches(a: EpisodeRef, b: EpisodeRef): boolean {
    return a.sessionId === b.sessionId && a.streamId === b.streamId && a.associationVersion === b.associationVersion
      && a.episodeId === b.episodeId && a.revision === b.revision;
  }
  private context(): EpisodeContext { return { ref: this.ref(), turns: this.buffer.map((t) => ({ ...t })) }; }
  private end(reason: EpisodeEnd): void {
    if (this.buffer.length || this.state === "activa") this.lastEnd = reason;
    this.buffer = [];
    this.request = null;
    this.revision++;
    this.state = this.session ? "esperando" : "off";
  }
}
