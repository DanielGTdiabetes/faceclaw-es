import { type ConversationTurn } from "./conversation-turns";
import { type Relation } from "./wearer-identity";

export type LocalConversationModel = "whisper-base-es" | "whisper-small-es" | "whisper-medium-es";
/** Label the native speaker tracker gives the wearer's saved profile; other voices are `voz-N`. */
export const LOCAL_WEARER_SPEAKER = "portador";
const LOCAL_VOICE = /^voz-\d{1,2}$/;
let sessions = 0;
/**
 * Capture-window fragments, RAM only, without word timestamps. Whisper with speakers labels each window
 * with a session voice (wearer profile or `voz-N`); otherwise, or when unsure, it stays unattributed.
 */
export class LocalConversationTurns {
  private sessionId = "";
  private streamId = 0;
  private seq = 0;
  private endMs = -1;
  private model: LocalConversationModel = "whisper-small-es";
  private ring: ConversationTurn[] = [];
  private listeners = new Set<(turn: ConversationTurn) => void>();
  start(model: LocalConversationModel): void {
    this.sessionId = `local-${++sessions}`; this.streamId = 1; this.seq = 0; this.endMs = -1;
    this.model = model; this.ring = [];
  }
  reset(): void { if (this.sessionId) this.streamId++; this.ring = []; }
  stop(): void { this.sessionId = ""; this.ring = []; }
  accept(text: string, startMs: number, endMs: number, speaker: string | null = null, relation: Relation = "desconocido"): boolean {
    const value = text.trim();
    if (!this.sessionId || !value || value.length > 600 || !Number.isSafeInteger(startMs)
      || !Number.isSafeInteger(endMs) || startMs < 0 || endMs <= startMs || endMs <= this.endMs
      || !validLocalAttribution(speaker, relation)) return false;
    this.endMs = endMs;
    const turn: ConversationTurn = { v: 1, sessionId: this.sessionId, streamId: this.streamId,
      seq: ++this.seq, engine: this.model, speaker, relation, associationVersion: 0,
      text: value, timing: "ventana", startMs, endMs, closedBy: "endpoint" };
    this.ring.push(turn); if (this.ring.length > 40) this.ring.shift();
    for (const listener of this.listeners) listener({ ...turn });
    return true;
  }
  subscribe(listener: (turn: ConversationTurn) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
  list(): ConversationTurn[] { return this.ring.map((turn) => ({ ...turn })); }
}

/** Only the labels the native tracker can produce: the wearer, or a session voice for otro/desconocido. */
function validLocalAttribution(speaker: string | null, relation: Relation): boolean {
  if (relation === "portador") return speaker === LOCAL_WEARER_SPEAKER;
  if (relation === "otro") return typeof speaker === "string" && LOCAL_VOICE.test(speaker);
  return relation === "desconocido" && (speaker === null || typeof speaker === "string" && LOCAL_VOICE.test(speaker));
}

/** A window turn from a local engine, anonymous or speaker-attributed. Never carries association versions. */
export function isLocalWindowTurn(turn: ConversationTurn): boolean {
  return ["whisper-base-es", "whisper-small-es", "whisper-medium-es"].includes(turn.engine)
    && validLocalAttribution(turn.speaker, turn.relation) && turn.associationVersion === 0
    && turn.timing === "ventana" && Number.isSafeInteger(turn.startMs) && Number.isSafeInteger(turn.endMs)
    && turn.startMs !== null && turn.endMs !== null && turn.startMs >= 0 && turn.endMs > turn.startMs;
}

export function isAnonymousLocalTurn(turn: ConversationTurn): boolean {
  return isLocalWindowTurn(turn) && turn.speaker === null && turn.relation === "desconocido";
}
