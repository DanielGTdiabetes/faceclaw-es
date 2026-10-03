/** Boolean ownership only. No text, context or agent configuration crosses this signal. */
const turns = new Set<object>();
const listeners = new Set<(active: boolean) => void>();
export const assistantAudioPriority = {
  isActive: (): boolean => turns.size > 0,
  setActive(owner: object, active: boolean): void {
    const before = turns.size > 0;
    if (active) turns.add(owner); else turns.delete(owner);
    if (before !== (turns.size > 0)) for (const listener of listeners) listener(turns.size > 0);
  },
  subscribe(listener: (active: boolean) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
