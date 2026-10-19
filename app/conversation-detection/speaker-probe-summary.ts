import { type SpeakerProbeSnapshot, type SpeakerProbeStat, type SpeakerProbeVariant } from "./transcription";

const NAMES: Record<SpeakerProbeVariant["name"], string> = { recortado: "Sin extremos de baja energía", nivelado: "Nivel igualado" };

function delta(stat: SpeakerProbeStat | undefined): string {
  if (!stat || !stat.n || typeof stat.mean !== "number" || !Number.isFinite(stat.mean)) return "—";
  return `${stat.mean >= 0 ? "+" : ""}${stat.mean.toFixed(2)}`;
}

/**
 * Phone summary of the D0 aggregates: windows, mean similarity change of each copy against the profile and
 * the nearest session voice, and decision-zone changes. Scalars only; null when there is nothing to show.
 */
export function speakerProbeSummary(probe: SpeakerProbeSnapshot | undefined | null): string | null {
  if (!probe || typeof probe.windows !== "number") return null;
  const head = `Diagnóstico D0 (${probe.status === "activo" ? "en curso" : "última sesión"}): ${probe.windows} ventanas`
    + (probe.omitted ? `, ${probe.omitted} sin analizar (límite ${probe.maxWindows})` : "")
    + (probe.errors ? `, ${probe.errors} errores` : "") + ".";
  const lines = (probe.variants ?? []).map((v) => {
    const counted = v.embedded ? `${v.embedded} comparadas` : "sin comparar";
    const skipped = [v.unchanged ? `${v.unchanged} iguales` : "", v.short ? `${v.short} cortas` : "",
      v.failed ? `${v.failed} fallidas` : ""].filter(Boolean).join(", ");
    return `${NAMES[v.name] ?? v.name}: ${counted}${skipped ? ` (${skipped})` : ""}; Δ tu voz ${delta(v.profileDelta)}, `
      + `Δ voz más próxima ${delta(v.nearestDelta)}; cambios de decisión ${v.zoneChanged} `
      + `(a tu voz ${v.toWearer}, desde tu voz ${v.fromWearer}), de voz ${v.groupChanged}.`;
  });
  return [head, ...lines, "Solo mide energía y nivel: no demuestra voz limpia ni ausencia de mezcla."].join("\n");
}
