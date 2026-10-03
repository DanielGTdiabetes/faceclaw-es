import { LocalEnergyVad, type LocalVadSnapshot } from "./local-vad";

/** Local capture + provisional G2 energy VAD; no ASR, identity, storage or network. */
export type DetectorState = "desactivado" | "escuchando" | "suspendido" | "error";
export type DetectorMetrics = {
  chunks: number; samples: number; bytes: number; maxGapMs: number;
  clippedSamples: number; rms: number; preemptions: number; starts: number;
};
export type DetectorSnapshot = {
  enabled: boolean; state: DetectorState; reason: string; epoch: number;
  metrics: DetectorMetrics; vad: LocalVadSnapshot;
  resources: { lease: boolean; timer: boolean; bufferedBytes: number };
};
export type DetectorLease = { stop(): void; diagnostics(): string };
export type DetectorEnvironment = { available: boolean; reason: string; session: unknown };
export type DetectorHost = {
  environment(): DetectorEnvironment;
  prepare(): Promise<boolean>;
  acquire(pcm: (bytes: Uint8Array) => void, revoked: () => void, failed: () => void): DetectorLease | null;
  now(): number;
  every(callback: () => void, ms: number): () => void;
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
  private readonly listeners = new Set<(snapshot: DetectorSnapshot) => void>();

  constructor(private readonly host: DetectorHost) {}

  snapshot(): DetectorSnapshot {
    return { enabled: this.enabled, state: this.state, reason: this.reason, epoch: this.epoch,
      metrics: { ...this.metrics }, vad: this.vad.snapshot(),
      resources: { lease: this.lease !== null, timer: this.cancelTimer !== null, bufferedBytes: 0 } };
  }

  subscribe(listener: (snapshot: DetectorSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  diagnostics(): string { return this.lease?.diagnostics() ?? this.lastDiagnostics; }
  holdsSession(): boolean { return this.preparing || this.lease !== null; }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.cleanup();
    if (!enabled) {
      this.state = "desactivado";
      this.reason = "OFF: concesión, suscripciones y temporizadores retirados.";
      this.emit();
      return;
    }
    this.metrics = emptyMetrics();
    this.vad = new LocalEnergyVad();
    this.lastDiagnostics = "";
    this.enabledAt = this.host.now();
    this.state = "suspendido";
    this.reason = "Preparando captura local. Ensayo limitado a 2 minutos.";
    this.cancelTimer = this.host.every(() => this.refresh(), 500);
    this.refresh();
  }

  /** Availability changes are also delivered synchronously, before transport teardown. */
  refresh(): void {
    if (!this.enabled || this.state === "error") return;
    const now = this.host.now();
    if (now - this.enabledAt >= 120_000) { this.setEnabled(false); return; }
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
      if (this.lastPcm && now - this.lastPcm > 250) this.vad.resetStream();
      if (now - (this.lastPcm || this.startedAt) > 2_000) {
        this.fail("No llega PCM válido desde hace 2 s. Recursos liberados; usa OFF/ON para reintentar.");
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
      if (this.host.now() - this.enabledAt >= 120_000) { this.setEnabled(false); return; }
      this.preparing = false;
      const current = this.host.environment();
      if (!current.available || current.session !== this.session) { this.refresh(); return; }
      if (!ready) { this.fail("La sesión BLE no está lista. Usa OFF/ON para reintentar."); return; }
      this.startedAt = this.host.now();
      this.lastPcm = 0;
      const lease = this.host.acquire(
        (pcm) => this.accept(pcm, epoch),
        () => this.preempt(epoch),
        () => { if (this.epoch === epoch) this.fail("La captura nativa falló. Usa OFF/ON para reintentar."); },
      );
      // A synchronous failure/revocation during acquire cannot resurrect a lease.
      if (epoch !== this.epoch) { lease?.stop(); return; }
      if (!lease) { this.fail("El audio no está libre. Recursos liberados; usa OFF/ON para reintentar."); return; }
      this.lease = lease;
      this.metrics.starts++;
      this.emit();
    }).catch(() => {
      if (epoch === this.epoch) this.fail("No se pudo preparar el audio BLE. Usa OFF/ON para reintentar.");
    });
  }

  private accept(pcm: Uint8Array, epoch: number): void {
    if (epoch !== this.epoch || !this.enabled || this.state === "error") return;
    // Existing LC3 decoder: 5 x 10 ms, 800 samples, mono 16 kHz signed PCM16 LE.
    if (pcm.length !== 1600) { this.fail("Formato PCM inesperado: se requieren 800 muestras / 1600 B por chunk."); return; }
    const now = this.host.now();
    if (now - this.enabledAt >= 120_000) { this.setEnabled(false); return; }
    if (this.lastPcm) this.metrics.maxGapMs = Math.max(this.metrics.maxGapMs, now - this.lastPcm);
    // Never join acoustic candidates across missing delivery or an old stream.
    if (this.lastPcm && now - this.lastPcm > 250) this.vad.resetStream();
    this.lastPcm = now;
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
    this.reason = "VAD local por energía; posible voz no confirma participación. Sin grabación ni envío de audio.";
    // No PCM is retained. UI notification is coalesced by the 500 ms lifecycle tick.
  }

  private preempt(epoch: number): void {
    if (epoch !== this.epoch) return;
    this.metrics.preemptions++;
    this.release();
    this.state = "suspendido";
    this.reason = "Audio cedido a Hey Even, PTT, asistente u otra función.";
    this.emit();
  }

  private fail(reason: string): void {
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
    this.vad.resetStream();
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
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
