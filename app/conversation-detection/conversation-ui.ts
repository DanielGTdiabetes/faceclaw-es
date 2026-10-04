import { type DetectorSnapshot } from "./coordinator";
import { type TextLanguage } from "./transcription";

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
    return snapshot.stopReason === "expired" || snapshot.stopReason === "saved"
      ? `${snapshot.reason}\n${hint}` : hint;
  }
  const time = includeTime ? `\n${Math.ceil(snapshot.remainingMs / 1000)} s restantes (máximo 2 min, incluidas las esperas).` : "";
  if (snapshot.participationMode === "enrollment") {
    const part = snapshot.participation;
    return `${snapshot.reason}\nMi perfil: ${part?.status ?? "preparando"} · ${part?.enrollmentSegments ?? 0}/${part?.requiredSegments ?? 4} muestras · ${((part?.enrollmentMs ?? 0) / 1000).toFixed(1)}/10 s de posible voz.${time}`;
  }
  if (snapshot.participationMode === "conversation" && snapshot.state === "escuchando") {
    return `${snapshot.transcription?.enabled ? `Texto ${textLanguageLabel(snapshot.languageMode)} · todas las voces. Espera unos 6 s para el primer texto.` : "Comparación local de voz."}\n${snapshot.participation?.participation ?? "evidencia insuficiente"} · indicio provisional.${time}`;
  }
  return `${snapshot.reason}${time}`;
}
