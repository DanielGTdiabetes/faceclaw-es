import { Utils } from "@nativescript/core";

declare const com: any;
declare const java: any;

/**
 * Download management for the on-device transcription models (sherpa-onnx
 * offline recognizers). Models are fetched on demand into filesDir rather
 * than bundled in the APK; FaceclawVoiceController reads the files from the
 * directory each model's `dirName` names.
 *
 * Downloadable models, same layout:
 *  - "moonshine": the original on-device option (three files). The model is
 *    no longer bundled in the APK; it is fetched into the same filesDir
 *    location that earlier releases copied the bundled files to, so
 *    upgraded installs that already used on-device transcription need no
 *    download.
 *  - "whisper-base-es": multilingual Whisper base, int8-quantized, with
 *    Spanish transcription configured in AndroidSpeechEngines.kt. The .en
 *    models cannot recognize Spanish. A separate directory prevents reuse of
 *    English-only files from an earlier install. Hashes and sizes below were
 *    computed from freshly downloaded files from the maintainer's HF mirror.
 *  - "whisper-small-es": larger multilingual Whisper for Spanish accuracy,
 *    at the cost of memory and decode time; base remains selectable.
 *  - "whisper-medium-es": experimental larger multilingual model, pinned to
 *    the maintainer revision/LFS hashes. No performance claim until tested.
 *
 * Mirrors the on-phone assistant model flow in llama.ts, except each model
 * here is multiple files rather than one; they download sequentially through
 * FaceclawModelDownloader (resume + pinned sha256 per file).
 */

export type AsrModelId = "moonshine" | "whisper-base-es" | "whisper-small-es" | "whisper-medium-es";

type AsrModelFile = {
  name: string;
  sha256: string;
  sizeBytes: number;
};

type AsrModelDef = {
  label: string;
  dirName: string;
  baseUrl: string;
  files: AsrModelFile[];
  totalBytes: number;
};

export const ASR_MODELS: Record<AsrModelId, AsrModelDef> = {
  moonshine: {
    label: "Moonshine (solo inglés)",
    dirName: "sherpa-onnx-moonshine-base-en-quantized-2026-02-27",
    // Hugging Face mirror of the sherpa-onnx release asset of the same name.
    // The GitHub release only offers a tar.bz2, which the phone can't unpack;
    // this mirror serves the same files (sha256-verified) individually.
    baseUrl:
      "https://huggingface.co/csukuangfj2/sherpa-onnx-moonshine-base-en-quantized-2026-02-27/resolve/main/",
    files: [
      {
        name: "decoder_model_merged.ort",
        sha256: "d9d7b333af34bc552580576ddcf248a1c6c839e0d3b43b09afb9376ed009899d",
        sizeBytes: 109424400,
      },
      {
        name: "encoder_model.ort",
        sha256: "7c66495948d0d08ec1af454cd4b5514862ae6511e94712a60e6d83eaec8dc8cf",
        sizeBytes: 31326816,
      },
      {
        name: "tokens.txt",
        sha256: "2870d843e14c1e187bf1913a521562a63b53933814bd7f2145120468f494a049",
        sizeBytes: 549350,
      },
    ],
    totalBytes: 141300566,
  },
  "whisper-base-es": {
    label: "Whisper base (español, rápido)",
    dirName: "sherpa-onnx-whisper-base-es-int8",
    baseUrl: "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-base/resolve/main/",
    files: [
      {
        name: "base-encoder.int8.onnx",
        sha256: "0b8fb1304b6109976038efff5ace81720e00386f3ff6b54ee8c75291ca0a1e11",
        sizeBytes: 29120534,
      },
      {
        name: "base-decoder.int8.onnx",
        sha256: "9759d217388a01b3a4c7c15533201067b48ae819c4daafc8624e64b9409dc02d",
        sizeBytes: 130672026,
      },
      {
        name: "base-tokens.txt",
        sha256: "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126",
        sizeBytes: 816730,
      },
    ],
    totalBytes: 160609290,
  },
  "whisper-small-es": {
    label: "Whisper small (español, mayor precisión)",
    dirName: "sherpa-onnx-whisper-small-es-int8",
    baseUrl: "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small/resolve/8f3c18b358db4d1f2fc1eae49d75cd20989e4309/",
    files: [
      {
        name: "small-encoder.int8.onnx",
        sha256: "4cbe7b22fa9026b843b60a68640c747de05bafb1a11b57edc0e66c232d9f33a9",
        sizeBytes: 112442483,
      },
      {
        name: "small-decoder.int8.onnx",
        sha256: "acad50b5c782696e91b55914cc5ab4f756f1532f76e22aa6fc615f39fb69a8ee",
        sizeBytes: 262226114,
      },
      {
        name: "small-tokens.txt",
        sha256: "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126",
        sizeBytes: 816730,
      },
    ],
    totalBytes: 375485327,
  },
  "whisper-medium-es": {
    label: "Whisper medium (local, experimental)",
    dirName: "sherpa-onnx-whisper-medium-es-int8",
    // Maintainer LFS SHA-256 metadata at this immutable revision; verified on download/load.
    baseUrl: "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-medium/resolve/8c31d28503847560985df21f90e14f0c736e075e/",
    files: [
      { name: "medium-encoder.int8.onnx", sha256: "1c54582b4d829de0089f6cb63bbbdb3bf7555398bacaf855fbecf1a84dfd193e", sizeBytes: 374196283 },
      { name: "medium-decoder.int8.onnx", sha256: "595d00a338a365a7bfa0ca7f296cabc639583bef770ab6130df90f49a6412747", sizeBytes: 571059257 },
      { name: "medium-tokens.txt", sha256: "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126", sizeBytes: 816730 },
    ],
    totalBytes: 946072270,
  },
};

export type AsrModelState = {
  error?: string;
  status: "absent" | "downloading" | "ready";
  bytesDownloaded: number;
  totalBytes: number;
};

type ModelRuntime = {
  generation: number;
  error: string;
  downloader: any;
  // Bytes of files already fully downloaded in this run, plus progress within
  // the file currently downloading; drives the aggregate percentage.
  completedBytes: number;
  currentFileBytes: number;
  stateListeners: Set<(state: AsrModelState) => void>;
};

function freshRuntime(): ModelRuntime {
  return { generation: 0, error: "", downloader: null, completedBytes: 0, currentFileBytes: 0, stateListeners: new Set() };
}

const runtimes: Record<AsrModelId, ModelRuntime> = {
  moonshine: freshRuntime(),
  "whisper-base-es": freshRuntime(),
  "whisper-small-es": freshRuntime(),
  "whisper-medium-es": freshRuntime(),
};

function modelDirPath(id: AsrModelId): string {
  const context = Utils.android.getApplicationContext();
  return `${context.getFilesDir().getAbsolutePath()}/faceclaw-voice-asr/${ASR_MODELS[id].dirName}`;
}

function filePath(id: AsrModelId, file: AsrModelFile): string {
  return `${modelDirPath(id)}/${file.name}`;
}

function isFilePresent(id: AsrModelId, file: AsrModelFile): boolean {
  try {
    const javaFile = new java.io.File(filePath(id, file));
    return javaFile.exists() && javaFile.length() > 0;
  } catch {
    return false;
  }
}

export function isAsrModelReady(id: AsrModelId): boolean {
  if (!global.isAndroid) return false;
  return ASR_MODELS[id].files.every((file) => isFilePresent(id, file));
}

export function asrModelState(id: AsrModelId): AsrModelState {
  const runtime = runtimes[id];
  const totalBytes = ASR_MODELS[id].totalBytes;
  if (runtime.downloader) {
    return {
      status: "downloading",
      bytesDownloaded: runtime.completedBytes + runtime.currentFileBytes,
      totalBytes,
    };
  }
  return {
    status: isAsrModelReady(id) ? "ready" : "absent",
    ...(runtime.error ? { error: runtime.error } : {}),
    bytesDownloaded: 0,
    totalBytes,
  };
}

/**
 * With an explicit selection, report that model only. The no-argument legacy helper
 * remains for diagnostic callers; actual conversation decoding never substitutes weights.
 */
export function conversationTextModelStatus(selected?: AsrModelId): AsrModelState["status"] {
  if (selected) return asrModelState(selected).status;
  const small = asrModelState("whisper-small-es");
  const base = asrModelState("whisper-base-es");
  if (small.status === "ready" || base.status === "ready") return "ready";
  return small.status === "downloading" || base.status === "downloading" ? "downloading" : "absent";
}

/** Short label for the options menu describing the precise model. */
export function preciseTextModelLabel(): string {
  const small = asrModelState("whisper-small-es");
  if (small.status === "downloading") return `Modelo preciso (small): ${Math.floor(small.bytesDownloaded * 100 / small.totalBytes)} %`;
  return small.status === "ready" ? "Whisper small: descargado" : "Whisper small: descargar 375 MB";
}

export function onAsrModelStateChanged(id: AsrModelId, listener: (state: AsrModelState) => void): () => void {
  const runtime = runtimes[id];
  runtime.stateListeners.add(listener);
  return () => runtime.stateListeners.delete(listener);
}

function notifyStateChanged(id: AsrModelId): void {
  const state = asrModelState(id);
  runtimes[id].stateListeners.forEach((listener) => listener(state));
}

export function startAsrModelDownload(id: AsrModelId): void {
  const runtime = runtimes[id];
  if (!global.isAndroid || runtime.downloader || isAsrModelReady(id)) return;
  runtime.error = "";
  runtime.completedBytes = ASR_MODELS[id].files
    .filter((file) => isFilePresent(id, file))
    .reduce((sum, f) => sum + f.sizeBytes, 0);
  downloadNextFile(id, ++runtime.generation);
  notifyStateChanged(id);
}

function downloadNextFile(id: AsrModelId, generation: number): void {
  const runtime = runtimes[id];
  const def = ASR_MODELS[id];
  const nextFile = def.files.find((file) => !isFilePresent(id, file));
  if (!nextFile) {
    runtime.downloader = null;
    notifyStateChanged(id);
    return;
  }
  runtime.currentFileBytes = 0;
  const listener = new com.faceclaw.app.FaceclawModelDownloaderListener({
    onProgress: (bytes: number, _total: number) => {
      if (generation !== runtime.generation) return;
      runtime.currentFileBytes = Number(bytes);
      notifyStateChanged(id);
    },
    onDone: () => {
      if (generation !== runtime.generation) return;
      runtime.completedBytes += nextFile.sizeBytes;
      runtime.currentFileBytes = 0;
      downloadNextFile(id, generation);
    },
    onError: (message: string) => {
      if (generation !== runtime.generation) return;
      runtime.error = "No se pudo descargar. Revisa la conexión y el espacio libre; puedes reintentar.";
      console.error(`Voice model download failed (${id}/${nextFile.name}): ${message}`);
      runtime.downloader = null;
      notifyStateChanged(id);
    },
  });
  runtime.downloader = new com.faceclaw.app.FaceclawModelDownloader(
    `${def.baseUrl}${nextFile.name}`,
    filePath(id, nextFile),
    nextFile.sha256,
    nextFile.sizeBytes,
    listener,
  );
  runtime.downloader.start();
}

/** Stops the download; already-fetched bytes are kept and resumed next time. */
export function cancelAsrModelDownload(id: AsrModelId): void {
  const runtime = runtimes[id];
  if (!runtime.downloader) return;
  runtime.generation++;
  runtime.downloader.cancel();
  runtime.downloader = null;
  notifyStateChanged(id);
}

export function deleteAsrModel(id: AsrModelId): void {
  if (!global.isAndroid) return;
  cancelAsrModelDownload(id);
  try {
    for (const file of ASR_MODELS[id].files) {
      new java.io.File(filePath(id, file)).delete();
      new java.io.File(`${filePath(id, file)}.part`).delete();
    }
    new java.io.File(modelDirPath(id)).delete();
  } catch (error) {
    console.error(`Voice model delete failed (${id}): ${String(error)}`);
  }
  notifyStateChanged(id);
}
