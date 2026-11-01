/**
 * S2: explicit, per-session association between the wearer and a Soniox speaker label.
 *
 * The association is a cooperative declaration (a fixed phrase said on request, or a manual
 * choice), not biometric proof. Pure module: no text, audio, vectors or keys leave it through
 * snapshots, summaries or association events.
 */

export const WEARER_PHRASE = "Soy yo quien lleva las gafas";
/** Normalized word sequences accepted as the complete phrase, in order. Nothing else. */
export const WEARER_PHRASE_VARIANTS: readonly (readonly string[])[] = [
  ["soy", "yo", "quien", "lleva", "las", "gafas"],
  ["soy", "yo", "el", "que", "lleva", "las", "gafas"],
  ["soy", "yo", "la", "que", "lleva", "las", "gafas"],
];

/** Design constants (selection criteria, not acoustic measurements). */
export const IDENTITY_LIMITS = {
  windowAudioMs: 5000,
  windowWallMs: 8000,
  minWindowAudioMs: 2000,
  endToleranceMs: 300,
  resultWallMs: 6000,
  minPhraseUnionMs: 700,
  maxOverlapMs: 300,
  maxIntraPhraseGapMs: 1000,
} as const;

export type IdentityState = "no-disponible" | "sin-identificar" | "escuchando-frase" | "esperando-resultado" | "identificado";
export type IdentityOutcome = "ninguno" | "aceptado" | "frase-no-reconocida" | "frase-ambigua" | "voces-solapadas"
  | "tiempos-invalidos" | "tiempos-implausibles" | "frase-fuera-de-ventana" | "audio-insuficiente" | "sin-resultado"
  | "audio-interrumpido" | "cancelado-manual" | "cancelado-off" | "motor-local";
export type IdentitySource = "frase" | "manual" | "perfil";

/** One final Soniox token after timing validation (see SonioxConversationTranscription). */
export type FinalToken = {
  text: string;
  speaker: string | null;
  startMs: number | null;
  endMs: number | null;
  valid: boolean;
};

export type IdentitySnapshot = {
  state: IdentityState;
  speaker?: string;
  source?: IdentitySource;
  version: number;
  knownOthers: number;
  lastOutcome: IdentityOutcome;
  windowRemainingMs?: number;
  speakersSeen: number;
};

export type IdentitySummary = {
  state: IdentityState; source: IdentitySource | null; lastOutcome: IdentityOutcome;
  attempts: number; manualAssignments: number;
};

export type WearerAssociationEvent = {
  v: 1;
  sessionId: string | null;
  streamId: number | null;
  version: number;
  kind: "estado-inicial" | "frase" | "manual" | "perfil" | "borrado" | "fin-sesion";
  speaker: string | null;
  knownOthers: string[];
};

export type SpeakerRef = { sessionId: string; streamId: number; speaker: string | null };
/**
 * Captured when a phrase action («Identificar», «Listo», «Cancelar») is built. `attemptSeq` is the id of
 * the live attempt (or of the last one when none is active) and `version` the association version: an
 * action only acts on exactly the session, stream, attempt and association it was offered for.
 */
export type WearerActionRef = { sessionId: string; streamId: number; attemptSeq: number; version: number };
export type Relation = "portador" | "otro" | "desconocido";

type Association = { speaker: string; source: IdentitySource; knownOthers: Set<string> };
type Evidence = { kind: "token"; token: FinalToken } | { kind: "cut" };
type Attempt = {
  id: number; phase: "escuchando-frase" | "esperando-resultado";
  windowStartMs: number; openedAt: number; windowEndMs: number; deadlineAt: number;
  evidence: Evidence[];
};

/**
 * Explicit fold of precomposed Latin letters used in Spanish/Valencian text (both cases) to their base
 * ASCII letter. Android V8 is built without ICU: `String.prototype.normalize` returns its input there,
 * so this table, not NFD, is what removes accents. Combining marks (decomposed input) are dropped below.
 */
const FOLD_GROUPS: readonly (readonly [string, string])[] = [
  // áàâäãå ÁÀÂÄÃÅ / éèêë ÉÈÊË / íìîï ÍÌÎÏ / óòôöõ ÓÒÔÖÕ / úùûü ÚÙÛÜ / ñÑ / çÇ / ýÿÝ
  ["a", "\u00e1\u00e0\u00e2\u00e4\u00e3\u00e5\u00c1\u00c0\u00c2\u00c4\u00c3\u00c5"],
  ["e", "\u00e9\u00e8\u00ea\u00eb\u00c9\u00c8\u00ca\u00cb"],
  ["i", "\u00ed\u00ec\u00ee\u00ef\u00cd\u00cc\u00ce\u00cf"],
  ["o", "\u00f3\u00f2\u00f4\u00f6\u00f5\u00d3\u00d2\u00d4\u00d6\u00d5"],
  ["u", "\u00fa\u00f9\u00fb\u00fc\u00da\u00d9\u00db\u00dc"],
  ["n", "\u00f1\u00d1"],
  ["c", "\u00e7\u00c7"],
  ["y", "\u00fd\u00ff\u00dd"],
];
const FOLD: ReadonlyMap<string, string> = new Map(FOLD_GROUPS.flatMap(([base, chars]) => chars.split("").map((c) => [c, base] as const))); // BMP only
/** U+0300..U+036F, Combining Diacritical Marks (compared by code unit, no regex). */
const COMBINING_FIRST = 0x0300, COMBINING_LAST = 0x036f;

/**
 * Lower-case ASCII words: accents folded by the table, combining marks removed, A-Z lowered by code
 * point, anything else (punctuation, hyphens, other scripts, whitespace) becomes a space separator.
 * No `normalize`, `toLowerCase`, ICU or Unicode property escapes: the result is the same with or
 * without internationalization support. Phrase matching stays exact over these words (never fuzzy).
 */
export function normalizeForPhrase(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (char.length === 1 && code >= COMBINING_FIRST && code <= COMBINING_LAST) continue;
    if (code >= 0x41 && code <= 0x5a) out += String.fromCharCode(code + 0x20);
    else if ((code >= 0x61 && code <= 0x7a) || (code >= 0x30 && code <= 0x39)) out += char;
    else out += FOLD.get(char) ?? " ";
  }
  return out;
}

/** Union length of [start, end] intervals, clipped to [from, to]. Overlaps never count twice. */
export function unionLength(intervals: readonly [number, number][], from = -Infinity, to = Infinity): number {
  const clipped = intervals.map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as [number, number])
    .filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0, curStart = -Infinity, curEnd = -Infinity;
  for (const [a, b] of clipped) {
    if (a > curEnd) { if (curEnd > curStart) total += curEnd - curStart; curStart = a; curEnd = b; }
    else curEnd = Math.max(curEnd, b);
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

type Occurrence = { speaker: string; tokens: FinalToken[] };

/** Same-label runs of final tokens; cut by other voices, markers, boundaries, gaps and the window start. */
export function phraseOccurrences(evidence: readonly Evidence[], windowStartMs: number): Occurrence[] {
  const runs: { speaker: string; tokens: FinalToken[] }[] = [];
  let run: { speaker: string; tokens: FinalToken[] } | null = null;
  let lastEnd: number | null = null;
  const cut = () => { if (run) runs.push(run); run = null; lastEnd = null; };
  for (const item of evidence) {
    if (item.kind === "cut") { cut(); continue; }
    const token = item.token;
    if (token.speaker === null) { cut(); continue; }
    if (token.valid && token.startMs! < windowStartMs) { cut(); continue; }
    if (run && run.speaker !== token.speaker) cut();
    if (run && token.valid && lastEnd !== null && token.startMs! - lastEnd > IDENTITY_LIMITS.maxIntraPhraseGapMs) cut();
    if (!run) run = { speaker: token.speaker, tokens: [] };
    run.tokens.push(token);
    if (token.valid) lastEnd = token.endMs;
  }
  cut();
  const found: Occurrence[] = [];
  for (const current of runs) {
    // Words with the indices of the tokens that contributed characters to them.
    const words: { word: string; first: number; last: number }[] = [];
    let word = "", first = -1, last = -1;
    const flush = () => { if (word) words.push({ word, first, last }); word = ""; first = -1; };
    current.tokens.forEach((token, index) => {
      for (const char of normalizeForPhrase(token.text)) {
        if (/\s/.test(char)) { flush(); continue; }
        if (!word) first = index;
        word += char; last = index;
      }
    });
    flush();
    for (const variant of WEARER_PHRASE_VARIANTS) {
      for (let i = 0; i + variant.length <= words.length; i++) {
        if (variant.every((expected, k) => words[i + k]!.word === expected)) {
          found.push({ speaker: current.speaker,
            tokens: current.tokens.slice(words[i]!.first, words[i + variant.length - 1]!.last + 1) });
        }
      }
    }
  }
  return found;
}

const FAILURE_PRIORITY: IdentityOutcome[] = ["voces-solapadas", "tiempos-invalidos", "frase-fuera-de-ventana", "tiempos-implausibles"];

/** §4.3 decision over a closed window. Pure; exported for tests. */
export function evaluateWindow(evidence: readonly Evidence[], windowStartMs: number, windowEndMs: number):
  { outcome: "aceptado"; speaker: string } | { outcome: Exclude<IdentityOutcome, "aceptado"> } {
  const occurrences = phraseOccurrences(evidence, windowStartMs);
  const labels = new Set(occurrences.map((o) => o.speaker));
  if (labels.size === 0) return { outcome: "frase-no-reconocida" };
  if (labels.size > 1) return { outcome: "frase-ambigua" };
  const limit = windowEndMs + IDENTITY_LIMITS.endToleranceMs;
  const all = evidence.flatMap((item) => item.kind === "token" ? [item.token] : []);
  const failures: IdentityOutcome[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.tokens.some((t) => !t.valid)) { failures.push("tiempos-invalidos"); continue; }
    if (occurrence.tokens.some((t) => t.startMs! < windowStartMs || t.endMs! > limit)) { failures.push("frase-fuera-de-ventana"); continue; }
    const spanStart = occurrence.tokens[0]!.startMs!, spanEnd = occurrence.tokens[occurrence.tokens.length - 1]!.endMs!;
    const others = all.filter((t) => t.valid && t.speaker !== occurrence.speaker).map((t) => [t.startMs!, t.endMs!] as [number, number]);
    if (unionLength(others, spanStart, spanEnd) > IDENTITY_LIMITS.maxOverlapMs) { failures.push("voces-solapadas"); continue; }
    const own = occurrence.tokens.map((t) => [t.startMs!, t.endMs!] as [number, number]);
    if (unionLength(own) < IDENTITY_LIMITS.minPhraseUnionMs) { failures.push("tiempos-implausibles"); continue; }
    return { outcome: "aceptado", speaker: occurrence.speaker };
  }
  const reason = FAILURE_PRIORITY.find((candidate) => failures.includes(candidate)) ?? "frase-no-reconocida";
  return { outcome: reason as Exclude<IdentityOutcome, "aceptado"> };
}

export type WearerIdentityHost = {
  /** Monotonic clock (elapsedRealtime on Android). */
  now(): number;
  /** Periodic callback while an attempt is active; returns a cancel function. */
  every(callback: () => void, ms: number): () => void;
};

/**
 * Per-session state. Every attempt, timer, menu reference and event carries (sessionId, streamId,
 * attemptId); anything that does not match the live tuple and state is ignored.
 */
export class WearerIdentity {
  private sessionId: string | null = null;
  private streamId: number | null = null;
  private available = false;
  private association: Association | null = null;
  private attempt: Attempt | null = null;
  private attemptSeq = 0;
  private lastLimitMs = -1;
  private version = 0;
  private lastOutcome: IdentityOutcome = "ninguno";
  private seen = new Set<string>();
  private seenValid = new Set<string>();
  private attempts = 0;
  private manualAssignments = 0;
  private cancelTick: (() => void) | null = null;
  private streamMs = 0;
  private finalSummary: IdentitySummary | null = null;
  private readonly listeners = new Set<(event: WearerAssociationEvent) => void>();

  constructor(private readonly host: WearerIdentityHost) {}

  /** Soniox socket open: a fresh session/stream starts unidentified. */
  start(sessionId: string, streamId: number): void {
    this.clearAttempt();
    this.sessionId = sessionId; this.streamId = streamId; this.available = true;
    this.association = null; this.attemptSeq = 0; this.lastLimitMs = -1; this.version = 0;
    this.lastOutcome = "ninguno"; this.seen = new Set(); this.seenValid = new Set();
    this.attempts = 0; this.manualAssignments = 0; this.streamMs = 0; this.finalSummary = null;
    this.publish("estado-inicial");
  }

  /** New ON before any Soniox stream: unavailable, with no outcome or summary from an earlier session. */
  clear(): void {
    this.clearAttempt();
    this.sessionId = null; this.streamId = null; this.available = false; this.association = null;
    this.version = 0; this.lastOutcome = "ninguno"; this.seen = new Set(); this.seenValid = new Set();
    this.attempts = 0; this.manualAssignments = 0; this.streamMs = 0; this.finalSummary = null; this.lastLimitMs = -1;
  }

  /** OFF, expiry, terminal error or local fallback. Captures the outcome before erasing. */
  end(outcome: "cancelado-off" | "motor-local"): void {
    // A result window that already expired by the clock is `sin-resultado`, even if its timer never ran.
    this.tick();
    const live = this.available || this.attempt !== null;
    const stateBefore = this.state();
    if (this.attempt) { this.lastOutcome = outcome; this.clearAttempt(); }
    else if (outcome === "motor-local") this.lastOutcome = "motor-local";
    if (!live) { this.finalSummary ??= this.summary(); return; }
    this.finalSummary = { ...this.summary(), state: stateBefore };
    this.available = false; this.association = null;
    this.seen = new Set(); this.seenValid = new Set();
    this.publish("fin-sesion");
    this.sessionId = null; this.streamId = null;
  }

  /** Summary kept after end() until the next start(). Scalars only. */
  summary(): IdentitySummary {
    if (!this.available && this.finalSummary) return this.finalSummary;
    return { state: this.state(), source: this.association?.source ?? null, lastOutcome: this.lastOutcome,
      attempts: this.attempts, manualAssignments: this.manualAssignments };
  }

  ref(): { sessionId: string; streamId: number } | null {
    return this.available && this.sessionId !== null && this.streamId !== null
      ? { sessionId: this.sessionId, streamId: this.streamId } : null;
  }

  state(): IdentityState {
    if (!this.available) return "no-disponible";
    if (this.attempt) return this.attempt.phase;
    return this.association ? "identificado" : "sin-identificar";
  }

  snapshot(): IdentitySnapshot {
    this.tick();
    const state = this.state();
    const snapshot: IdentitySnapshot = { state, version: this.version, knownOthers: this.association?.knownOthers.size ?? 0,
      lastOutcome: this.lastOutcome, speakersSeen: this.seen.size };
    if (this.available && this.association) { snapshot.speaker = this.association.speaker; snapshot.source = this.association.source; }
    if (this.attempt?.phase === "escuchando-frase") {
      const audioLeft = this.attempt.windowStartMs + IDENTITY_LIMITS.windowAudioMs - this.streamMs;
      const wallLeft = this.attempt.openedAt + IDENTITY_LIMITS.windowWallMs - this.host.now();
      snapshot.windowRemainingMs = Math.max(0, Math.min(audioLeft, wallLeft));
    }
    return snapshot;
  }

  observedSpeakers(): string[] { return this.available ? [...this.seen] : []; }

  relation(speaker: string | null): Relation {
    const association = this.available ? this.association : null;
    if (speaker === null || !association) return "desconocido";
    if (speaker === association.speaker) return "portador";
    return association.knownOthers.has(speaker) ? "otro" : "desconocido";
  }

  associationVersion(): number { return this.version; }

  subscribe(listener: (event: WearerAssociationEvent) => void): () => void {
    this.listeners.add(listener);
    listener(this.event("estado-inicial"));
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Every final token of the live stream, in reception order. The clock is checked first: a socket
   * callback may run before a delayed periodic timer, and an expired attempt must not collect evidence.
   */
  observeFinal(token: FinalToken): void {
    if (!this.available) return;
    this.tick();
    if (token.speaker !== null) {
      this.seen.add(token.speaker);
      if (token.valid) this.seenValid.add(token.speaker);
    }
    this.attempt?.evidence.push({ kind: "token", token });
  }

  /** `<end>` / `<fin>` markers: they cut a phrase. */
  observeMarker(): void {
    this.tick();
    this.attempt?.evidence.push({ kind: "cut" });
  }

  /**
   * Audio sent so far on the live stream (streamMs). Limits are checked with the previous streamMs
   * first, so audio delivered after the 8 s listening limit never extends a window that should have
   * closed; then the new audio may close it by length.
   */
  audio(streamMs: number): void {
    this.tick();
    this.streamMs = streamMs;
    this.tick();
  }

  /**
   * Called after all tokens of one message are processed, with its validated progress. The 6 s result
   * deadline is checked against the monotonic clock before any evaluation, independently of the timer.
   */
  progress(finalAudioProcMs: number): void {
    this.tick();
    const attempt = this.attempt;
    if (!this.available || !attempt || attempt.phase !== "esperando-resultado") return;
    if (finalAudioProcMs < attempt.windowEndMs + IDENTITY_LIMITS.endToleranceMs) return;
    const result = evaluateWindow(attempt.evidence, attempt.windowStartMs, attempt.windowEndMs);
    this.clearAttempt();
    if (result.outcome === "aceptado") this.associate(result.speaker, "frase");
    else this.lastOutcome = result.outcome;
  }

  /** Reference for phrase actions built now; null when identification is unavailable. */
  actionRef(): WearerActionRef | null {
    this.tick();
    if (!this.available || this.sessionId === null || this.streamId === null) return null;
    return { sessionId: this.sessionId, streamId: this.streamId, attemptSeq: this.attemptSeq, version: this.version };
  }

  /** Without a reference (direct API) the action applies to the live state; with one it must match exactly. */
  private sameStream(ref: WearerActionRef | undefined): boolean {
    return !ref || (ref.sessionId === this.sessionId && ref.streamId === this.streamId);
  }

  identify(ref?: WearerActionRef): boolean {
    this.tick();
    if (!this.available || this.attempt || !this.sameStream(ref)) return false;
    // «Identificar» offered before another attempt or association change is stale.
    if (ref && (ref.attemptSeq !== this.attemptSeq || ref.version !== this.version)) return false;
    const now = this.host.now();
    const id = ++this.attemptSeq;
    this.attempts++;
    this.attempt = { id, phase: "escuchando-frase", windowStartMs: Math.max(this.streamMs, this.lastLimitMs + 1),
      openedAt: now, windowEndMs: 0, deadlineAt: 0, evidence: [] };
    const session = this.sessionId;
    this.cancelTick = this.host.every(() => {
      if (this.attempt?.id === id && this.sessionId === session) this.tick();
    }, 250);
    return true;
  }

  /**
   * «Listo»: close the window now. With a reference, only for the attempt it was offered for. After the
   * 8 s limit the window is already closed by the clock and «Listo» has no effect.
   */
  finish(ref?: WearerActionRef): boolean {
    this.tick();
    if (!this.available || this.attempt?.phase !== "escuchando-frase" || !this.sameAttempt(ref)) return false;
    this.closeWindow(this.host.now());
    return true;
  }

  /** Cancels the attempt the reference was offered for (either phase); never a newer one. */
  cancel(ref?: WearerActionRef): boolean {
    this.tick();
    if (!this.available || !this.attempt || !this.sameAttempt(ref)) return false;
    this.lastOutcome = "cancelado-manual";
    this.clearAttempt();
    return true;
  }

  private sameAttempt(ref: WearerActionRef | undefined): boolean {
    return this.sameStream(ref) && (!ref || ref.attemptSeq === this.attempt?.id);
  }

  /** Gap or yield of audio: an active attempt cannot join evidence across it. */
  interrupt(): void {
    this.tick();
    if (!this.available || !this.attempt) return;
    this.lastOutcome = "audio-interrumpido";
    this.clearAttempt();
  }

  /** Manual choice or clear. Cancels any pending attempt; rejects stale menus and unseen labels. */
  assign(ref: SpeakerRef): boolean {
    this.tick();
    if (!this.available || ref.sessionId !== this.sessionId || ref.streamId !== this.streamId) return false;
    if (ref.speaker !== null && !this.seen.has(ref.speaker)) return false;
    if (this.attempt) { this.lastOutcome = "cancelado-manual"; this.clearAttempt(); }
    this.manualAssignments++;
    if (ref.speaker === null) {
      this.association = null; this.version++;
      this.publish("borrado");
    } else this.associate(ref.speaker, "manual");
    return true;
  }

  /** The caller has joined finalized diarization with local profile evidence for this live stream. */
  associateProfile(speaker: string | null, others: string[]): boolean {
    if (!this.available || (speaker !== null && !this.seenValid.has(speaker))) return false;
    if (this.attempt || (this.association && this.association.source !== "perfil")) return false;
    const knownOthers = new Set(others.filter(label => label !== speaker && this.seenValid.has(label)));
    const old = this.association;
    if (!speaker && !old) return true;
    if (old?.speaker === speaker && old.knownOthers.size === knownOthers.size && [...knownOthers].every(label => old.knownOthers.has(label))) return true;
    this.association = speaker ? { speaker, source: "perfil", knownOthers } : null;
    this.version++;
    this.publish(speaker ? "perfil" : "borrado");
    return true;
  }

  private associate(speaker: string, source: IdentitySource): void {
    const knownOthers = new Set([...this.seenValid].filter((label) => label !== speaker));
    this.association = { speaker, source, knownOthers };
    this.version++;
    if (source === "frase") this.lastOutcome = "aceptado";
    this.publish(source);
  }

  /**
   * Applies every limit that the monotonic clock and streamMs have already reached. Idempotent and
   * independent of who calls it (periodic timer, PCM, socket message, user action, snapshot or OFF).
   */
  private tick(): void {
    const attempt = this.attempt;
    if (!this.available || !attempt) return;
    const now = this.host.now();
    if (attempt.phase === "escuchando-frase") {
      const wallLimitAt = attempt.openedAt + IDENTITY_LIMITS.windowWallMs;
      if (this.streamMs - attempt.windowStartMs >= IDENTITY_LIMITS.windowAudioMs) this.closeWindow(now);
      // A late timer closes the window at its 8 s limit, so the 6 s result wait starts there.
      else if (now >= wallLimitAt) this.closeWindow(wallLimitAt);
      else return;
    }
    const pending = this.attempt;
    if (pending?.phase === "esperando-resultado" && now >= pending.deadlineAt) {
      this.lastOutcome = "sin-resultado";
      this.clearAttempt();
    }
  }

  private closeWindow(closedAt: number): void {
    const attempt = this.attempt!;
    // Never longer than the 5 s audio window, even if PCM was counted before the check ran.
    attempt.windowEndMs = Math.min(Math.max(this.streamMs, attempt.windowStartMs), attempt.windowStartMs + IDENTITY_LIMITS.windowAudioMs);
    if (attempt.windowEndMs - attempt.windowStartMs < IDENTITY_LIMITS.minWindowAudioMs) {
      this.lastOutcome = "audio-insuficiente";
      this.clearAttempt();
      return;
    }
    attempt.phase = "esperando-resultado";
    attempt.deadlineAt = closedAt + IDENTITY_LIMITS.resultWallMs;
  }

  /** Invalidates the attempt id, its timer and its retained evidence. */
  private clearAttempt(): void {
    const attempt = this.attempt;
    if (attempt) {
      const end = attempt.phase === "esperando-resultado" ? attempt.windowEndMs : Math.max(this.streamMs, attempt.windowStartMs);
      this.lastLimitMs = Math.max(this.lastLimitMs, end + IDENTITY_LIMITS.endToleranceMs);
      attempt.evidence.length = 0;
    }
    this.attempt = null;
    this.cancelTick?.();
    this.cancelTick = null;
  }

  private event(kind: WearerAssociationEvent["kind"]): WearerAssociationEvent {
    const association = this.available ? this.association : null;
    return { v: 1, sessionId: this.available ? this.sessionId : null, streamId: this.available ? this.streamId : null,
      version: this.version, kind, speaker: association?.speaker ?? null,
      knownOthers: association ? [...association.knownOthers] : [] };
  }

  private publish(kind: WearerAssociationEvent["kind"]): void {
    const event = this.event(kind);
    if (kind === "fin-sesion") { event.sessionId = null; event.streamId = null; event.speaker = null; event.knownOthers = []; }
    for (const listener of this.listeners) listener(event);
  }
}
