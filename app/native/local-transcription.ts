import { Utils } from "@nativescript/core";
import { isAsrModelReady } from "./asr-model";
import { conversationModel, conversationLocalModel, conversationLocalSpeakers } from "../conversation-detection/session-controls";
import { isMicModelReady } from "../apps/microphones/mic-models";
import { isSystemTranscriptionReady } from "./system-transcription";
import { LocalConversationTurns } from "../conversation-detection/local-conversation-turns";
import { type ConversationTurn } from "../conversation-detection/conversation-turns";
import { type Relation } from "../conversation-detection/wearer-identity";

/** A4: rolling RAM-only text, by characters instead of the last three deliveries. */
const MAX_TEXT_CHARS = 1200;
import { type DetectorTranscription, type LocalTranscriptionSnapshot, type TextLanguage } from "../conversation-detection/transcription";

declare const com: any;

/** Separate from assistant STT, captions, translation, profiles and conversation storage. */
export class LocalTranscription implements DetectorTranscription {
  private engine: any = null;
  private listener: any = null;
  private enabled = false;
  private lines: string[] = [];
  private status = "inactivo";
  private readonly turnLog = new LocalConversationTurns();
  private engineKind = "";

  /**
   * `profileAssociation` (manual conversation) asks Whisper for speakers when the RAM choice allows it and
   * the verified speaker model is downloaded: windows then close at pauses and carry a session voice.
   */
  start(language: TextLanguage = "es", profileAssociation = false, maxMs = 120_000): boolean {
    if (this.enabled) return false;
    this.lines = [];
    const selected = conversationModel();
    const model = selected === "soniox" ? conversationLocalModel() : selected;
    const system = model === "android-system";
    if (!global.isAndroid || !(system ? isSystemTranscriptionReady() : isAsrModelReady(model))) {
      this.status = "modelo no disponible";
      return false;
    }
    try {
      if (this.engine && this.engineKind !== (system ? "system" : "whisper")) {
        if (this.snapshot().worker || this.snapshot().busy) { this.status = "ocupado"; return false; }
        this.engine.stop(); this.engine = null;
      }
      if (!this.engine) {
        const NativeEngine = system ? com.faceclaw.app.FaceclawSystemTranscriber : com.faceclaw.app.FaceclawLocalTranscriber;
        this.engine = new NativeEngine(Utils.android.getApplicationContext());
        this.engineKind = system ? "system" : "whisper";
        this.listener = new com.faceclaw.app.FaceclawLocalTranscriptListener({
          onText: (text: string, _language: string) => {
            this.appendText(String(text));
          },
          onSegment: (text: string, _language: string, startMs: number, endMs: number) => {
            if (!this.enabled) return;
            this.appendText(String(text));
            this.turnLog.accept(String(text), Number(startMs), Number(endMs));
          },
          onSpeakerSegment: (text: string, _language: string, startMs: number, endMs: number, speaker: string, relation: string) => {
            if (!this.enabled) return;
            this.appendText(String(text));
            const label = String(speaker);
            this.turnLog.accept(String(text), Number(startMs), Number(endMs), label ? label : null,
              (["portador", "otro", "desconocido"].includes(String(relation)) ? String(relation) : "desconocido") as Relation);
          },
        });
        this.engine.setListener(this.listener);
      }
      // Kotlin captures the language only if this start is accepted; a rejected start changes nothing.
      this.turnLog.start(model);
      const wire = system || language === "es" ? "es" : "auto";
      const speakers = !system && profileAssociation && conversationLocalSpeakers() && isMicModelReady("speaker-embedding");
      this.enabled = Boolean(speakers ? this.engine.startWithSpeakers(wire, model, maxMs) : this.engine.start(wire, model, maxMs));
      if (!this.enabled) this.turnLog.stop();
      this.status = this.enabled ? "cargando" : "ocupado";
      return this.enabled;
    } catch {
      this.enabled = false;
      this.status = "error";
      return false;
    }
  }

  private appendText(text: string): void {
    if (!this.enabled) return;
    this.lines.push(text.slice(0, 600));
    while (this.lines.length > 1 && this.lines.join(" ").length > MAX_TEXT_CHARS) this.lines.shift();
  }
  subscribeTurns(listener: (turn: ConversationTurn) => void): () => void { return this.turnLog.subscribe(listener); }
  turns(): ConversationTurn[] { return this.turnLog.list(); }
  resetStream(): void { this.lines = []; this.turnLog.reset(); this.engine?.resetStream(); }
  setPhase(phase: number): void { if (this.enabled) this.engine?.setPhase(phase); }
  stop(): void { this.enabled = false; this.lines = []; this.turnLog.stop(); this.engine?.stop(); this.status = "inactivo"; }
  acceptNative(pcm: unknown, vadState: string): void {
    if (this.enabled) this.engine?.acceptPcm(pcm, vadState);
  }
  /** Continuous text: 3 s windows deliver short fragments that read as one paragraph. */
  text(): string { return this.lines.join(" "); }
  snapshot(): LocalTranscriptionSnapshot {
    const empty = { enabled: this.enabled, status: this.status, worker: false, busy: false,
      inputBufferedBytes: 0, accepted: 0, abstentions: 0, dropped: 0 };
    if (!this.engine) return empty;
    try { return { ...empty, ...JSON.parse(String(this.engine.diagnostics())), enabled: this.enabled }; }
    catch { return { ...empty, status: "error" }; }
  }
}
