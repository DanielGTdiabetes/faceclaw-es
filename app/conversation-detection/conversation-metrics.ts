import { type ConversationTurn } from "./conversation-turns";

/** Optional wire diagnostics: only bounded durations and the turn-closing category. */
export type ConversationClientTiming = {
  directPending?: boolean;
  smartTurnMode?: "smart" | "fallback" | "off";
  smartTurnProb?: number;
  /** Measurement of a possible Smart close: text delay after Smart's end, and Smart ends overrun by speech. */
  smartEndToTextMs?: number; smartResumesBeforeText?: number; smartLongestResumeGapMs?: number;
  vadStopToRequestMs?: number; turnToRequestMs?: number; gapSinceLastRequestMs?: number;
  closedBy?: ConversationTurn["closedBy"];
};
export function clientDuration(ms: unknown): number | undefined {
  return typeof ms === "number" && Number.isFinite(ms) && ms >= 0 && ms <= 86_400_000
    ? Math.round(ms) : undefined;
}
export function readClientTiming(value: unknown): ConversationClientTiming | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>, result: ConversationClientTiming = {};
  if (typeof source.directPending === "boolean") result.directPending = source.directPending;
  if (source.smartTurnMode === "smart" || source.smartTurnMode === "fallback" || source.smartTurnMode === "off") result.smartTurnMode = source.smartTurnMode;
  if (typeof source.smartTurnProb === "number" && Number.isFinite(source.smartTurnProb)
    && source.smartTurnProb >= 0 && source.smartTurnProb <= 1) result.smartTurnProb = source.smartTurnProb;
  if (Number.isSafeInteger(source.smartResumesBeforeText) && (source.smartResumesBeforeText as number) >= 0
    && (source.smartResumesBeforeText as number) <= 1000) result.smartResumesBeforeText = source.smartResumesBeforeText as number;
  for (const key of ["vadStopToRequestMs", "turnToRequestMs", "gapSinceLastRequestMs", "smartEndToTextMs", "smartLongestResumeGapMs"] as const) {
    const ms = clientDuration(source[key]);
    if (ms !== undefined) result[key] = ms;
  }
  if (typeof source.closedBy === "string" && ["pausa", "endpoint", "finalize", "frontera", "cambio-hablante",
    "limite", "fin-sesion"].includes(source.closedBy)) result.closedBy = source.closedBy as ConversationTurn["closedBy"];
  return Object.keys(result).length ? result : undefined;
}

/** Fixed-size RAM diagnostics. No speech, labels, request IDs or per-turn history. */
export const LATENCY_BUCKETS_MS = [250, 500, 1000, 2000, 4000, 6000, 10000, 15000, 30000] as const;
export class LatencyMetric {
  private count = 0;
  private sum = 0;
  private max = 0;
  private buckets = Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0);
  add(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.count++; this.sum += ms; this.max = Math.max(this.max, ms);
    const bucket = LATENCY_BUCKETS_MS.findIndex((limit) => ms <= limit);
    this.buckets[bucket < 0 ? LATENCY_BUCKETS_MS.length : bucket]!++;
  }
  snapshot() {
    const percentile = (fraction: number): number | null => {
      if (!this.count) return null;
      let seen = 0;
      for (let i = 0; i < this.buckets.length; i++) {
        seen += this.buckets[i]!;
        if (seen >= Math.ceil(this.count * fraction)) return LATENCY_BUCKETS_MS[i] ?? this.max;
      }
      return this.max;
    };
    return { count: this.count, meanMs: this.count ? Math.round(this.sum / this.count) : null,
      maxMs: Math.round(this.max), p50UpperMs: percentile(.5), p95UpperMs: percentile(.95),
      buckets: [...this.buckets] };
  }
}

export const emptyConversationMetrics = () => ({
  listeningMs: 0, busyMs: 0, turnsDuringInference: 0, chunksDuringInference: 0,
  sentAudioMsDuringInference: 0, finalTokensDuringInference: 0, measuredFlights: 0,
  nativeSent: 0, fallbacks: 0, providerAttempts: 0, apiCalls: 0,
  fallbackReasons: { timeout: 0, error: 0, invalid: 0 },
  turnToRequest: new LatencyMetric(), vadStopToRequest: new LatencyMetric(),
  assessRoundTrip: new LatencyMetric(), assistRoundTrip: new LatencyMetric(),
  turnToNativeSent: new LatencyMetric(), resultToNativeSent: new LatencyMetric(),
  primary: new LatencyMetric(), fallback: new LatencyMetric(), queue: new LatencyMetric(),
  primaryFirstText: new LatencyMetric(), fallbackFirstText: new LatencyMetric(), cancelWait: new LatencyMetric(),
});
