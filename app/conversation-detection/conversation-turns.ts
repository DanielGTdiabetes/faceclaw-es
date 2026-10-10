import { type FinalToken, type Relation } from "./wearer-identity";

/** S2: one closed intervention built only from final Soniox tokens. RAM only, never sent anywhere. */
export type ConversationTurn = {
  v: 1;
  sessionId: string;
  streamId: number;
  seq: number;
  engine: "soniox" | "whisper-base-es" | "whisper-small-es" | "whisper-medium-es";
  speaker: string | null;
  relation: Relation;
  associationVersion: number;
  text: string;
  timing: "valido" | "parcial" | "invalido" | "ventana";
  startMs: number | null;
  endMs: number | null;
  closedBy: "cambio-hablante" | "endpoint" | "finalize" | "frontera" | "pausa" | "limite" | "fin-sesion";
};

export const TURN_LIMITS = { pauseMs: 1500, maxChars: 600, ring: 40 } as const;

export type TurnRelations = { relation(speaker: string | null): Relation; associationVersion(): number };

/**
 * Capture segment of a word: the number of recorded boundaries at or before it. `"cruza"` marks a timed
 * word with a boundary strictly inside it; `null` a timeless word that cannot be placed.
 */
type Segment = number | "cruza" | null;

/**
 * A word: a token that starts with whitespace (or opens a turn) plus the following tokens of the same
 * speaker that do not. Soniox tokens may be sub-word pieces; the word is the smallest unit ever placed
 * or separated, so a split never cuts a word. Its times are the real min/max of its timed tokens.
 * `placed` is the segment fixed at reception for a word without valid times.
 */
type Word = { text: string; valid: number; invalid: number; start: number | null; end: number | null; placed: Segment };
type OpenTurn = { speaker: string | null; words: Word[] };
/** Closed but not yet emitted; relation and version are those at the closing moment. */
type Held = { speaker: string | null; words: Word[]; closedBy: ConversationTurn["closedBy"]; relation: Relation;
  associationVersion: number };

/**
 * Interventions never span a capture boundary (§4.1). A boundary is the stream audio position (streamMs)
 * at a gap/yield. Policy (S2.2):
 *
 * 1. Placement by the words' own times, never by arrival order: a timed word belongs to the segment
 *    between the boundaries around it (ending exactly at one = before, starting exactly at one = after);
 *    a timed word with a boundary strictly inside stands alone with its real times; a timeless word is
 *    placed in the latest segment only once final progress has reached the latest boundary, otherwise it
 *    stands alone. Only words in the same numeric segment share a turn.
 * 2. A new boundary is recorded first and then applied to every word not yet emitted (the open turn and
 *    the closed-but-held ones), which keep their words and times: the boundary partitions them into
 *    consecutive runs. A timeless word keeps the segment it was placed in (it was received before the cut,
 *    so its audio precedes it).
 * 3. The engine accepts final times up to sentMs + tolerance. A future boundary is always at or after the
 *    audio sent now, so a closed turn whose timed words all end at or before the audio sent can never be
 *    crossed later and is emitted at once. A closed turn with a word ending beyond the audio sent (only
 *    possible within the tolerance) is held, in order, until the audio sent reaches that end, the next
 *    boundary re-partitions it, or the session ends (no boundary can follow). Every close (speaker change,
 *    endpoint, finalize, pause, limit, boundary) goes through this rule. Emitted turns are never rewritten.
 *
 * Without `audio()` reports (pure use) nothing is held. Without boundaries every word is in segment 0 and
 * the grouping is unchanged. Known limits: a sub-word token that arrives after its word's turn was closed
 * starts a new turn; the length limit closes at the next word boundary, so a turn may exceed it by one word.
 */
export class ConversationTurns {
  private sessionId: string | null = null;
  private streamId = 0;
  private seq = 0;
  private open: OpenTurn | null = null;
  private held: Held[] = [];
  private ring: ConversationTurn[] = [];
  private emitted = 0;
  private boundaries: number[] = [];
  private progressMs: number | null = null;
  private audioMs: number | null = null;
  private readonly listeners = new Set<(turn: ConversationTurn) => void>();

  constructor(private readonly relations: TurnRelations) {}

  start(sessionId: string, streamId: number): void {
    this.sessionId = sessionId; this.streamId = streamId; this.seq = 0;
    this.open = null; this.held = []; this.ring = []; this.emitted = 0; this.boundaries = []; this.progressMs = null;
    this.audioMs = null;
  }

  /** Closes the open turn as end of session, emits everything held (no boundary can follow) and stops. */
  finish(): void {
    this.closeOpen("fin-sesion");
    this.flush(true);
    this.sessionId = null;
  }

  /** Fallback or OFF: drop the Soniox interventions without emitting anything new. */
  clear(): void {
    this.open = null; this.held = []; this.ring = []; this.sessionId = null; this.boundaries = []; this.progressMs = null;
    this.audioMs = null;
  }

  active(): boolean { return this.sessionId !== null; }
  count(): number { return this.emitted; }
  list(): ConversationTurn[] { return this.ring.map((turn) => ({ ...turn })); }

  /** New turns only; nothing is replayed on subscription. */
  subscribe(listener: (turn: ConversationTurn) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Stream audio sent so far (streamMs, same origin as boundaries). Releases held turns it settles. */
  audio(sentMs: number): void {
    if (typeof sentMs !== "number" || !Number.isFinite(sentMs) || sentMs < 0) return;
    this.audioMs = this.audioMs === null ? sentMs : Math.max(this.audioMs, sentMs);
    this.flush(false);
  }

  accept(token: FinalToken): void {
    if (this.sessionId === null) return;
    const open = this.open;
    const last = open ? open.words[open.words.length - 1] : undefined;
    // A blank token only separates words; it carries no word and no times.
    if (!token.text.trim()) {
      if (last) last.text += token.text;
      return;
    }
    if (open && last && open.speaker === token.speaker && !/^\s/.test(token.text) && !/\s$/.test(last.text)) {
      addToken(last, token);
      this.reshape();
      return;
    }
    const word: Word = { text: "", valid: 0, invalid: 0, start: null, end: null, placed: this.placeTimeless() };
    addToken(word, token);
    if (open) {
      const end = turnEnd(open.words);
      if (textOf(open.words).length >= TURN_LIMITS.maxChars) this.closeOpen("limite");
      else if (open.speaker !== token.speaker) this.closeOpen("cambio-hablante");
      else if (!sameSegment(this.segmentOf(open.words[0]!), this.segmentOf(word))) this.closeOpen("frontera");
      else if (word.start !== null && end !== null && word.start - end >= TURN_LIMITS.pauseMs) this.closeOpen("pausa");
    }
    if (!this.open) this.open = { speaker: token.speaker, words: [] };
    this.open.words.push(word);
  }

  marker(kind: "end" | "fin"): void { this.closeOpen(kind === "end" ? "endpoint" : "finalize"); }

  /**
   * Gap or yield: records `atMs` (stream audio sent at the cut) first, then partitions every word not yet
   * emitted by it and closes the open turn. Finals that arrive later are split by their own times.
   * Without a usable position it only closes.
   */
  boundary(atMs?: number): void {
    if (typeof atMs === "number" && Number.isFinite(atMs) && atMs >= 0) {
      const last = this.boundaries[this.boundaries.length - 1];
      if (last === undefined || atMs > last) this.boundaries.push(atMs);
    }
    const pending = this.held;
    this.held = [];
    for (const piece of pending) {
      const runs = this.runs(piece.words);
      runs.forEach((words, i) => this.held.push({ ...piece, words, closedBy: i === runs.length - 1 ? piece.closedBy : "frontera" }));
    }
    this.closeOpen("frontera");
    this.flush(false); // also when nothing was open: held words may have become final (alone) by this cut
  }

  /** A pause closes only with evidence that the silent audio was processed, never on a late socket. */
  progress(finalAudioProcMs: number): void {
    this.progressMs = this.progressMs === null ? finalAudioProcMs : Math.max(this.progressMs, finalAudioProcMs);
    const open = this.open;
    const end = open ? turnEnd(open.words) : null;
    if (end !== null && finalAudioProcMs >= end + TURN_LIMITS.pauseMs) this.closeOpen("pausa");
  }

  /** Segment for a word without valid times, fixed at its reception. */
  private placeTimeless(): Segment {
    if (!this.boundaries.length) return 0;
    const last = this.boundaries[this.boundaries.length - 1]!;
    return this.progressMs !== null && this.progressMs >= last ? this.boundaries.length : null;
  }

  private segmentOf(word: Word): Segment {
    if (word.start === null || word.end === null) return word.placed;
    let segment = 0;
    for (const boundary of this.boundaries) {
      if (word.start >= boundary) segment++;
      else if (word.end > boundary) return "cruza";
      else break;
    }
    return segment;
  }

  /** Maximal consecutive runs of words that share a numeric segment; any other word stands alone. */
  private runs(words: Word[]): Word[][] {
    const out: Word[][] = [];
    let previous: Segment = null;
    for (const word of words) {
      const segment = this.segmentOf(word);
      if (out.length && sameSegment(previous, segment)) out[out.length - 1]!.push(word);
      else out.push([word]);
      previous = segment;
    }
    return out;
  }

  /** A sub-word token may move its word into another segment: the words before it close at the boundary. */
  private reshape(): void {
    const open = this.open!;
    const runs = this.runs(open.words);
    if (runs.length < 2) return;
    for (const words of runs.slice(0, -1)) this.held.push(this.hold(open.speaker, words, "frontera"));
    this.open = { speaker: open.speaker, words: runs[runs.length - 1]! };
    this.flush(false);
  }

  private closeOpen(closedBy: ConversationTurn["closedBy"]): void {
    const open = this.open;
    this.open = null;
    if (!open || this.sessionId === null) return;
    const runs = this.runs(open.words);
    runs.forEach((words, i) => this.held.push(this.hold(open.speaker, words, i === runs.length - 1 ? closedBy : "frontera")));
    this.flush(false);
  }

  private hold(speaker: string | null, words: Word[], closedBy: ConversationTurn["closedBy"]): Held {
    return { speaker, words, closedBy, relation: this.relations.relation(speaker),
      associationVersion: this.relations.associationVersion() };
  }

  /** A held turn is final once no future boundary (always >= audio sent) can fall inside or before its words. */
  private settled(piece: Held): boolean {
    if (this.audioMs === null) return true;
    if (piece.words.length === 1 && typeof this.segmentOf(piece.words[0]!) !== "number") return true;
    const audioMs = this.audioMs;
    return piece.words.every((word) => word.end === null || word.end <= audioMs);
  }

  /** Emits held turns in closing order; a turn still unsettled also holds the ones closed after it. */
  private flush(force: boolean): void {
    while (this.held.length) {
      if (!force && !this.settled(this.held[0]!)) return;
      this.emit(this.held.shift()!);
    }
  }

  private emit(piece: Held): void {
    if (this.sessionId === null) return;
    const text = textOf(piece.words).trim();
    if (!text) return;
    let valid = 0, invalid = 0, start: number | null = null, end: number | null = null;
    for (const word of piece.words) {
      valid += word.valid; invalid += word.invalid;
      if (word.start !== null) start = start === null ? word.start : Math.min(start, word.start);
      if (word.end !== null) end = end === null ? word.end : Math.max(end, word.end);
    }
    const turn: ConversationTurn = { v: 1, sessionId: this.sessionId, streamId: this.streamId, seq: ++this.seq,
      engine: "soniox", speaker: piece.speaker, relation: piece.relation, associationVersion: piece.associationVersion, text,
      timing: invalid === 0 ? "valido" : valid > 0 ? "parcial" : "invalido", startMs: start, endMs: end,
      closedBy: piece.closedBy };
    this.ring.push(turn);
    while (this.ring.length > TURN_LIMITS.ring) this.ring.shift();
    this.emitted++;
    for (const listener of this.listeners) listener({ ...turn });
  }
}

function addToken(word: Word, token: FinalToken): void {
  word.text += token.text;
  if (token.valid && token.startMs !== null && token.endMs !== null) {
    word.valid++;
    word.start = word.start === null ? token.startMs : Math.min(word.start, token.startMs);
    word.end = word.end === null ? token.endMs : Math.max(word.end, token.endMs);
  } else word.invalid++;
}

function textOf(words: Word[]): string {
  return words.map((word) => word.text).join("").trimStart();
}

function turnEnd(words: Word[]): number | null {
  let end: number | null = null;
  for (const word of words) if (word.end !== null) end = end === null ? word.end : Math.max(end, word.end);
  return end;
}

/** Two words may share a turn only when both are placed in the same capture segment. */
function sameSegment(a: Segment, b: Segment): boolean {
  return typeof a === "number" && a === b;
}
