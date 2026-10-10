import { GATEKEEPER_PILOT } from "./gatekeeper-pilot";
import { parseGatekeeperDecision, type GatekeeperHost, type GatekeeperInput, type GatekeeperProvider } from "./gatekeeper";
import { type ConversationTurn } from "./conversation-turns";
import { type Relation } from "./wearer-identity";

export type GatekeeperBenchmarkRow = { id: string; action: "ignore" | "wait" | "assist"; latencyMs: number; bypass?: true };
export type GatekeeperBenchmarkResult = {
  source: "synthetic"; review: "pending"; completed: boolean; failures: number;
  stopReason: "completed" | "priority" | "capture" | "cancelled";
  rows: GatekeeperBenchmarkRow[]; resources: object | null;
};
/** Actual provider replay, without a microphone or Hermes calls. Annotations remain provisional. */
export function runGatekeeperBenchmark(provider: GatekeeperProvider, host: GatekeeperHost,
  allowed: () => boolean, progress: (completed: number, total: number) => void,
  done: (result: GatekeeperBenchmarkResult) => void): (reason?: "capture" | "cancelled") => void {
  const rows: GatekeeperBenchmarkRow[] = [];
  let stopped = false, failures = 0, cancelNative = () => {}, cancelTimer = () => {}, unsubscribe = () => {};
  const finish = (completed: boolean, stopReason: GatekeeperBenchmarkResult["stopReason"]) => {
    if (stopped) return;
    stopped = true; cancelNative(); cancelTimer(); unsubscribe();
    const resources = provider.diagnostics?.() ?? null;
    provider.unload(); done({ source: "synthetic", review: "pending", completed, stopReason, failures, rows, resources });
  };
  unsubscribe = host.subscribePriority(active => { if (active) finish(false, "priority"); });
  const next = () => {
    if (stopped) return;
    if (!allowed()) { finish(false, "capture"); return; }
    if (host.priorityActive()) { finish(false, "priority"); return; }
    const example = GATEKEEPER_PILOT[rows.length];
    if (!example) { finish(true, "completed"); return; }
    const now = host.now();
    // Optional attribution fields (speakers.jsonl style); the pilot rows stay unattributed.
    const labelled = example as typeof example & { fragmentSpeaker?: string | null; fragmentRelation?: Relation };
    const turns: ConversationTurn[] = [...example.recent.map(t => {
      const turn = t as typeof t & { speaker?: string | null; relation?: Relation };
      return { text: t.text, atMs: t.atMs, speaker: turn.speaker ?? null, relation: turn.relation ?? "desconocido" };
    }), { text: example.fragment, atMs: example.atMs, speaker: labelled.fragmentSpeaker ?? null,
      relation: labelled.fragmentRelation ?? "desconocido" }].map((t, i) => ({
        v: 1, sessionId: "synthetic-pilot", streamId: 1, associationVersion: 0, seq: i + 1,
        text: t.text, startMs: t.atMs, endMs: t.atMs + 1, timing: "ventana", engine: "whisper-small-es",
        speaker: t.speaker, relation: t.relation, closedBy: "endpoint",
      }));
    const input: GatekeeperInput = { mode: example.mode as "assess" | "assist", final: false,
      lastTextAt: now, memoryEnabled: false, sentThroughSeq: example.mode === "assist" ? turns.length - 1 : 0,
      context: { modality: "identidad-opcional", turns,
        ref: { sessionId: "synthetic-pilot", streamId: 1, associationVersion: 0, episodeId: rows.length + 1, revision: turns.length } } };
    let settled = false;
    const result = (raw: string | null) => {
      if (stopped || settled) return;
      settled = true; cancelTimer();
      const decision = parseGatekeeperDecision(raw);
      if (!decision) failures++;
      rows.push({ id: example.id, action: decision?.action ?? "assist", latencyMs: Math.max(0, host.now() - now),
        ...(!decision ? { bypass: true as const } : {}) });
      progress(rows.length, GATEKEEPER_PILOT.length);
      cancelTimer = host.after(next, 1);
    };
    cancelTimer = host.after(() => { cancelNative(); result(null); }, provider.isLoaded() ? 30_000 : 45_000);
    try {
      const handle = provider.classify(input, result);
      if (settled || stopped) handle(); else cancelNative = handle;
    } catch { result(null); }
  };
  cancelTimer = host.after(next, 1);
  return (reason = "cancelled") => finish(false, reason);
}
