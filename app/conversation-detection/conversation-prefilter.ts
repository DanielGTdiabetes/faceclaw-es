import { type ConversationTurn } from "./conversation-turns";

export type PrefilterReason = "empty" | "duplicate";
export type PrefilterCounters = Record<PrefilterReason, number>;
export const emptyPrefilterCounters = (): PrefilterCounters => ({ empty: 0, duplicate: 0 });

// Preserve punctuation, accents, numbers and negations. They can change the meaning.
const textKey = (text: string): string => text.trim().replace(/\s+/gu, " ").toLowerCase();

/** Android's embedded V8 lacks ICU property escapes. Keep an explicit conservative set instead. */
export function isEmptyConversationText(text: string): boolean {
  const punctuation = "!\"#%&'()*,./:;?@[\\]_{}¡¿«»‹›‐‑‒–—―‘’‚‛“”„‟•‣․‥…-";
  // oxlint-disable-next-line typescript/no-misused-spread -- Unknown code points stay meaningful; grapheme segmentation is unnecessary.
  return [...text.replace(/\s/g, "")].every(character => punctuation.includes(character));
}

/**
 * Applied only after stream, identity and lifecycle validation, to the current episode's bounded
 * buffer. Identical words in a later or merely overlapping audio window are NOT proof of a replay.
 * No minimum word count, semantic filtering, fuzzy matching, timer, storage or model inference.
 */
export function prefilterTurn(turn: ConversationTurn, recent: readonly ConversationTurn[]): PrefilterReason | null {
  if (isEmptyConversationText(turn.text)) return "empty";
  const timed = Number.isSafeInteger(turn.startMs) && Number.isSafeInteger(turn.endMs)
    && turn.startMs !== null && turn.endMs !== null && turn.startMs >= 0 && turn.endMs > turn.startMs;
  if (!timed) return null;
  const key = textKey(turn.text);
  return recent.some((previous) => previous.sessionId === turn.sessionId && previous.streamId === turn.streamId
    && previous.associationVersion === turn.associationVersion && previous.engine === turn.engine
    && previous.speaker === turn.speaker && previous.relation === turn.relation && previous.timing === turn.timing
    && previous.startMs === turn.startMs && previous.endMs === turn.endMs && textKey(previous.text) === key)
    ? "duplicate" : null;
}
