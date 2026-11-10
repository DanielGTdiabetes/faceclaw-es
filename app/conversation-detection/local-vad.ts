/**
 * G2.1 provisional energy VAD. It estimates acoustic activity, not speaker
 * identity, language, intelligibility or participation. TV/music/noise can pass.
 * Only scalar state is retained; PCM is read synchronously and never stored.
 */
export type LocalVadSnapshot = {
  state: "inactivo" | "sin actividad" | "candidato" | "posible voz" | "pausa";
  frames: number; positiveMs: number; episodes: number; completed: number; interrupted: number;
  frameRms: number; noiseFloor: number; threshold: number;
};

/**
 * Optional C1 instrumentation, called once per valid 10 ms frame after the VAD decided it.
 * `onsetThreshold` always uses the onset formula (also during an episode) so bins stay comparable.
 * `event`: "open" when this frame opens an episode, "abort" when a candidate run ends without opening.
 */
export type VadFrame = {
  rms: number; onsetThreshold: number; clipped: boolean; positive: boolean;
  state: LocalVadSnapshot["state"]; event: "open" | "abort" | null;
};
export interface VadObserver {
  frame(frame: VadFrame): void;
  /** A pending candidate was cut by a stream reset (gap, preemption, OFF, expiry): not an abort. */
  candidateInterrupted(): void;
}

const FRAME_SAMPLES = 160; // 10 ms at 16 kHz, five frames per BLE chunk.
const MIN_NOISE = 0.001;
const INITIAL_NOISE = 0.0015;
const ONSET_MS = 150;
const RELEASE_MS = 600;
/**
 * The background floor only learns outside an episode, so a step up in steady noise (street, car,
 * fan) kept the episode open forever: no release, a frozen lastVadStopAtMs and every Hermes turn
 * dropped as stale (09/11/2026). An episode this long is released and the floor jumps to the
 * episode's low-percentile level, which is the background under it.
 */
const MAX_EPISODE_MS = 15_000;
// Multiplicative low-percentile tracker: equilibrium near the 10th percentile of frame RMS.
const LOW_DOWN = 0.95;
const LOW_UP = 1.0055;

export class LocalEnergyVad {
  private state: LocalVadSnapshot["state"] = "inactivo";
  private frames = 0;
  private positiveMs = 0;
  private episodes = 0;
  private completed = 0;
  private interrupted = 0;
  private frameRms = 0;
  private noiseFloor = INITIAL_NOISE;
  private threshold = INITIAL_NOISE * 3;
  private onsetMs = 0;
  private quietMs = 0;
  private openMs = 0;
  private episodeLow = INITIAL_NOISE;
  private active = false;
  private observer: VadObserver | null = null;

  /** Observation only: decisions, thresholds and noise tracking are identical with or without it. */
  setObserver(observer: VadObserver | null): void { this.observer = observer; }

  snapshot(): LocalVadSnapshot {
    return { state: this.state, frames: this.frames, positiveMs: this.positiveMs,
      episodes: this.episodes, completed: this.completed, interrupted: this.interrupted,
      frameRms: this.frameRms, noiseFloor: this.noiseFloor, threshold: this.threshold };
  }

  /** Audio of the open episode (onset, voice and pauses) in ms; 0 outside an episode. Diagnostics only. */
  episodeMs(): number { return this.active ? this.openMs : 0; }

  /** End a stream without interpreting OFF/preemption/lost packets as silence. */
  resetStream(): void {
    if (this.active) this.interrupted++;
    else if (this.onsetMs > 0) this.observer?.candidateInterrupted();
    this.active = false;
    this.onsetMs = 0;
    this.quietMs = 0;
    this.openMs = 0;
    this.episodeLow = INITIAL_NOISE;
    this.frameRms = 0;
    this.noiseFloor = INITIAL_NOISE;
    this.threshold = INITIAL_NOISE * 3;
    this.state = "inactivo";
  }

  accept(pcm: Uint8Array): void {
    if (pcm.length !== 1600) throw new Error("VAD requires mono 16 kHz S16LE / 800 samples");
    for (let offset = 0; offset < pcm.length; offset += FRAME_SAMPLES * 2) {
      let sum = 0, squares = 0, clipped = 0;
      for (let i = offset; i < offset + FRAME_SAMPLES * 2; i += 2) {
        const unsigned = pcm[i]! | (pcm[i + 1]! << 8);
        const sample = unsigned >= 32768 ? unsigned - 65536 : unsigned;
        sum += sample;
        squares += sample * sample;
        if (Math.abs(sample) >= 32760) clipped++;
      }
      // Remove each frame's DC component, including a constant saturated input.
      const mean = sum / FRAME_SAMPLES;
      this.frameRms = Math.sqrt(Math.max(0, squares / FRAME_SAMPLES - mean * mean)) / 32768;
      const onsetThreshold = Math.max(0.003, this.noiseFloor * 3);
      this.threshold = Math.max(this.active ? 0.002 : 0.003, this.noiseFloor * (this.active ? 1.8 : 3));
      const positive = clipped < 2 && this.frameRms >= this.threshold;
      let event: VadFrame["event"] = null;
      this.frames++;
      if (this.active) this.openMs += 10;
      if (positive) {
        this.positiveMs += 10;
        this.quietMs = 0;
        if (!this.active) {
          this.onsetMs += 10;
          if (this.onsetMs >= ONSET_MS) {
            this.active = true; this.openMs = this.onsetMs; this.episodes++; event = "open";
            this.episodeLow = this.noiseFloor;
          }
        }
        this.state = this.active ? "posible voz" : "candidato";
      } else {
        if (!this.active && this.onsetMs > 0) event = "abort";
        this.onsetMs = 0;
        if (this.active) {
          this.quietMs += 10;
          if (this.quietMs >= RELEASE_MS) {
            this.active = false;
            this.quietMs = 0;
            this.completed++;
          }
        } else if (clipped < 2) {
          // Follow quiet background only, never candidates or the release tail.
          this.noiseFloor = Math.max(MIN_NOISE, this.noiseFloor * 0.99 + this.frameRms * 0.01);
        }
        this.state = this.active ? "pausa" : "sin actividad";
      }
      if (this.active && clipped < 2) {
        this.episodeLow = Math.max(MIN_NOISE, this.episodeLow * (this.frameRms < this.episodeLow ? LOW_DOWN : LOW_UP));
      }
      if (this.active && this.openMs >= MAX_EPISODE_MS) {
        // Steady background, not a turn: close it and learn its level so it does not reopen.
        this.active = false;
        this.quietMs = 0;
        this.completed++;
        this.noiseFloor = Math.max(this.noiseFloor, this.episodeLow);
        this.state = "sin actividad";
      }
      this.observer?.frame({ rms: this.frameRms, onsetThreshold, clipped: clipped >= 2, positive,
        state: this.state, event });
    }
  }
}
