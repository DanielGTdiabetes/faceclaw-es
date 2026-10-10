import { Utils } from "@nativescript/core";
import { assistantAudioPriority } from "../assistant/audio-priority";
import { GatekeeperEngine, GATEKEEPER_GRAMMAR, gatekeeperPrompt, parseGatekeeperDecision,
  type GatekeeperInput, type GatekeeperProvider, type GatekeeperOptions, type GatekeeperHost } from "../conversation-detection/gatekeeper";
import { gatekeeperModel, type GatekeeperModelId } from "../conversation-detection/gatekeeper-models";

declare const com: any;
declare const java: any;
type Download = { native: any; bytes: number; error: boolean };
const downloads = new Map<GatekeeperModelId, Download>();
const listeners = new Set<() => void>();
const changed = () => { for (const listener of listeners) listener(); };
function modelPath(id: GatekeeperModelId): string {
  const context = Utils.android.getApplicationContext();
  const directory = context.getExternalFilesDir("gatekeeper") ?? context.getFilesDir();
  return `${directory.getAbsolutePath()}/${gatekeeperModel(id).fileName}`;
}
export function gatekeeperModelReady(id: GatekeeperModelId): boolean {
  if (!global.isAndroid) return false;
  try { const f = new java.io.File(modelPath(id)); return f.isFile() && Number(f.length()) === gatekeeperModel(id).sizeBytes; }
  catch { return false; }
}
export function gatekeeperDownloadState(id: GatekeeperModelId) {
  const download = downloads.get(id);
  return { downloading: !!download?.native, bytes: download?.bytes ?? 0, total: gatekeeperModel(id).sizeBytes,
    ready: gatekeeperModelReady(id), error: download?.error ?? false };
}
export function onGatekeeperDownloadChanged(listener: () => void): () => void {
  listeners.add(listener); return () => listeners.delete(listener);
}
/** Explicit OFF-only UI action owns authorization to fetch weights; no download at startup/ON. */
export function startGatekeeperDownload(id: GatekeeperModelId): void {
  if (!global.isAndroid || downloads.get(id)?.native || gatekeeperModelReady(id)) return;
  const model = gatekeeperModel(id), entry: Download = { native: null, bytes: 0, error: false };
  const listener = new com.faceclaw.app.FaceclawModelDownloaderListener({
    onProgress(bytes: number) { if (downloads.get(id) === entry) { entry.bytes = Number(bytes); changed(); } },
    onDone() { if (downloads.get(id) === entry) { entry.native = null; changed(); } },
    onError() { if (downloads.get(id) === entry) { entry.native = null; entry.error = true; changed(); } },
  });
  entry.native = new com.faceclaw.app.FaceclawModelDownloader(
    `https://huggingface.co/${model.repository}/resolve/main/${model.fileName}?download=true`,
    modelPath(id), model.sha256, model.sizeBytes, listener);
  downloads.set(id, entry); entry.native.start(); changed();
}
export function cancelGatekeeperDownload(id: GatekeeperModelId): void {
  const entry = downloads.get(id);
  if (!entry?.native) return;
  downloads.delete(id); entry.native.cancel(); changed();
}

class NativeGatekeeper implements GatekeeperProvider {
  private runner: any = null;
  private disposed = false;
  private samples = 0;
  private processCpuMsDuringCalls = 0;
  private maxProcessPssKb: number | null = null;
  private maxBatteryTemperatureC: number | null = null;
  private maxThermalStatus: number | null = null;
  constructor(private readonly modelId: GatekeeperModelId) {}
  isLoaded(): boolean { return !!this.runner?.isModelLoaded(); }
  unload(): void { this.disposed = true; this.runner?.unload(); this.runner = null; }
  diagnostics() {
    return { model: this.modelId, samples: this.samples, processCpuMsDuringCalls: this.processCpuMsDuringCalls,
      maxProcessPssKb: this.maxProcessPssKb, maxBatteryTemperatureC: this.maxBatteryTemperatureC,
      maxThermalStatus: this.maxThermalStatus };
  }
  classify(input: GatekeeperInput, done: (json: string | null) => void): () => void {
    if (this.disposed || assistantAudioPriority.isActive() || !gatekeeperModelReady(this.modelId)) { done(null); return () => {}; }
    this.runner ??= new com.faceclaw.app.FaceclawGatekeeperRunner();
    const runner = this.runner;
    let settled = false, json = "";
    const cpuAt = Number(android.os.Process.getElapsedCpuTime());
    const finish = (ok: boolean, notify = true) => {
      if (settled) return;
      settled = true; this.samples++;
      this.processCpuMsDuringCalls += Math.max(0, Number(android.os.Process.getElapsedCpuTime()) - cpuAt);
      try {
        this.maxProcessPssKb = Math.max(this.maxProcessPssKb ?? 0, Number(android.os.Debug.getPss()));
        const context = Utils.android.getApplicationContext();
        const battery = context.registerReceiver(null, new android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED));
        const temperature = Number(battery?.getIntExtra(android.os.BatteryManager.EXTRA_TEMPERATURE, -1));
        if (Number.isFinite(temperature) && temperature >= 0) this.maxBatteryTemperatureC = Math.max(this.maxBatteryTemperatureC ?? 0, temperature / 10);
        const power = context.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager;
        if (android.os.Build.VERSION.SDK_INT >= 29) this.maxThermalStatus = Math.max(this.maxThermalStatus ?? 0, power.getCurrentThermalStatus());
      } catch { /* Unsupported telemetry stays unknown, never fabricated as zero. */ }
      if (notify) done(ok ? json : null);
      json = "";
    };
    const listener = new com.faceclaw.app.FaceclawLlamaListener({
      onToken(token: string) {
        if (settled) return;
        json += token;
        if (json.length > 256) { runner.cancel(); finish(false); }
        else if (parseGatekeeperDecision(json)) { runner.cancel(); finish(true); }
      },
      onDone(reason: string) { finish(reason !== "cancelled" && reason !== "length"); },
      onError() { finish(false); },
    });
    try { runner.generate(modelPath(this.modelId), 4096, 1,
      gatekeeperPrompt(input, gatekeeperModel(this.modelId).template), GATEKEEPER_GRAMMAR, 64, listener); }
    catch { finish(false); }
    return () => { if (!settled) { runner.cancel(); finish(false, false); } };
  }
}

/** Same native path for the explicit synthetic replay; no separate model implementation. */
export function createGatekeeperProvider(model: GatekeeperModelId): GatekeeperProvider {
  return new NativeGatekeeper(model);
}

/** Export contains synthetic IDs/predictions/aggregate resources only, never speech or settings. */
export function saveGatekeeperBenchmark(model: GatekeeperModelId, report: { rows: object[] }): void {
  const directory = Utils.android.getApplicationContext().getExternalFilesDir("gatekeeper");
  const write = (name: string, value: string) => {
    const writer = new java.io.OutputStreamWriter(new java.io.FileOutputStream(new java.io.File(directory, name)), "UTF-8");
    try { writer.write(value); } finally { writer.close(); }
  };
  write(`benchmark-${model}.jsonl`, report.rows.map(row => JSON.stringify(row)).join("\n") + "\n");
  write(`benchmark-${model}-report.json`, JSON.stringify(report));
}

/** Models stay resident during opt-in only. CPU priority/cancellation is owned by the native worker. */
export function createNativeGatekeeper(model: GatekeeperModelId, options: Partial<GatekeeperOptions>, onChanged: () => void,
  sampleAsr?: GatekeeperHost["sampleAsr"]): GatekeeperEngine | null {
  if (options.mode === "off" || !global.isAndroid) return null;
  return new GatekeeperEngine(new NativeGatekeeper(model), {
    now: () => Number(android.os.SystemClock.elapsedRealtime()), changed: onChanged, sampleAsr,
    after: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); },
    priorityActive: () => assistantAudioPriority.isActive(), subscribePriority: callback => assistantAudioPriority.subscribe(callback),
  }, options);
}
