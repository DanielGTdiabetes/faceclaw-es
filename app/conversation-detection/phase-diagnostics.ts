import { type VadFrame, type VadObserver } from "./local-vad";

/**
 * C1 diagnostic phases. They are marks made by the user, not speaker identification: a phase says
 * what the user indicated, never what the system recognised. Index order is shared with Kotlin
 * (`LocalTranscriptPhases`); ASR adds a sixth "mixta" bucket that acoustics never uses.
 */
export const DIAGNOSTIC_PHASES = ["sin-marcar", "otra-persona", "yo", "referencia", "fin"] as const;
export type DiagnosticPhase = typeof DIAGNOSTIC_PHASES[number];
export const MAX_PHASE_MARKS = 32;
/** Bins over 20·log10(rms / onsetThreshold): <−12, −12…−6, −6…−3, −3…0, 0…+6, +6…+12, ≥+12 dB. */
export const RELATIVE_BIN_EDGES_DB = [-12, -6, -3, 0, 6, 12] as const;
/** Bins over 20·log10(rms) in dBFS: <−60, −60…−50, −50…−40, −40…−30, −30…−20, ≥−20. */
export const ABSOLUTE_BIN_EDGES_DBFS = [-60, -50, -40, -30, -20] as const;

/**
 * Acoustic activity per phase. Everything under 0 dB relative is sub-threshold acoustic activity,
 * never "lost voice". `wallMs` (clock) and `inputMs` (sample time) are different measures: their
 * difference can include queue/callback skew and boundaries as well as missing input.
 */
export type PhaseAcoustics = {
  phase: DiagnosticPhase;
  wallMs: number; inputMs: number; chunks: number; gapResets: number; preemptions: number;
  stateMs: { sinActividad: number; candidato: number; posibleVoz: number; pausa: number };
  relativeBins: number[]; absoluteBins: number[]; clippedFrames: number;
  positiveMs: number; episodesOpened: number;
  candidateOnlyMs: number; candidateAborts: number; candidateInterruptedMs: number;
};
export type PhaseDiagnosticsSnapshot = {
  current: DiagnosticPhase; marks: number; ignoredMarks: number; finished: boolean;
  phases: PhaseAcoustics[];
};

const emptyPhase = (phase: DiagnosticPhase): PhaseAcoustics => ({
  phase, wallMs: 0, inputMs: 0, chunks: 0, gapResets: 0, preemptions: 0,
  stateMs: { sinActividad: 0, candidato: 0, posibleVoz: 0, pausa: 0 },
  relativeBins: Array.from({ length: RELATIVE_BIN_EDGES_DB.length + 1 }, () => 0),
  absoluteBins: Array.from({ length: ABSOLUTE_BIN_EDGES_DBFS.length + 1 }, () => 0),
  clippedFrames: 0, positiveMs: 0, episodesOpened: 0,
  candidateOnlyMs: 0, candidateAborts: 0, candidateInterruptedMs: 0,
});

/** Index of the bin for `value` given ascending edges; −Infinity falls into the first bin. */
export function binIndex(value: number, edges: readonly number[]): number {
  let index = 0;
  while (index < edges.length && value >= edges[index]!) index++;
  return index;
}

/**
 * RAM-only, scalar accumulator. Fed synchronously by the VAD on the PCM thread, so a mark applies
 * exactly from the next chunk. No text, audio or per-frame timeline is retained.
 */
export class PhaseDiagnostics implements VadObserver {
  private readonly phases = DIAGNOSTIC_PHASES.map(emptyPhase);
  private current = 0;
  private marks = 0;
  private ignoredMarks = 0;
  private startedAt: number;
  private finished = false;
  /** Candidate frames not yet resolved, per phase of arrival (fixed size, no per-frame list). */
  private readonly pendingCandidateMs = Array.from({ length: DIAGNOSTIC_PHASES.length }, () => 0);

  constructor(private readonly now: () => number) { this.startedAt = now(); }

  index(): number { return this.current; }

  /** Returns false (and counts it) after OFF, for unknown phases or beyond MAX_PHASE_MARKS. */
  mark(phase: DiagnosticPhase): boolean {
    const next = DIAGNOSTIC_PHASES.indexOf(phase);
    if (this.finished || next < 0 || this.marks >= MAX_PHASE_MARKS) { this.ignoredMarks++; return false; }
    this.closeWall();
    this.current = next;
    this.marks++;
    return true;
  }

  chunk(): void { if (!this.finished) this.phases[this.current]!.chunks++; }
  gapReset(): void { if (!this.finished) this.phases[this.current]!.gapResets++; }
  preemption(): void { if (!this.finished) this.phases[this.current]!.preemptions++; }

  frame(frame: VadFrame): void {
    if (this.finished) return;
    const phase = this.phases[this.current]!;
    phase.inputMs += 10;
    if (frame.state === "sin actividad") phase.stateMs.sinActividad += 10;
    else if (frame.state === "candidato") phase.stateMs.candidato += 10;
    else if (frame.state === "posible voz") phase.stateMs.posibleVoz += 10;
    else if (frame.state === "pausa") phase.stateMs.pausa += 10;
    if (frame.clipped) phase.clippedFrames++;
    else {
      phase.relativeBins[binIndex(20 * Math.log10(frame.rms / frame.onsetThreshold), RELATIVE_BIN_EDGES_DB)]!++;
      phase.absoluteBins[binIndex(20 * Math.log10(frame.rms), ABSOLUTE_BIN_EDGES_DBFS)]!++;
    }
    if (frame.positive) phase.positiveMs += 10;
    if (frame.state === "candidato") this.pendingCandidateMs[this.current] = (this.pendingCandidateMs[this.current] ?? 0) + 10;
    if (frame.event === "open") {
      // A candidate that opens an episode never counts as candidate-only time.
      phase.episodesOpened++;
      this.pendingCandidateMs.fill(0);
    } else if (frame.event === "abort") {
      phase.candidateAborts++;
      this.settleCandidate("candidateOnlyMs");
    }
  }

  candidateInterrupted(): void { if (!this.finished) this.settleCandidate("candidateInterruptedMs"); }

  /** Close wall time at OFF/expiry/error. Later marks and frames are ignored; data stays readable. */
  stop(): void {
    if (this.finished) return;
    this.settleCandidate("candidateInterruptedMs");
    this.closeWall();
    this.finished = true;
  }

  snapshot(): PhaseDiagnosticsSnapshot {
    const phases = this.phases.map((phase) => ({ ...phase, stateMs: { ...phase.stateMs },
      relativeBins: [...phase.relativeBins], absoluteBins: [...phase.absoluteBins] }));
    if (!this.finished) phases[this.current]!.wallMs += Math.max(0, this.now() - this.startedAt);
    return { current: DIAGNOSTIC_PHASES[this.current]!, marks: this.marks, ignoredMarks: this.ignoredMarks,
      finished: this.finished, phases };
  }

  private settleCandidate(field: "candidateOnlyMs" | "candidateInterruptedMs"): void {
    this.pendingCandidateMs.forEach((ms, index) => { this.phases[index]![field] += ms; });
    this.pendingCandidateMs.fill(0);
  }

  private closeWall(): void {
    const now = this.now();
    this.phases[this.current]!.wallMs += Math.max(0, now - this.startedAt);
    this.startedAt = now;
  }
}
