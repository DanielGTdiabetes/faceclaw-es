import { type DetectorSnapshot } from "./coordinator";

/** Fixed reading prompts, not captured transcripts. One shared wearer profile for both languages. */
export const PROFILE_PHRASES = [
  { language: "Castellano", text: "Hoy saldré a caminar por el barrio y después volveré a casa para preparar la comida." },
  { language: "Valencià", text: "Demà de matí aniré al mercat a comprar fruita i després tornaré a casa amb calma." },
  { language: "Castellano", text: "Esta tarde quiero hablar con tranquilidad, explicar mis planes y escuchar lo que dicen otras personas." },
  { language: "Valencià", text: "Esta vesprada eixiré a passejar pel barri i parlaré una estona amb la família i els amics." },
];
export function profileGuide(snapshot: DetectorSnapshot, profileState: string, model: string) {
  const active = snapshot.enabled && snapshot.participationMode === "enrollment";
  const part = snapshot.participation;
  const count = part?.enrollmentSegments ?? 0;
  const seconds = (part?.enrollmentMs ?? 0) / 1000;
  const progress = active ? Math.min(100, Math.floor(Math.min(count / 4, seconds / 10) * 100)) : profileState === "guardado" ? 100 : 0;
  const phrase = active ? PROFILE_PHRASES[Math.min(count, PROFILE_PHRASES.length - 1)]! : null;
  const phraseText = phrase ? `${count < 4 ? `Frase ${count + 1} de 4` : "Una muestra más para completar el tiempo"} · ${phrase.language}\n«${phrase.text}»` : "";
  let state = "Mi perfil: sin crear";
  let hint = "Pulsa Crear mi perfil. Te guiaré con dos frases en castellano y dos en valenciano.";
  if (profileState === "error" || profileState === "no disponible") {
    state = "Mi perfil: no se pudo consultar"; hint = "No se puede confirmar si está guardado. Revisa el estado antes de intentar crearlo de nuevo.";
  } else if (profileState === "guardado") {
    state = "Mi perfil: guardado en este móvil"; hint = "Ya puedes iniciar conversación local. No necesitas crear un perfil distinto por idioma.";
  } else if (active) {
    if (snapshot.state === "error") { state = "Mi perfil: error, no guardado"; hint = `${snapshot.reason} Pulsa OFF.`; }
    else if (part?.status === "cargando") { state = "Mi perfil: preparando"; hint = "Espera. Todavía no leas la frase."; }
    else if (snapshot.state !== "escuchando") { state = "Mi perfil: esperando las gafas"; hint = `${snapshot.reason} Espera a ver Habla ahora.`; }
    else if (part?.status === "guardando") { state = "Mi perfil: guardando"; hint = "Ya tengo las muestras. Espera a la confirmación de guardado y OFF."; }
    else if (part?.busy || snapshot.vad.state === "pausa") { state = "Mi perfil: procesando muestra"; hint = "No hables todavía. Estoy comprobando la muestra; espera la siguiente frase."; }
    else if (snapshot.vad.state === "posible voz" || snapshot.vad.state === "candidato") { state = "Mi perfil: escuchando"; hint = "Continúa leyendo la frase a ritmo natural. Después guarda silencio."; }
    else {
      state = "Mi perfil: habla ahora";
      const feedback = part?.enrollmentFeedback;
      const retry = ["calidad insuficiente", "muestra inconsistente", "sin resultado", "error de muestra", "ocupado"].includes(feedback ?? "");
      hint = retry ? "No he podido aprovechar la última muestra. Repite la frase visible a ritmo natural, sin otras voces."
        : feedback === "reiniciado" ? "El audio se interrumpió y el registro se reinició. Lee de nuevo la primera frase."
        : "Lee solo la frase visible, a ritmo natural (unos 4–8 segundos). Después espera en silencio a que cambie.";
    }
  } else if (snapshot.enrollmentOutcome === "expired") {
    state = "Mi perfil: no guardado, tiempo agotado"; hint = "El registro terminó en OFF sin completar las muestras. Puedes volver a Crear mi perfil.";
  } else if (snapshot.enrollmentOutcome === "canceled") {
    state = "Mi perfil: no guardado, cancelado"; hint = "OFF canceló el registro. Puedes volver a Crear mi perfil cuando quieras.";
  } else if (snapshot.enrollmentOutcome === "error") {
    state = "Mi perfil: no guardado, error"; hint = "El registro no pudo terminar. Puedes reintentar desde Crear mi perfil.";
  } else if (model === "downloading") {
    state = "Mi perfil: descargando modelo"; hint = "La descarga no crea el perfil. Al terminar podrás pulsar Crear mi perfil.";
  } else if (model === "error") {
    state = "Mi perfil: descarga fallida"; hint = "Pulsa Crear mi perfil para reintentar la descarga.";
  } else if (model !== "ready") {
    state = "Mi perfil: falta descargar el modelo"; hint = "Pulsa Crear mi perfil para descargar el modelo de 29 MB. El micrófono no se activa al descargar.";
  }
  return { state, hint, phrase: phraseText, progress, active };
}
