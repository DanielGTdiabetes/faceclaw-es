import { type SpeakerCounts, type SpeakerProbeSnapshot, type SpeakerProbeStat, type SpeakerProbeVariant } from "./transcription";

const NAMES: Record<SpeakerProbeVariant["name"], string> = { recortado: "Sin extremos de baja energía", nivelado: "Nivel igualado" };

function delta(stat: SpeakerProbeStat | undefined): string {
  if (!stat || !stat.n || typeof stat.mean !== "number" || !Number.isFinite(stat.mean)) return "—";
  return `${stat.mean >= 0 ? "+" : ""}${stat.mean.toFixed(2)}`;
}

/**
 * Phone summary of the D0 aggregates: windows, mean similarity change of each copy against the profile and
 * the nearest session voice, and decision-zone changes. Scalars only; null when there is nothing to show.
 */
export function speakerProbeSummary(probe: SpeakerProbeSnapshot | undefined | null,
  speakers?: SpeakerCounts | null): string | null {
  if (!probe || typeof probe.windows !== "number") return null;
  const head = `Diagnóstico D0 (${probe.status === "activo" ? "en curso" : "última sesión"}): ${probe.windows} ventanas`
    + (probe.omitted ? `, ${probe.omitted} sin analizar (límite ${probe.maxWindows})` : "")
    + (probe.errors ? `, ${probe.errors} errores` : "") + ".";
  const counts = speakerCountsLine(speakers);
  const lines = (probe.variants ?? []).map((v) => {
    const counted = v.embedded ? `${v.embedded} comparadas` : "sin comparar";
    const skipped = [v.unchanged ? `${v.unchanged} iguales` : "", v.short ? `${v.short} cortas` : "",
      v.failed ? `${v.failed} fallidas` : ""].filter(Boolean).join(", ");
    return `${NAMES[v.name] ?? v.name}: ${counted}${skipped ? ` (${skipped})` : ""}; Δ tu voz ${delta(v.profileDelta)}, `
      + `Δ voz más próxima ${delta(v.nearestDelta)}; cambios de decisión ${v.zoneChanged} `
      + `(a tu voz ${v.toWearer}, desde tu voz ${v.fromWearer}), de voz ${v.groupChanged}.`;
  });
  return [head, ...(counts ? [counts] : []), ...lines,
    "Solo mide energía y nivel: no demuestra voz limpia ni ausencia de mezcla."].join("\n");
}

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

/**
 * Session voices created besides the wearer and how the windows with text were labelled. Counts every window
 * of the session, not only the [MAX_WINDOWS] probed ones. Null when the counters are missing or malformed.
 */
function speakerCountsLine(speakers: SpeakerCounts | null | undefined): string | null {
  if (!speakers) return null;
  const voices = count(speakers.voices), wearer = count(speakers.wearer), other = count(speakers.other);
  const clustered = count(speakers.clustered), unknown = count(speakers.unknown), errors = count(speakers.errors);
  if (voices === null || wearer === null || other === null || clustered === null || unknown === null) return null;
  return `Voces de la sesión además de la tuya: ${voices} (máximo 6). Ventanas con texto: tuyas ${wearer}, `
    + `de otras voces ${other}` + (clustered ? `, agrupadas sin perfil ${clustered}` : "")
    + `, sin atribuir ${unknown}` + (errors ? `, errores ${errors}` : "") + ".";
}
