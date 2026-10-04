import { Utils } from "@nativescript/core";
import { isAsrModelReady } from "./asr-model";
import { type DetectorTranscription, type LocalTranscriptionSnapshot, type TextLanguage } from "../conversation-detection/transcription";

declare const com: any;

/** Separate from assistant STT, captions, translation, profiles and conversation storage. */
export class LocalTranscription implements DetectorTranscription {
  private engine: any = null;
  private listener: any = null;
  private enabled = false;
  private lines: string[] = [];
  private status = "inactivo";

  start(language: TextLanguage = "es"): boolean {
    if (this.enabled) return false;
    this.lines = [];
    if (!global.isAndroid || !isAsrModelReady("whisper-base-es")) {
      this.status = "modelo no disponible";
      return false;
    }
    try {
      if (!this.engine) {
        this.engine = new com.faceclaw.app.FaceclawLocalTranscriber(Utils.android.getApplicationContext());
        this.listener = new com.faceclaw.app.FaceclawLocalTranscriptListener({
          onText: (text: string, _language: string) => {
            if (!this.enabled) return;
            this.lines.push(String(text).slice(0, 600));
            this.lines = this.lines.slice(-3);
          },
        });
        this.engine.setListener(this.listener);
      }
      // Kotlin captures the language only if this start is accepted; a rejected start changes nothing.
      this.enabled = Boolean(this.engine.start(language === "es" ? "es" : "auto"));
      this.status = this.enabled ? "cargando" : "ocupado";
      return this.enabled;
    } catch {
      this.enabled = false;
      this.status = "error";
      return false;
    }
  }

  resetStream(): void { this.lines = []; this.engine?.resetStream(); }
  setPhase(phase: number): void { if (this.enabled) this.engine?.setPhase(phase); }
  stop(): void { this.enabled = false; this.lines = []; this.engine?.stop(); this.status = "inactivo"; }
  acceptNative(pcm: unknown, vadState: string): void {
    if (this.enabled) this.engine?.acceptPcm(pcm, vadState);
  }
  text(): string { return this.lines.join("\n"); }
  snapshot(): LocalTranscriptionSnapshot {
    const empty = { enabled: this.enabled, status: this.status, worker: false, busy: false,
      inputBufferedBytes: 0, accepted: 0, abstentions: 0, dropped: 0 };
    if (!this.engine) return empty;
    try { return { ...empty, ...JSON.parse(String(this.engine.diagnostics())), enabled: this.enabled }; }
    catch { return { ...empty, status: "error" }; }
  }
}
