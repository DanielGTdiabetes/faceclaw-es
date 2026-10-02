import { voiceControlBridge } from "../../native/voice-control";
import { voiceActivity } from "../../ui/shell/voice-activity";
import type { LayerActions } from "../../ui/layers";

/** One hold/release cycle. Async startup and trailing cloud finals belong to this cycle only. */
export class VoiceDraft {
  phase: "idle" | "preparing" | "listening" | "finishing" = "idle";
  text = "";
  status = "";
  private committed = "";
  private live = "";
  private generation = 0;
  private started = false;
  private ownsVoiceActivity = false;
  private starting = false;
  private unsubscribe: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly actions: Pick<LayerActions, "startVoiceCapture" | "stopVoiceCapture">,
    private readonly prepare: () => Promise<boolean>,
    private readonly changed: () => void,
    private readonly send: (text: string) => void,
  ) {}

  get active(): boolean { return this.phase !== "idle" || this.starting; }

  keepModelLoaded(enabled: boolean): void {
    voiceControlBridge.setKeepTranscriberLoaded(enabled);
  }

  async start(): Promise<void> {
    if (this.active) return;
    const generation = ++this.generation;
    this.text = this.committed = this.live = "";
    this.phase = "preparing";
    this.status = "Preparando micrófono... espera";
    this.changed();
    try {
      const ready = await this.prepare();
      if (generation !== this.generation) return;
      if (!ready) { this.cancel("Micrófono no disponible"); return; }
      // Starting capture schedules native model loading. Only the bridge's
      // listening event means the microphone is actually ready for speech.
      this.ownsVoiceActivity = true;
      voiceActivity.setActive(true);
      this.unsubscribe.push(voiceControlBridge.onTranscript((event) => {
        if (!this.active || generation !== this.generation) return;
        if (event.isFinal) {
          const text = event.text.trim();
          if (text) this.committed = [this.committed, text].filter(Boolean).join(" ");
          this.live = "";
        } else this.live = event.text.trim();
        this.text = [this.committed, this.live].filter(Boolean).join(" ");
        if (event.isFinal && this.phase === "finishing") this.finish();
        else this.changed();
      }));
      // onStatus immediately replays the previous capture's status.
      let subscribed = false;
      this.unsubscribe.push(voiceControlBridge.onStatus(({ status, listening }) => {
        if (!subscribed) return;
        if (generation !== this.generation || !this.active) return;
        if (/ignored|failed|error|denied|could not|not downloaded|needs an active/i.test(status)) {
          this.cancel(status);
          return;
        }
        if (this.phase === "finishing") return;
        if (listening) {
          this.phase = "listening";
          this.status = "Escuchando... suelta para enviar";
        } else {
          this.status = /loading.*model/i.test(status)
            ? "Cargando modelo de voz... espera"
            : "Preparando micrófono... espera";
        }
        this.changed();
      }));
      subscribed = true;
      if (generation !== this.generation) return;
      this.starting = true;
      this.changed();
      await this.actions.startVoiceCapture();
      this.starting = false;
      if (generation !== this.generation) {
        await this.actions.stopVoiceCapture();
        this.changed();
        return;
      }
      this.started = true;
      if (this.isFinishing()) this.stopAndFinalize();
    } catch (error) {
      this.starting = false;
      if (generation === this.generation) this.cancel(`Micrófono: ${String(error)}`);
    }
  }

  private isFinishing(): boolean { return this.phase === "finishing"; }

  release(): void {
    if (this.phase === "preparing") {
      this.cancel("Espera a «Escuchando» antes de hablar y soltar");
      return;
    }
    if (this.phase !== "listening") return;
    this.phase = "finishing";
    this.status = "Transcribiendo... espera";
    this.changed();
    if (!this.starting) this.stopAndFinalize();
  }

  private stopAndFinalize(): void {
    const generation = this.generation;
    const afterStop = () => {
      if (generation !== this.generation || !this.isFinishing()) return;
      this.timer = setTimeout(() => this.finish(), 1500);
    };
    if (this.started) {
      this.started = false;
      // Native recognition can take longer than the synchronous stop join.
      // Its final callback may finish the draft before this promise resolves.
      const stopped = this.actions.stopVoiceCapture();
      if (!stopped) { afterStop(); return; }
      void stopped.then(afterStop, (error) => {
        if (generation === this.generation) this.cancel(String(error));
      });
    } else {
      afterStop();
    }
  }

  private finish(): void {
    if (this.phase !== "finishing") return;
    const text = this.text.trim();
    this.cancel(text ? "" : "No se detectó voz. Mantén pulsado y habla al ver «Escuchando»");
    if (text) this.send(text);
  }

  cancel(status = ""): void {
    ++this.generation;
    this.phase = "idle";
    this.status = status;
    this.text = this.live = this.committed = "";
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
    if (this.started) {
      this.started = false;
      void Promise.resolve(this.actions.stopVoiceCapture()).catch(() => {});
    }
    if (this.ownsVoiceActivity) {
      this.ownsVoiceActivity = false;
      voiceActivity.setActive(false);
    }
    this.changed();
  }
}
