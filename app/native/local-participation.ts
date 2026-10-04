import { Utils } from "@nativescript/core";
import { isMicModelReady } from "../apps/microphones/mic-models";
import { type DetectorParticipation, type LocalParticipationSnapshot } from "../conversation-detection/participation";

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
  deleteProfile(): boolean { try { return Boolean(this.native()?.deleteProfile()); } catch { return false; } }
  start(enrollment: boolean): boolean {
    if (!isMicModelReady("speaker-embedding")) { this.status = "modelo no disponible"; return false; }
    try { const started = Boolean(this.native()?.start(enrollment)); this.status = started ? "cargando" : "ocupado"; return started; }
    catch { this.status = "error"; return false; }
  }
  stop(): void { this.engine?.stop(); this.status = "inactivo"; }
  resetStream(): void { this.engine?.resetStream(); }
  acceptNative(pcm: unknown, vadState: string): void { this.engine?.acceptPcm(pcm, vadState); }
  snapshot(): LocalParticipationSnapshot {
    const empty = { status: this.status, worker: false, busy: false, inputBufferedBytes: 0, enrolling: false,
      profileSaved: false, enrollmentMs: 0, enrollmentSegments: 0, comparisons: 0, abstentions: 0, dropped: 0,
      voice: "insuficiente", participation: "evidencia insuficiente" };
    try { return this.engine ? { ...empty, ...JSON.parse(String(this.engine.diagnostics())) } : empty; }
    catch { return { ...empty, status: "error" }; }
  }
}
