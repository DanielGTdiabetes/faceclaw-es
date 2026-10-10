import { ASR_MODELS, asrModelState } from "./asr-model";
import { conversationModel, type ConversationModel } from "../conversation-detection/session-controls";

export function conversationModelLabel(model: ConversationModel = conversationModel()): string {
  if (model === "soniox") return "Soniox · nube · separa voces";
  const name = model === "whisper-base-es" ? "Whisper base" : model === "whisper-small-es" ? "Whisper small" : "Whisper medium";
  return `${name} · local · voces opcionales${model === "whisper-medium-es" ? " · experimental" : ""}`;
}
export function conversationModelOption(model: ConversationModel): string {
  const selected = conversationModel() === model ? "✓ " : "";
  if (model === "soniox") return selected + conversationModelLabel(model);
  const state = asrModelState(model);
  const status = state.status === "ready" ? "descargado" : state.status === "downloading"
    ? `${Math.floor(state.bytesDownloaded * 100 / state.totalBytes)} %` : `${Math.ceil(ASR_MODELS[model].totalBytes / 1_000_000)} MB por descargar`;
  return `${selected}${conversationModelLabel(model)} · ${status}`;
}
