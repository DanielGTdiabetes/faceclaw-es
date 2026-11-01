/** Local profile evidence, aligned to the audio actually accepted by Soniox. Never sent to Hermes. */
export type ProfileVoiceMatch = { seq: number; startMs: number; endMs: number; voicedMs: number; similarity: number };
/** Aggregate reasons only: no speaker labels, scores, words, audio or profile vectors. */
export type ProfileMatcherSummary = {
  received: number; invalid: number; overlapping: number; mixed: number; sparse: number;
  positive: number; negative: number; uncertain: number; published: number; publicationRejected: number;
  resets: number; pending: number;
};
type Span = { speaker: string | null; startMs: number; endMs: number };
type Votes = { positive: number; negative: number; endMs: number };

/**
 * Joins local embeddings with finalized diarization. Two disjoint, single-speaker segments must
 * agree. Mixed/overlapping voices, incomplete progress, missing labels and uncertain scores abstain.
 * Bounds are selection rules, not a claim of measured speaker-recognition accuracy.
 */
export class ProfileSpeakerMatcher {
  private spans: Span[] = [];
  private pending: ProfileVoiceMatch[] = [];
  private votes = new Map<string, Votes>();
  private floor = 0;
  private progress = 0;
  private lastSeq = 0;
  private lastEnd = 0;
  private published = "";
  private counts = { received: 0, invalid: 0, overlapping: 0, mixed: 0, sparse: 0,
    positive: 0, negative: 0, uncertain: 0, published: 0, publicationRejected: 0, resets: 0 };

  constructor(private readonly publish: (wearer: string | null, others: string[]) => boolean | void) {}

  summary(): ProfileMatcherSummary { return { ...this.counts, pending: this.pending.length }; }

  reset(audioMs = 0): void {
    this.counts.resets++;
    this.spans = []; this.pending = []; this.votes.clear();
    this.floor = audioMs; this.progress = audioMs; this.lastEnd = audioMs;
    // Native sequence remains monotonic across resets within a session; a new start creates a matcher.
    this.published = ""; this.publish(null, []);
  }

  token(speaker: string | null, startMs: number, endMs: number): void {
    if (startMs < this.floor) return;
    this.spans.push({ speaker, startMs, endMs });
    if (this.spans.length > 512) {
      const removed = this.spans.shift()!;
      this.floor = Math.max(this.floor, removed.endMs);
    }
  }

  accept(raw: ProfileVoiceMatch): void {
    this.counts.received++;
    if (!raw || ![raw.seq, raw.startMs, raw.endMs, raw.voicedMs, raw.similarity].every(Number.isFinite)
      || !Number.isSafeInteger(raw.seq) || raw.seq <= this.lastSeq || raw.startMs < this.floor
      || raw.endMs <= raw.startMs || raw.endMs - raw.startMs > 8000
      || raw.voicedMs < 1000 || raw.voicedMs > raw.endMs - raw.startMs
      || raw.similarity < -1 || raw.similarity > 1.000001) { this.counts.invalid++; return; }
    this.lastSeq = raw.seq;
    this.pending.push({ ...raw });
    if (this.pending.length > 16) this.pending.shift();
    this.settle();
  }

  finalized(audioMs: number): void {
    if (!Number.isFinite(audioMs) || audioMs < this.progress) return;
    this.progress = audioMs;
    this.settle();
  }

  private settle(): void {
    while (this.pending.length && this.pending[0]!.endMs <= this.progress) {
      const match = this.pending.shift()!;
      if (match.startMs < this.floor || match.startMs < this.lastEnd) { this.counts.overlapping++; continue; }
      this.lastEnd = match.endMs;
      const spans = this.spans.filter(t => t.endMs > match.startMs && t.startMs < match.endMs);
      const labels = new Set(spans.map(t => t.speaker));
      if (labels.size !== 1 || labels.has(null)) { this.counts.mixed++; continue; }
      const speaker = spans[0]!.speaker!;
      const intervals = spans.map(t => [Math.max(t.startMs, match.startMs), Math.min(t.endMs, match.endMs)])
        .sort((a, b) => a[0]! - b[0]!);
      let coverage = 0, end = match.startMs;
      for (const [start, stop] of intervals) { coverage += Math.max(0, stop! - Math.max(start!, end)); end = Math.max(end, stop!); }
      if (coverage < Math.max(750, match.voicedMs * 0.5)) { this.counts.sparse++; continue; }
      if (match.similarity >= 0.80) this.counts.positive++;
      else if (match.similarity <= 0.60) this.counts.negative++;
      else this.counts.uncertain++;
      const retained = this.votes.get(speaker);
      const previous = retained && match.endMs - retained.endMs <= 90_000 ? retained : { positive: 0, negative: 0, endMs: 0 };
      const vote = match.similarity >= 0.80 ? { positive: previous.positive + 1, negative: 0, endMs: match.endMs }
        : match.similarity <= 0.60 ? { positive: 0, negative: previous.negative + 1, endMs: match.endMs }
        : { positive: 0, negative: 0, endMs: match.endMs };
      this.votes.set(speaker, vote);
      // A fixed, bounded label ledger. An old positive does not combine with a much later match.
      for (const [label, evidence] of this.votes) if (match.endMs - evidence.endMs > 90_000) this.votes.delete(label);
      while (this.votes.size > 16) this.votes.delete(this.votes.keys().next().value!);
    }
    // A phrase attempt may temporarily refuse this mapping. Do not cache a refused publication:
    // subsequent finalized progress can apply the same evidence once that attempt has ended.
    for (const [label, evidence] of this.votes) if (this.progress - evidence.endMs > 90_000) this.votes.delete(label);
    const positive = [...this.votes].filter(([, v]) => v.positive >= 2).map(([label]) => label);
    const wearer = positive.length === 1 ? positive[0]! : null;
    const others = wearer ? [...this.votes].filter(([label, v]) => label !== wearer && v.negative >= 2).map(([label]) => label).sort() : [];
    const key = JSON.stringify([wearer, others]);
    if (key !== this.published) {
      if (this.publish(wearer, others) === false) this.counts.publicationRejected++;
      else { this.published = key; this.counts.published++; }
    }
  }
}
