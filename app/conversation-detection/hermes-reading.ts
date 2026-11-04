/** One policy for controller expiry and native lens presentation. No ICU dependency on Android. */
export function hermesReadingWindow(text: string, calendarOffer = false, presented = true): { minMs: number; maxMs: number } {
  // Keep the historical fallback until the native frame ACK; offers keep that policy throughout.
  if (calendarOffer || !presented) return { minMs: 12_000, maxMs: 30_000 };
  const words = text.toLowerCase().match(/[a-záéíóúüñàèòïç0-9]+/g)?.length ?? 0;
  const duration = Math.max(4_000, Math.min(30_000, 2_000 + 300 * words));
  return { minMs: duration, maxMs: duration };
}
