import { type EpisodeAssessment, type EpisodeContext, type EpisodeModality, type EpisodeRef }
  from "../conversation-detection/conversation-episodes";

export const CONVERSATION_CAPABILITY = "conv/1";
/**
 * The bridge validates the explicit `modality` field and accepts `identidad-opcional` contexts
 * (unknown relations, association version 0). Without it the client sends only the conv/1 contract.
 */
export const CONVERSATION_OPTIONAL_IDENTITY_CAPABILITY = "conv/2";
export type ConversationChannelStats = {
  sent: number; verdicts: number; tema: number; cortesia: number; incierto: number;
  mensajes: number; nada: number; errores: number; invalidos: number; caducados: number; cancelados: number;
  rechazados: number;
};
const emptyStats = (): ConversationChannelStats => ({ sent: 0, verdicts: 0, tema: 0, cortesia: 0, incierto: 0,
  mensajes: 0, nada: 0, errores: 0, invalidos: 0, caducados: 0, cancelados: 0, rechazados: 0 });
export type ConversationResult =
  | { ref: EpisodeRef; mode: "assess"; verdict: EpisodeAssessment }
  | { ref: EpisodeRef; mode: "assist"; text: string | null };
export type ConversationChannelHost = {
  send(frame: object): boolean;
  now(): number;
  after(callback: () => void, ms: number): () => void;
};
type Pending = {
  requestId: string; ref: EpisodeRef; mode: "assess" | "assist"; modality: EpisodeModality; expiresAt: number;
  result: (result: ConversationResult | null) => void; cancelTimer: () => void;
};

/**
 * Dedicated, opt-in text channel. No chat history, tools, audio, retry or display operations.
 * The episode owner must check its live reference again before applying any result.
 */
export class ConversationChannel {
  private supported = false;
  private optionalIdentity = false;
  private enabled = false;
  private stats = emptyStats();
  private chatActive = false;
  private connection = 0;
  private sequence = 0;
  private pending: Pending | null = null;

  constructor(private readonly host: ConversationChannelHost) {}

  /** Called only after authenticated hello-ack. Capability alone never enables transmission. */
  negotiate(capabilities: unknown): void {
    this.reset();
    this.supported = Array.isArray(capabilities) && capabilities.includes(CONVERSATION_CAPABILITY);
    this.optionalIdentity = this.supported && (capabilities as unknown[]).includes(CONVERSATION_OPTIONAL_IDENTITY_CAPABILITY);
  }

  /** Explicit RAM-only choice, refused on an old/unsupported bridge. No automatic re-enable. */
  setEnabled(enabled: boolean): boolean {
    if (enabled && !this.supported) return false;
    this.enabled = enabled;
    if (!enabled) this.cancel();
    return true;
  }

  isReady(): boolean { return this.supported && this.enabled && !this.chatActive; }
  isSupported(): boolean { return this.supported; }
  /** True only when the authenticated bridge announced conv/2; an old bridge keeps required identity. */
  supportsOptionalIdentity(): boolean { return this.optionalIdentity; }
  /** Aggregate counters only: no text, labels, references or timings. Reset by the owner at ON. */
  statistics(): ConversationChannelStats { return { ...this.stats }; }
  resetStatistics(): void { this.stats = emptyStats(); }
  isEnabled(): boolean { return this.enabled; }

  /** Normal chat always has priority. This never cancels or changes a chat request. */
  setChatActive(active: boolean): void {
    this.chatActive = active;
    if (active) this.cancel();
  }

  /** Disconnect/reconfigure clears consent for this connection; no replay after reconnect. */
  reset(): void {
    this.enabled = false;
    this.supported = false;
    this.optionalIdentity = false;
    this.chatActive = false;
    this.connection++;
    this.cancel(false);
  }

  request(context: EpisodeContext, mode: "assess" | "assist", timeoutMs: number,
    result: (result: ConversationResult | null) => void): boolean {
    if (!this.isReady() || (mode !== "assess" && mode !== "assist")
      || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000
      || !validContext(context, this.optionalIdentity)) { this.stats.rechazados++; return false; }
    const modality = context.modality ?? "identidad-requerida";
    // One outstanding evaluation per phone. New context retires the previous request.
    this.cancel();
    // The cancellation callback may have turned OFF or started normal chat.
    if (!this.isReady()) return false;
    const pending: Pending = { requestId: `c${this.connection}-${++this.sequence}`, ref: { ...context.ref }, mode,
      modality, expiresAt: this.host.now() + timeoutMs, result, cancelTimer: () => {} };
    this.pending = pending;
    let sent = false;
    try {
      // Required identity keeps the exact conv/1 frame; optional identity is always explicit on the wire.
      sent = this.host.send({ chan: "conv", type: mode, requestId: pending.requestId, ref: { ...pending.ref },
        ...(modality === "identidad-opcional" ? { modality } : {}),
        timeoutMs, turns: context.turns.map((turn) => ({ seq: turn.seq, speaker: turn.speaker,
          relation: turn.relation, text: turn.text, startMs: turn.startMs, endMs: turn.endMs })) });
    } catch { /* Transport failure is a silent abstention, never a chat fallback. */ }
    if (!sent) {
      if (this.pending === pending) { this.stats.errores++; this.finish(null); }
      return false;
    }
    this.stats.sent++;
    if (this.pending === pending) {
      pending.cancelTimer = this.host.after(() => {
        if (this.pending === pending) { this.stats.caducados++; this.cancel(); }
      }, timeoutMs);
    }
    return true;
  }

  /** A cancel belongs to this request only; stale responses can never complete another one. */
  cancel(notifyServer = true): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    pending.cancelTimer();
    this.stats.cancelados++;
    if (notifyServer) {
      try { this.host.send({ chan: "conv", type: "cancel", requestId: pending.requestId, ref: { ...pending.ref } }); }
      catch { /* Local invalidation already took effect. */ }
    }
    this.deliver(pending, null);
  }

  handle(frame: unknown): void {
    const pending = this.pending;
    if (!pending || !isRecord(frame) || frame.chan !== "conv" || frame.requestId !== pending.requestId
      || !sameRef(frame.ref, pending.ref)) return;
    // Check the monotonic deadline here too: a delayed timer must not admit late text.
    if (!this.isReady() || this.host.now() >= pending.expiresAt) { this.stats.caducados++; this.cancel(); return; }
    if (frame.type === "error") { this.stats.errores++; this.finish(null); return; }
    if (frame.type !== "result" || frame.mode !== pending.mode) return;
    if (pending.mode === "assess") {
      if (frame.verdict !== "tema" && frame.verdict !== "cortesia" && frame.verdict !== "incierto") {
        this.stats.invalidos++; this.finish(null); return;
      }
      this.stats.verdicts++; this.stats[frame.verdict]++;
      this.finish({ mode: "assess", ref: { ...pending.ref }, verdict: frame.verdict });
    } else {
      // Only a final answer can reach the owner. Thinking/tool/status messages stay invisible.
      if (frame.kind !== "mensaje" && frame.kind !== "nada") { this.stats.invalidos++; this.finish(null); return; }
      if (frame.kind === "nada") { this.stats.nada++; this.finish({ mode: "assist", ref: { ...pending.ref }, text: null }); return; }
      if (typeof frame.text !== "string" || !frame.text.trim() || frame.text.length > 1200) {
        this.stats.invalidos++; this.finish(null); return;
      }
      this.stats.mensajes++;
      this.finish({ mode: "assist", ref: { ...pending.ref }, text: frame.text.trim() });
    }
  }

  private finish(result: ConversationResult | null): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    pending.cancelTimer();
    this.deliver(pending, result);
  }

  private deliver(pending: Pending, result: ConversationResult | null): void {
    try { pending.result(result); } catch { /* Owner failures must not break chat or socket callbacks. */ }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Association version 0 (no identity yet) exists only in optional-identity contexts. */
function validRef(value: unknown, minVersion = 1): value is EpisodeRef {
  return isRecord(value) && typeof value.sessionId === "string" && value.sessionId.length > 0
    && value.sessionId.length <= 128
    && [value.streamId, value.episodeId, value.revision]
      .every((n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 1)
    && typeof value.associationVersion === "number" && Number.isSafeInteger(value.associationVersion)
    && value.associationVersion >= minVersion;
}
function sameRef(value: unknown, expected: EpisodeRef): boolean {
  return validRef(value, 0) && value.sessionId === expected.sessionId && value.streamId === expected.streamId
    && value.associationVersion === expected.associationVersion && value.episodeId === expected.episodeId
    && value.revision === expected.revision;
}
function validContext(context: EpisodeContext, optionalSupported: boolean): boolean {
  const modality = context?.modality ?? "identidad-requerida";
  if (modality !== "identidad-requerida" && modality !== "identidad-opcional") return false;
  const optional = modality === "identidad-opcional";
  // An old bridge would reject or misread an anonymous context: never send it there.
  if (optional && !optionalSupported) return false;
  if (!context || !validRef(context.ref, optional ? 0 : 1) || !Array.isArray(context.turns)
    || !context.turns.length || context.turns.length > 40) return false;
  let chars = 0, previousSeq = 0;
  let wearer: string | null = null;
  const others = new Set<string>();
  const relations = new Map<string, string>();
  for (const turn of context.turns) {
    if (!turn || turn.sessionId !== context.ref.sessionId || turn.streamId !== context.ref.streamId
      || turn.associationVersion !== context.ref.associationVersion || turn.engine !== "soniox"
      || !Number.isSafeInteger(turn.seq) || turn.seq <= previousSeq || turn.timing !== "valido"
      || typeof turn.text !== "string" || !turn.text.trim()
      || (turn.speaker !== null && (typeof turn.speaker !== "string" || turn.speaker.length > 32))
      || !["portador", "otro", "desconocido"].includes(turn.relation)
      || ((turn.relation === "portador" || turn.relation === "otro") && !turn.speaker)
      || typeof turn.startMs !== "number" || !Number.isFinite(turn.startMs) || turn.startMs < 0
      || typeof turn.endMs !== "number" || !Number.isFinite(turn.endMs) || turn.endMs < turn.startMs
      || turn.closedBy === "frontera" || turn.closedBy === "fin-sesion") return false;
    previousSeq = turn.seq;
    chars += turn.text.length;
    // A label carries one relation per context: mixed attributions are contradictory.
    if (turn.speaker !== null) {
      if (relations.has(turn.speaker) && relations.get(turn.speaker) !== turn.relation) return false;
      relations.set(turn.speaker, turn.relation);
    }
    if (turn.relation === "portador") {
      if (wearer && wearer !== turn.speaker) return false;
      wearer = turn.speaker;
    }
    if (turn.relation === "otro") others.add(turn.speaker!);
  }
  if (chars > 6000 || (wearer !== null && others.has(wearer))) return false;
  return optional || (!!wearer && others.size > 0);
}
