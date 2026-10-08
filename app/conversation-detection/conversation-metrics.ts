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
