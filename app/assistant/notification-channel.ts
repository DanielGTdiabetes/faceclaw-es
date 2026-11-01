/** Delivery control only: no speech, conversation history or model requests. */
export const NOTIFICATION_CAPABILITY = "notify/1";
export type NotificationPresence = { connected: boolean; worn: boolean | null; charging: boolean; available: boolean };
export type NotificationHost = {
  presence(): NotificationPresence;
  allowed(): boolean;
  refresh(): void;
  subscribe(listener: () => void): () => void;
  present(text: string, confirmed: () => void): (() => void) | null;
};

export class NotificationChannel {
  private host: NotificationHost | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private off: (() => void) | null = null;
  private pending: { id: string; cancel: () => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private readonly receipts = new Map<string, boolean>();
  private supported = false;

  constructor(private readonly send: (frame: object) => boolean) {}

  connect(capabilities: unknown, host?: NotificationHost): void {
    this.reset();
    this.host = host ?? null;
    this.supported = Array.isArray(capabilities) && capabilities.includes(NOTIFICATION_CAPABILITY) && !!host;
    if (!this.supported || !host) return;
    this.off = host.subscribe(() => this.publish());
    this.tick();
  }

  reset(): void {
    this.supported = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.off?.(); this.off = null;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.cancel(); this.pending = null; }
    this.receipts.clear();
    this.host = null;
  }

  private tick(): void {
    if (!this.supported) return;
    this.host?.refresh();
    this.publish();
    this.timer = setTimeout(() => { this.timer = null; this.tick(); }, 15_000);
  }

  private publish(): void {
    if (!this.supported || !this.host) return;
    const state = this.host.presence();
    this.send({ chan: "notify", type: "presence", ...state, allowed: this.host.allowed() });
    if ((!state.connected || state.worn !== true || state.charging || !state.available || !this.host.allowed()) && this.pending) {
      const pending = this.pending; this.pending = null;
      clearTimeout(pending.timer);
      pending.cancel(); this.receipt(pending.id, false);
    }
  }

  handle(frame: any): void {
    if (!this.supported || !this.host || typeof frame.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(frame.id)) return;
    const id: string = frame.id;
    if (frame.type === "cancel") {
      if (this.pending?.id === id) { clearTimeout(this.pending.timer); this.pending.cancel(); this.pending = null; this.receipt(id, false); }
      return;
    }
    if (frame.type !== "deliver") return;
    if (this.receipts.has(id)) { this.receipt(id, this.receipts.get(id)!); return; }
    if (this.pending?.id === id) return;
    const state = this.host.presence();
    if (typeof frame.text !== "string" || !frame.text.trim() || frame.text.length > 240 || this.pending ||
        !this.host.allowed() || !state.connected || state.worn !== true || state.charging || !state.available) {
      this.receipt(id, false); return;
    }
    const owner = { id, cancel: () => {}, timer: setTimeout(() => {
      if (this.pending !== owner) return;
      this.pending = null; owner.cancel(); this.receipt(id, false);
    }, 5000) };
    this.pending = owner;
    const cancel = this.host.present(frame.text, () => {
      if (this.pending !== owner) return;
      clearTimeout(owner.timer);
      const current = this.host!.presence();
      if (!this.host!.allowed() || !current.connected || current.worn !== true || current.charging || !current.available) {
        owner.cancel(); this.pending = null; this.receipt(id, false); return;
      }
      this.pending = null;
      this.receipt(id, true);
    });
    if (cancel) owner.cancel = cancel;
    else { clearTimeout(owner.timer); this.pending = null; this.receipt(id, false); }
  }

  private receipt(id: string, presented: boolean): void {
    this.receipts.set(id, presented);
    if (this.receipts.size > 128) this.receipts.delete(this.receipts.keys().next().value!);
    this.send({ chan: "notify", type: "receipt", id, presented });
  }
}
