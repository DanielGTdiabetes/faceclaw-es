import { type DetectorSnapshot } from "./coordinator";
import { type TextLanguage } from "./transcription";
import { WEARER_PHRASE, type IdentityOutcome } from "./wearer-identity";

/** Forced Spanish is always shown as forced: never as a detected language or with a confidence. */
export function textLanguageLabel(language: TextLanguage | undefined): string {
  return language === "es" ? "castellano (forzado)" : "es/valencià";
}

/** Session-only choices. Readiness checks never download weights or replace a profile. */
export function conversationStartPlan(snapshot: DetectorSnapshot, profile: string,
  voiceModel: string, textModel: string, withText: boolean, language: TextLanguage = "es") {
  const mode = profile === "guardado" ? "conversation" as const : "off" as const;
  const base = { transcribe: withText, mode };
  const blocked = (button: string, hint: string) => ({ ...base, canStart: false, button, hint });
  if (snapshot.enabled) return blocked("Detener (OFF)", snapshot.reason);
  if (snapshot.participation?.worker || snapshot.participation?.busy || snapshot.transcription?.worker || snapshot.transcription?.busy) {
    return blocked("Cerrando motores locales…", "Captura OFF. Espera a que termine el trabajo local anterior; el perfil se conserva.");
  }
  if (!["guardado", "sin perfil"].includes(profile)) {
    return blocked("Revisar Mi perfil", "No se pudo consultar Mi perfil. No se iniciará una sesión sin comparación como alternativa automática.");
  }
  if (mode === "conversation" && voiceModel !== "ready") {
    return blocked("Modelo de mi voz no disponible", "El perfil está guardado, pero falta el modelo local de comparación. Revisa Mi perfil; no repitas su registro.");
  }
  if (withText && textModel !== "ready") {
    return blocked("Texto local no disponible", "Desactiva Texto local para usar el perfil sin transcripción, o revisa el modelo desde Opciones. No se descarga al iniciar.");
  }
  return { ...base, canStart: true, button: "Iniciar conversación local (2 min máx.)",
    hint: mode === "conversation"
      ? `Mi perfil guardado · ${withText ? `texto local ${textLanguageLabel(language)} de todas las voces, sin filtro por perfil` : "comparación provisional sin transcripción"}.`
      : `${withText ? `Texto local ${textLanguageLabel(language)}` : "Solo actividad de voz"} · sin perfil no se evalúa participación.` };
}

/** includeTime=false lets a view that already shows the deadline on its own line avoid repeating it. */
export function conversationDetail(snapshot: DetectorSnapshot, hint: string, includeTime = true): string {
  if (snapshot.state === "error") return `OFF · Error: ${snapshot.reason}\n${hint}`;
  if (!snapshot.enabled) {
    return snapshot.stopReason === "expired" || snapshot.stopReason === "silence" || snapshot.stopReason === "saved"
      ? `${snapshot.reason}\n${hint}` : hint;
  }
  const time = !includeTime ? "" : snapshot.remainingMs === null ? "\nSin límite de tiempo."
    : `\n${Math.ceil(snapshot.remainingMs / 1000)} s restantes (máximo ${(snapshot.sessionLimitMs ?? 120_000) / 60_000} min, incluidas las esperas).`;
  if (snapshot.participationMode === "enrollment") {
    const part = snapshot.participation;
    return `${snapshot.reason}\nMi perfil: ${part?.status ?? "preparando"} · ${part?.enrollmentSegments ?? 0}/${part?.requiredSegments ?? 4} muestras · ${((part?.enrollmentMs ?? 0) / 1000).toFixed(1)}/10 s de posible voz.${time}`;
  }
  if (snapshot.participationMode === "conversation" && snapshot.state === "escuchando") {
    return `${snapshot.transcription?.enabled ? `Texto ${textLanguageLabel(snapshot.languageMode)} · todas las voces. Primer texto en unos 7 s y después cada 3 s.` : "Comparación local de voz."}\n${snapshot.participation?.participation ?? "evidencia insuficiente"} · indicio provisional.${time}`;
  }
  return `${snapshot.reason}${time}`;
}

/** One-line reasons for the last identification attempt; shown once, never repeated as alerts. */
export const IDENTITY_OUTCOME_TEXT: Record<IdentityOutcome, string> = {
  "ninguno": "", "aceptado": "",
  "frase-no-reconocida": "no se reconoció la frase completa",
  "frase-ambigua": "la frase apareció en más de una voz",
  "voces-solapadas": "otra voz se solapó con la frase",
  "tiempos-invalidos": "tiempos de Soniox no válidos",
  "tiempos-implausibles": "tiempos de la frase incoherentes",
  "frase-fuera-de-ventana": "la frase quedó fuera de la ventana",
  "audio-insuficiente": "llegó poco audio",
  "sin-resultado": "Soniox no confirmó a tiempo",
  "audio-interrumpido": "el audio se interrumpió",
  "cancelado-manual": "intento cancelado",
  "cancelado-off": "cancelado al parar",
  "motor-local": "sin Soniox",
};

/** S2 status line for phone and lenses; empty when OFF or before Soniox opens. */
export function wearerLine(snapshot: DetectorSnapshot): string {
  const identity = snapshot.transcription?.identity;
  if (!snapshot.enabled || !identity) return "";
  const note = IDENTITY_OUTCOME_TEXT[identity.lastOutcome] ? ` · último intento: ${IDENTITY_OUTCOME_TEXT[identity.lastOutcome]}` : "";
  switch (identity.state) {
    case "no-disponible":
      return snapshot.transcription?.engine?.startsWith("local") ? "Portador: identificación solo con Soniox" : "";
    case "escuchando-frase":
      return `Di: «${WEARER_PHRASE}» · ${Math.ceil((identity.windowRemainingMs ?? 0) / 1000)} s`;
    case "esperando-resultado":
      return "Portador: comprobando la frase…";
    case "identificado":
      return `Portador: «Yo» = voz ${identity.speaker} (${identity.source === "manual" ? "elegida" : identity.source === "perfil" ? "perfil local" : "frase"})${note}`;
    default:
      return `Portador: sin identificar${note}`;
  }
}

export type ManualHermesRuntimeView = { enabled: boolean; listening: boolean; requests: number; modality?: string };
const MANUAL_BASE = "Manual · sin límite de tiempo · cierre tras más de 5 min sin voz";

/**
 * Phone status for manual «Hermes en conversación». Recognising the wearer is optional on a conv/2
 * bridge: the line never claims recognition without a live association from the local profile.
 */
export function manualHermesStatus(detector: DetectorSnapshot, runtime: ManualHermesRuntimeView,
  bridge: { supported: boolean; optionalIdentity: boolean }): string {
  if (detector.enabled && runtime.enabled) {
    const left = detector.remainingMs === null ? "sin límite" : `${Math.ceil(detector.remainingMs / 60_000)} min restantes`;
    const head = `Activo · ${runtime.listening ? "escuchando" : "en pausa"} · ${left} · ${runtime.requests} evaluaciones`;
    return `${head} · ${manualVoiceNote(detector, runtime.modality)}`;
  }
  if (detector.enabled) return "Sesión diagnóstica activa. Toca para detenerla.";
  if (!bridge.supported) return "Hermes no disponible en el puente actual.";
  return bridge.optionalIdentity
    ? `${MANUAL_BASE} · reconocer tu voz es opcional.`
    : `${MANUAL_BASE} · puente anterior: Hermes solo actúa si reconoce tu voz.`;
}

function manualVoiceNote(detector: DetectorSnapshot, modality: string | undefined): string {
  const identity = detector.transcription?.identity;
  const recognised = identity?.state === "identificado";
  if (modality !== "identidad-opcional") return recognised ? "tu voz reconocida" : "esperando reconocer tu voz";
  if (recognised) return identity?.source === "perfil" ? "tu voz reconocida por tu perfil" : "tu voz identificada";
  switch (detector.voiceProfile) {
    case "cargando": return "cargando tu perfil (opcional)";
    case "sin-perfil": return "sin perfil · voces sin identificar";
    case "no-disponible": return "perfil no disponible · voces sin identificar";
    default: return "voz aún sin reconocer (opcional)";
  }
}

/**
 * Phone-only list of the current session's Hermes messages (RAM, newest first), shown while the
 * conversation is ON. Empty when OFF: the runtime clears it and this never shows a stale list.
 */
export function hermesHistoryText(detectorOn: boolean, entries: readonly { at: number; text: string }[]): string {
  if (!detectorOn || entries.length === 0) return "";
  const time = (at: number) => {
    const date = new Date(at);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };
  return ["Mensajes de Hermes (esta sesión):",
    ...entries.map((entry) => `${time(entry.at)} · ${entry.text.replace(/\s+/g, " ").trim()}`)].join("\n");
}
