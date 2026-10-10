import { type EpisodeContext } from "./conversation-episodes";

export const FILTER_POLICY = { intervalMs: 20_000, hourlyRequests: 120, hourMs: 3_600_000,
  minWords: 4, continuousSpeechMs: 12_000 } as const;
export type FilterDecision = "send" | "short" | "unchanged" | "cadence" | "budget";
export type FilterMode = "assess" | "assist";
const words = (text: string): string[] => text.toLowerCase().match(/[a-záéíóúüñàèòïç0-9]+/g) ?? [];
const episodeKey = ({ ref }: EpisodeContext): string =>
  `${ref.sessionId}/${ref.streamId}/${ref.associationVersion}/${ref.episodeId}`;

/** Synchronous rules only. Text stays in the episode owner; this object retains counters/sequence IDs.
 * Short replies stay in context but cannot trigger a call alone. A successful assessment may have
 * one immediate follow-up; both requests consume the rolling budget, including failed/cancelled ones.
 * Budget and cadence survive OFF/ON within this process; neither is reset by a new capture stream.
 */
export class MechanicalGatekeeper {
  private stamps: number[] = [];
  private lastBatchAt = -Infinity;
  private episode = "";
  private sentThrough = 0;
  private assessed = false;
  private followedUp = false;
  private counted = "";
  private counters = { sent: 0, short: 0, unchanged: 0, cadence: 0, budget: 0 };

  begin(): void {
    this.interrupt();
    this.counters = { sent: 0, short: 0, unchanged: 0, cadence: 0, budget: 0 };
  }
  interrupt(): void {
    this.episode = ""; this.sentThrough = 0; this.assessed = false; this.followedUp = false; this.counted = "";
  }
  decide(context: EpisodeContext, mode: FilterMode, now: number): FilterDecision {
    this.trim(now);
    const episode = episodeKey(context);
    if (episode !== this.episode) {
      this.episode = episode; this.sentThrough = 0; this.assessed = false; this.followedUp = false;
    }
    const followUp = mode === "assist" && this.assessed && !this.followedUp;
    const fresh = context.turns.filter(t => t.seq > this.sentThrough);
    let decision: FilterDecision = "send";
    if (!followUp && !fresh.length) decision = "unchanged";
    else if (!followUp && (!fresh.some(t => words(t.text).length >= 2)
      || (fresh.reduce((sum, t) => sum + words(t.text).length, 0) < FILTER_POLICY.minWords
        && !fresh.some(t => /[¿?]/.test(t.text) && words(t.text).length >= 3)))) decision = "short";
    else if (this.stamps.length >= FILTER_POLICY.hourlyRequests) decision = "budget";
    else if (!followUp && now - this.lastBatchAt < FILTER_POLICY.intervalMs) decision = "cadence";
    const countKey = `${episode}/${context.ref.revision}/${mode}/${decision}`;
    if (decision !== "send" && countKey !== this.counted) this.counters[decision]++;
    this.counted = countKey;
    return decision;
  }
  submitted(context: EpisodeContext, mode: FilterMode, now: number): void {
    this.stamps.push(now); this.counters.sent++;
    if (mode === "assess") { this.lastBatchAt = now; this.assessed = true; this.followedUp = false; }
    else {
      if (!this.assessed || this.followedUp) this.lastBatchAt = now;
      this.followedUp = true;
      this.sentThrough = Math.max(...context.turns.map(t => t.seq), this.sentThrough);
    }
  }
  snapshot(now: number) {
    this.trim(now);
    return { policy: { ...FILTER_POLICY }, counters: { ...this.counters },
      requestsLastHour: this.stamps.length, remaining: Math.max(0, FILTER_POLICY.hourlyRequests - this.stamps.length),
      retryAfterMs: this.stamps.length >= FILTER_POLICY.hourlyRequests
        ? Math.max(0, this.stamps[0]! + FILTER_POLICY.hourMs - now) : 0 };
  }
  private trim(now: number): void { this.stamps = this.stamps.filter(at => now - at < FILTER_POLICY.hourMs); }
}
