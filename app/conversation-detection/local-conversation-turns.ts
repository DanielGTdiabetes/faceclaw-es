import { type ConversationTurn } from "./conversation-turns";

export type LocalConversationModel = "android-system" | "whisper-base-es" | "whisper-small-es" | "whisper-medium-es";
let sessions = 0;
/** Anonymous capture-window fragments. No invented speaker labels or word timestamps. RAM only. */
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
  accept(text: string, startMs: number, endMs: number): boolean {
    const value = text.trim();
    if (!this.sessionId || !value || value.length > 600 || !Number.isSafeInteger(startMs)
      || !Number.isSafeInteger(endMs) || startMs < 0 || endMs <= startMs || endMs <= this.endMs) return false;
    this.endMs = endMs;
    const turn: ConversationTurn = { v: 1, sessionId: this.sessionId, streamId: this.streamId,
      seq: ++this.seq, engine: this.model, speaker: null, relation: "desconocido", associationVersion: 0,
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

export function isAnonymousLocalTurn(turn: ConversationTurn): boolean {
  return ["android-system", "whisper-base-es", "whisper-small-es", "whisper-medium-es"].includes(turn.engine)
    && turn.speaker === null && turn.relation === "desconocido" && turn.associationVersion === 0
    && turn.timing === "ventana" && Number.isSafeInteger(turn.startMs) && Number.isSafeInteger(turn.endMs)
    && turn.startMs !== null && turn.endMs !== null && turn.startMs >= 0 && turn.endMs > turn.startMs;
}
