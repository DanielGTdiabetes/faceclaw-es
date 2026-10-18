import { ASR_MODELS, asrModelState, type AsrModelState } from "./asr-model";
import { conversationEvoEndpoint, conversationModel, EVO_CONVERSATION_MODEL, type ConversationModel } from "../conversation-detection/session-controls";

/**
 * Readiness of a non-Soniox conversation engine. Whisper models report their downloaded weights; the EVO-X2
 * engine has nothing to download and is ready once the Hey Even "even" address and key are configured.
 */
export function conversationModelState(model: Exclude<ConversationModel, "soniox">): AsrModelState {
  if (model !== EVO_CONVERSATION_MODEL) return asrModelState(model);
  return conversationEvoEndpoint()
    ? { status: "ready", bytesDownloaded: 0, totalBytes: 0 }
    : { status: "absent", error: "Configura la dirección y la clave del EVO-X2 en Ajustes > Voz.", bytesDownloaded: 0, totalBytes: 0 };
}

export function conversationModelLabel(model: ConversationModel = conversationModel()): string {
  if (model === "soniox") return "Soniox · nube · separa voces";
  if (model === EVO_CONVERSATION_MODEL) return "Parakeet · EVO-X2 · voces opcionales";
  const name = model === "whisper-base-es" ? "Whisper base" : model === "whisper-small-es" ? "Whisper small" : "Whisper medium";
  return `${name} · local · voces opcionales${model === "whisper-medium-es" ? " · experimental" : ""}`;
}
export function conversationModelOption(model: ConversationModel): string {
  const selected = conversationModel() === model ? "✓ " : "";
  if (model === "soniox") return selected + conversationModelLabel(model);
  const state = conversationModelState(model);
  if (model === EVO_CONVERSATION_MODEL) return `${selected}${conversationModelLabel(model)} · ${state.status === "ready" ? "configurado" : "sin configurar"}`;
  const status = state.status === "ready" ? "descargado" : state.status === "downloading"
    ? `${Math.floor(state.bytesDownloaded * 100 / state.totalBytes)} %` : `${Math.ceil(ASR_MODELS[model].totalBytes / 1_000_000)} MB por descargar`;
  return `${selected}${conversationModelLabel(model)} · ${status}`;
}
