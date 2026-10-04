import { LocalEnergyVad, type LocalVadSnapshot } from "./local-vad";
import { type DetectorTranscription, type LocalTranscriptionSnapshot, type TextLanguage } from "./transcription";
import { PhaseDiagnostics, type DiagnosticPhase, type PhaseDiagnosticsSnapshot } from "./phase-diagnostics";
import { type DetectorParticipation, type LocalParticipationSnapshot, type ParticipationMode } from "./participation";

/** Local capture, optional own-profile comparison and ASR; no network or assistant actions. */
export type DetectorState = "desactivado" | "escuchando" | "suspendido" | "error";
export type DetectorMetrics = {
  chunks: number; samples: number; bytes: number; maxGapMs: number;
  clippedSamples: number; rms: number; preemptions: number; starts: number;
};
export type DetectorSnapshot = {
  enabled: boolean; state: DetectorState; reason: string; epoch: number;
  metrics: DetectorMetrics; vad: LocalVadSnapshot;
  resources: { lease: boolean; timer: boolean; bufferedBytes: number };
  transcription?: LocalTranscriptionSnapshot;
  participation?: LocalParticipationSnapshot;
  participationMode: ParticipationMode;
  /** Language frozen for the last session that used ASR; kept after OFF until the next ON. */
  languageMode?: TextLanguage;
  /** C1 acoustics per user-marked phase; present only when diagnostics were chosen before ON. */
  phases?: PhaseDiagnosticsSnapshot;
  enrollmentOutcome: "none" | "saved" | "canceled" | "expired" | "error";
  stopReason: "none" | "manual" | "expired" | "saved" | "error";
  remainingMs: number;
};
/** RAM-only choices made while OFF and frozen for the session. */
export type SessionOptions = { language?: TextLanguage; diagnostics?: boolean };
export type DetectorLease = { stop(): void; diagnostics(): string };
export type DetectorEnvironment = { available: boolean; reason: string; session: unknown };
export type DetectorHost = {
  environment(): DetectorEnvironment;
  prepare(): Promise<boolean>;
  acquire(pcm: (bytes: Uint8Array) => void, revoked: () => void, failed: () => void): DetectorLease | null;
  now(): number;
  every(callback: () => void, ms: number): () => void;
  transcription?: DetectorTranscription;
  participation?: DetectorParticipation;
};

const emptyMetrics = (): DetectorMetrics => ({
  chunks: 0, samples: 0, bytes: 0, maxGapMs: 0, clippedSamples: 0, rms: 0, preemptions: 0, starts: 0,
});

export class ConversationCaptureCoordinator {
  private enabled = false;
  private state: DetectorState = "desactivado";
  private reason = "G2: VAD local provisional, sin detección de participación.";
  private epoch = 0;
  private metrics = emptyMetrics();
  private vad = new LocalEnergyVad();
  private lease: DetectorLease | null = null;
  private cancelTimer: (() => void) | null = null;
  private preparing = false;
  private session: unknown = null;
  private lastPcm = 0;
  private startedAt = 0;
  private enabledAt = 0;
  private lastDiagnostics = "";
  private transcribing = false;
  private language: TextLanguage | null = null;
  private phases: PhaseDiagnostics | null = null;
  private gapCounted = false;
  private participationMode: ParticipationMode = "off";
  private enrollmentOutcome: DetectorSnapshot["enrollmentOutcome"] = "none";
  private stopReason: DetectorSnapshot["stopReason"] = "none";
  private readonly listeners = new Set<(snapshot: DetectorSnapshot) => void>();

  constructor(private readonly host: DetectorHost) {}

  snapshot(): DetectorSnapshot {
    return { enabled: this.enabled, state: this.state, reason: this.reason, epoch: this.epoch,
      metrics: { ...this.metrics }, vad: this.vad.snapshot(), participationMode: this.participationMode,
      enrollmentOutcome: this.enrollmentOutcome,
      ...(this.language ? { languageMode: this.language } : {}),
      ...(this.phases ? { phases: this.phases.snapshot() } : {}),
      stopReason: this.stopReason,
      remainingMs: this.enabled ? Math.max(0, 120_000 - (this.host.now() - this.enabledAt)) : 0,
      resources: { lease: this.lease !== null, timer: this.cancelTimer !== null, bufferedBytes: 0 },
      ...(this.host.transcription ? { transcription: this.host.transcription.snapshot() } : {}),
      ...(this.host.participation ? { participation: this.host.participation.snapshot() } : {}) };
  }

  subscribe(listener: (snapshot: DetectorSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  diagnostics(): string { return this.lease?.diagnostics() ?? this.lastDiagnostics; }
  holdsSession(): boolean { return this.preparing || this.lease !== null; }

  transcriptText(): string { return this.host.transcription?.text() ?? ""; }
  hasOwnProfile(): boolean { return this.host.participation?.hasProfile() ?? false; }
  ownProfileState(): string {
    return this.host.participation?.profileState?.() ?? (this.hasOwnProfile() ? "guardado" : "sin perfil");
  }
  deleteOwnProfile(): boolean { this.setEnabled(false); return this.host.participation?.deleteProfile() ?? false; }

  /**
   * Diagnostic mark from an explicit user control. Same thread as PCM delivery: the mark applies to
   * the next chunk in both the acoustic accumulator and the native ASR session. Not a speaker label.
   */
  markPhase(phase: DiagnosticPhase): boolean {
    if (!this.enabled || !this.phases || !this.phases.mark(phase)) return false;
    this.host.transcription?.setPhase?.(this.phases.index());
    this.emit();
    return true;
  }

  /** Original native array, after accept() validated PCM/epoch/expiry; avoids a second JS copy. */
  acceptNativePcm(pcm: unknown): void {
    if (this.enabled && this.lease && this.state === "escuchando") {
      const state = this.vad.snapshot().state;
      if (this.transcribing) this.host.transcription?.acceptNative(pcm, state);
      if (this.participationMode !== "off") this.host.participation?.acceptNative(pcm, state);
    }
  }

  setEnabled(enabled: boolean, transcribe = false, participation: ParticipationMode = "off", options: SessionOptions = {}): void {
    if (this.enabled === enabled) return;
    if (!enabled && this.participationMode === "enrollment" && this.enrollmentOutcome === "none") this.enrollmentOutcome = "canceled";
    if (enabled && participation === "enrollment") this.enrollmentOutcome = "none";
    this.enabled = enabled;
    this.stopReason = enabled ? "none" : "manual";
    this.cleanup();
    this.transcribing = enabled && transcribe && participation !== "enrollment";
    this.participationMode = enabled ? participation : "off";
    if (!enabled) {
      this.state = "desactivado";
      this.reason = "OFF: concesión, suscripciones y temporizadores retirados.";
      this.emit();
      return;
    }
    this.metrics = emptyMetrics();
    this.enabledAt = this.host.now();
    this.vad = new LocalEnergyVad();
    this.lastDiagnostics = "";
    this.gapCounted = false;
    this.language = this.transcribing ? (options.language === "es" ? "es" : "auto") : null;
    this.phases = options.diagnostics ? new PhaseDiagnostics(() => this.host.now()) : null;
    this.vad.setObserver(this.phases);
    if (this.participationMode !== "off" && !this.host.participation?.start(this.participationMode === "enrollment")) {
      this.fail("El perfil local no está disponible. Revisa el modelo de voz o espera al cierre anterior.");
      return;
    }
    if (this.transcribing && !this.host.transcription?.start(this.language ?? "auto")) {
      this.fail("Transcripción local no disponible. Revisa el modelo Whisper base local o espera al cierre anterior.");
      return;
    }
    this.state = "suspendido";
    this.reason = "Preparando captura local. Ensayo limitado a 2 minutos.";
    this.cancelTimer = this.host.every(() => this.refresh(), 500);
    this.refresh();
  }

  /** Availability changes are also delivered synchronously, before transport teardown. */
  refresh(): void {
    if (!this.enabled || this.state === "error") return;
    const now = this.host.now();
    if (now - this.enabledAt >= 120_000) {
      this.expire(); return;
    }
    if (this.participationMode !== "off") {
      const participation = this.host.participation?.snapshot();
      if (this.participationMode === "enrollment" && participation?.profileSaved) {
        this.enrollmentOutcome = "saved";
        this.setEnabled(false);
        this.stopReason = "saved";
        this.reason = "OFF · Mi perfil se ha guardado localmente. Ya puedes iniciar conversación.";
        this.emit();
        return;
      }
      if (!participation || ["error", "modelo no disponible", "sin perfil compatible"].includes(participation.status)) {
        this.fail("No se puede usar el perfil local. Revisa Mi perfil en Opciones; recursos liberados.");
        return;
      }
      if (participation.status === "cargando") {
        this.reason = "Preparando mi voz local; captura todavía suspendida.";
        this.emit();
        return;
      }
    }
    if (this.transcribing) {
      const status = this.host.transcription?.snapshot().status ?? "error";
      if (["error", "modelo no disponible"].includes(status)) {
        this.fail("El motor de texto local no está disponible. Captura OFF, sin alternativa en red.");
        return;
      }
      if (status === "cargando") {
        this.reason = "Preparando texto local; captura todavía suspendida.";
        this.emit();
        return;
      }
    }
    const env = this.host.environment();
    if (!env.available) {
      this.release();
      this.state = "suspendido";
      this.reason = env.reason;
      this.emit();
      return;
    }
    if (this.session !== null && this.session !== env.session) this.release();
    if (this.lease) {
      if (this.lastPcm && now - this.lastPcm > 250) { this.countGap(); this.resetAcousticStream(); }
      if (now - (this.lastPcm || this.startedAt) > 2_000) {
        this.fail("No llega PCM válido desde hace 2 s. Captura OFF; puedes reintentar cuando termine el cierre.");
      } else {
        this.emit();
      }
      return;
    }
    if (this.preparing) return;
    this.preparing = true;
    this.session = env.session;
    const epoch = ++this.epoch;
    this.state = "suspendido";
    this.reason = "Preparando sesión de audio; esperando el primer PCM válido.";
    this.emit();
    void this.host.prepare().then((ready) => {
      if (epoch !== this.epoch || !this.enabled) return;
      if (this.host.now() - this.enabledAt >= 120_000) { this.expire(); return; }
      this.preparing = false;
      const current = this.host.environment();
      if (!current.available || current.session !== this.session) { this.refresh(); return; }
      if (!ready) { this.fail("La sesión BLE no está lista. Captura OFF; puedes reintentar."); return; }
      this.startedAt = this.host.now();
      this.lastPcm = 0;
      const lease = this.host.acquire(
        (pcm) => this.accept(pcm, epoch),
        () => this.preempt(epoch),
        () => { if (this.epoch === epoch) this.fail("La captura nativa falló. Captura OFF; puedes reintentar."); },
      );
      // A synchronous failure/revocation during acquire cannot resurrect a lease.
      if (epoch !== this.epoch) { lease?.stop(); return; }
      if (!lease) { this.fail("El audio no está libre. Captura OFF; puedes reintentar."); return; }
      this.lease = lease;
      this.metrics.starts++;
      this.emit();
    }).catch(() => {
      if (epoch === this.epoch) this.fail("No se pudo preparar el audio BLE. Captura OFF; puedes reintentar.");
    });
  }

  private accept(pcm: Uint8Array, epoch: number): void {
    if (epoch !== this.epoch || !this.enabled || this.state === "error") return;
    // Existing LC3 decoder: 5 x 10 ms, 800 samples, mono 16 kHz signed PCM16 LE.
    if (pcm.length !== 1600) { this.fail("Formato PCM inesperado: se requieren 800 muestras / 1600 B por chunk."); return; }
    const now = this.host.now();
    if (now - this.enabledAt >= 120_000) { this.expire(); return; }
    if (this.lastPcm) this.metrics.maxGapMs = Math.max(this.metrics.maxGapMs, now - this.lastPcm);
    // Never join acoustic candidates across missing delivery or an old stream.
    if (this.lastPcm && now - this.lastPcm > 250) { this.countGap(); this.resetAcousticStream(); }
    this.lastPcm = now;
    this.gapCounted = false;
    this.phases?.chunk();
    let sum = 0;
    for (let i = 0; i < pcm.length; i += 2) {
      const unsigned = pcm[i]! | (pcm[i + 1]! << 8);
      const value = unsigned >= 32768 ? unsigned - 65536 : unsigned;
      sum += value * value;
      if (Math.abs(value) >= 32760) this.metrics.clippedSamples++;
    }
    this.metrics.rms = Math.sqrt(sum / 800) / 32768;
    this.metrics.chunks++;
    this.metrics.samples += 800;
    this.metrics.bytes += pcm.length;
    this.vad.accept(pcm);
    this.state = "escuchando";
    this.reason = this.participationMode === "enrollment"
      ? "Registro guiado: lee la frase visible cuando indique Habla ahora. OFF cancela."
      : this.participationMode === "conversation"
      ? `Comparación de mi voz y turnos provisionales; ${this.transcribing ? "texto local temporal" : "sin transcripción"}.`
      : this.transcribing
      ? "VAD y transcripción local provisionales. Sin grabación ni envío de audio; no confirma participación."
      : "VAD local por energía; posible voz no confirma participación. Sin grabación ni envío de audio.";
    // No PCM is retained. UI notification is coalesced by the 500 ms lifecycle tick.
  }

  private preempt(epoch: number): void {
    if (epoch !== this.epoch) return;
    this.metrics.preemptions++;
    this.phases?.preemption();
    this.release();
    this.state = "suspendido";
    this.reason = "Audio cedido a Hey Even, PTT, asistente u otra función.";
    this.emit();
  }

  private expire(): void {
    if (this.participationMode === "enrollment") this.enrollmentOutcome = "expired";
    this.setEnabled(false);
    this.stopReason = "expired";
    this.reason = "OFF · Tiempo agotado (2 min). La sesión ha terminado; puedes iniciar otra.";
    this.emit();
  }

  private fail(reason: string): void {
    if (this.participationMode === "enrollment") this.enrollmentOutcome = "error";
    this.enabled = false;
    this.transcribing = false;
    this.participationMode = "off";
    this.stopReason = "error";
    this.cleanup();
    this.state = "error";
    this.reason = reason;
    this.emit();
  }

  private release(): void {
    ++this.epoch; // Revoke delivery before native STOP and its queued callbacks.
    this.preparing = false;
    this.session = null;
    this.lastPcm = 0;
    this.resetAcousticStream();
    const lease = this.lease;
    this.lease = null;
    if (lease) {
      try { this.lastDiagnostics = lease.diagnostics(); } catch { this.lastDiagnostics = "Diagnóstico no disponible."; }
      lease.stop();
    }
  }

  private cleanup(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.release();
    this.host.transcription?.stop();
    this.host.participation?.stop();
    // After the acoustic reset above, so a pending candidate is settled as interrupted.
    this.phases?.stop();
  }

  /** One gap counts once, whether the 500 ms tick or the next PCM chunk notices it first. */
  private countGap(): void {
    if (this.gapCounted) return;
    this.gapCounted = true;
    this.phases?.gapReset();
  }

  private resetAcousticStream(): void {
    this.vad.resetStream();
    this.host.transcription?.resetStream();
    this.host.participation?.resetStream();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
