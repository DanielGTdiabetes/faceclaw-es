import { Frame, Observable, type EventData, type Page } from "@nativescript/core";
import { dashboardController } from "../g2/dashboard-controller";
import { micModelState, onMicModelStateChanged, startMicModelDownload } from "../apps/microphones/mic-models";
import { profileGuide } from "../conversation-detection/profile-guide";

class VoiceProfileViewModel extends Observable {
  private readonly subscriptions: (() => void)[] = [];
  constructor() {
    super();
    this.subscriptions.push(dashboardController.conversationDetector.subscribe(() => this.refresh()));
    this.subscriptions.push(onMicModelStateChanged((id) => { if (id === "speaker-embedding") this.refresh(); }));
  }
  private guide() {
    const detector = dashboardController.conversationDetector;
    return profileGuide(detector.snapshot(), detector.ownProfileState(), micModelState("speaker-embedding").status);
  }
  private refresh(): void {
    for (const key of ["state", "hint", "phrase", "progress", "progressText", "button", "buttonEnabled", "privacyVisibility"]) {
      this.notifyPropertyChange(key, this.get(key));
    }
  }
  get state(): string { return this.guide().state; }
  get hint(): string { return this.guide().hint; }
  get phrase(): string { return this.guide().phrase; }
  get progress(): number { return this.guide().progress; }
  get progressText(): string {
    const snapshot = dashboardController.conversationDetector.snapshot();
    const part = snapshot.participation;
    if (!this.guide().active) return dashboardController.conversationDetector.ownProfileState() === "guardado" ? "Completado · captura OFF" : "Captura OFF";
    return `${Math.min(4, part?.enrollmentSegments ?? 0)} de 4 muestras aprovechadas · ${((part?.enrollmentMs ?? 0) / 1000).toFixed(1)} de 10 s mín. · ${this.progress} %`;
  }
  get privacyVisibility(): string { return this.guide().active ? "collapsed" : "visible"; }
  get button(): string {
    const detector = dashboardController.conversationDetector;
    if (this.guide().active) return "Cancelar registro (OFF)";
    if (detector.ownProfileState() === "guardado") return "Volver a conversación";
    const model = micModelState("speaker-embedding");
    if (model.status === "downloading") return `Descargando modelo: ${Math.floor(model.bytesDownloaded * 100 / model.totalBytes)} %`;
    if (model.status !== "ready") return model.status === "error" ? "Reintentar descarga (29 MB)" : "Descargar modelo (29 MB)";
    return "Empezar y guardar mi perfil";
  }
  get buttonEnabled(): boolean {
    const detector = dashboardController.conversationDetector;
    if (this.guide().active) return true;
    return !detector.snapshot().enabled && !["error", "no disponible"].includes(detector.ownProfileState())
      && micModelState("speaker-embedding").status !== "downloading";
  }
  onButtonTap(): void {
    const detector = dashboardController.conversationDetector;
    if (this.guide().active) { detector.setEnabled(false); return; }
    if (!this.buttonEnabled) return;
    if (detector.ownProfileState() === "guardado") { this.onCloseTap(); return; }
    if (micModelState("speaker-embedding").status !== "ready") { startMicModelDownload("speaker-embedding"); return; }
    // Explicit choice after the page's privacy and reading instructions. No auto-capture on opening/downloading.
    dashboardController.setConversationCaptureEnabled(true, false, "enrollment");
  }
  onCloseTap(): void {
    this.cancelIfRecording();
    Frame.topmost()?.goBack();
  }
  cancelIfRecording(): void {
    const detector = dashboardController.conversationDetector;
    if (detector.snapshot().enabled && detector.snapshot().participationMode === "enrollment") detector.setEnabled(false);
  }
  dispose(): void { for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe(); }
}
export function navigatingTo(args: EventData): void {
  const page = args.object as Page;
  (page.bindingContext as VoiceProfileViewModel | undefined)?.dispose();
  page.bindingContext = new VoiceProfileViewModel();
}
export function navigatingFrom(args: EventData): void { ((args.object as Page).bindingContext as VoiceProfileViewModel)?.cancelIfRecording(); }
export function unloaded(args: EventData): void { ((args.object as Page).bindingContext as VoiceProfileViewModel)?.dispose(); }
