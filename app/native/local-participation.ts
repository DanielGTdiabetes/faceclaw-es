import { Utils } from "@nativescript/core";
import { isMicModelReady } from "../apps/microphones/mic-models";
import { type DetectorParticipation, type LocalParticipationSnapshot } from "../conversation-detection/participation";
import { type ProfileVoiceMatch } from "../conversation-detection/profile-speaker-matcher";

declare const com: any;

export class LocalParticipation implements DetectorParticipation {
  private engine: any = null;
  private status = "inactivo";
  private native(): any {
    if (!global.isAndroid) return null;
    if (!this.engine) this.engine = new com.faceclaw.app.FaceclawLocalParticipation(Utils.android.getApplicationContext());
    return this.engine;
  }
  hasProfile(): boolean { try { return Boolean(this.native()?.hasProfile()); } catch { return false; } }
  profileState(): string {
    try { return this.native() ? String(this.native().profileState()) : "no disponible"; }
    catch { return "error"; }
  }
  deleteProfile(): boolean { try { return Boolean(this.native()?.deleteProfile()); } catch { return false; } }
  start(enrollment: boolean, durationMs?: number): boolean {
    if (!isMicModelReady("speaker-embedding")) { this.status = "modelo no disponible"; return false; }
    try {
      const started = Boolean(durationMs && !enrollment ? this.native()?.startTimed(3, durationMs) : this.native()?.start(enrollment, enrollment ? 4 : 3));
      this.status = started ? "cargando" : "ocupado"; return started;
    }
    catch { this.status = "error"; return false; }
  }
  stop(): void { this.engine?.stop(); this.status = "inactivo"; }
  resetStream(): void { this.engine?.resetStream(); }
  acceptNative(pcm: unknown, vadState: string, audioStartMs?: number): void {
    if (audioStartMs !== undefined) this.engine?.acceptTimedPcm(pcm, vadState, audioStartMs);
    else this.engine?.acceptPcm(pcm, vadState);
  }
  drainProfileMatches(): ProfileVoiceMatch[] {
    try { const matches: unknown = JSON.parse(String(this.engine?.drainMatches() ?? "[]")); return Array.isArray(matches) ? matches.slice(0, 16) : []; }
    catch { return []; }
  }
  snapshot(): LocalParticipationSnapshot {
    const empty = { status: this.status, worker: false, busy: false, inputBufferedBytes: 0, enrolling: false,
      profileSaved: false, enrollmentMs: 0, enrollmentSegments: 0, comparisons: 0, abstentions: 0, dropped: 0,
      voice: "insuficiente", participation: "evidencia insuficiente" };
    try { return this.engine ? { ...empty, ...JSON.parse(String(this.engine.diagnostics())) } : empty; }
    catch { return { ...empty, status: "error" }; }
  }
}
