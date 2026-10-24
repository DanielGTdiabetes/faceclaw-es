/**
 * Phone-side watchdog for the EVO-X2 (Hermes proactive spec v5.3, 12.6): the EVO cannot report its own
 * outage, so the phone says "EVO-X2 unreachable from this phone" when the assistant bridge stays down.
 * It never claims the machine crashed: the phone, the network or Tailscale may be the cause.
 *
 * The EVO has a nightly power schedule (it powers off between 21:00 and 22:00 when idle and an RTC alarm
 * powers it on at 03:50). Inside that window an outage is expected and is not reported; an outage that
 * continues after the window end counts from the window end.
 *
 * Pure logic, no NativeScript imports (runs under node --test).
 */

export type ClockTime = { hour: number; minute: number };

export type EvoWatchdogConfig = {
  /** An outage shorter than this is not reported (bridge restarts, deploys, short network losses). */
  thresholdMs: number;
  /** Nightly window in phone local time; may cross midnight. */
  offStart: ClockTime;
  offEnd: ClockTime;
};

/** Provisional values, matching the EVO power schedule installed on 24/10/2026. */
export const EVO_WATCHDOG_DEFAULTS: EvoWatchdogConfig = {
  thresholdMs: 10 * 60_000,
  offStart: { hour: 21, minute: 0 },
  offEnd: { hour: 3, minute: 50 },
};

export type EvoWatchdogDeps = {
  now(): number;
  /** The watchdog only runs while the external bridge is configured. */
  enabled(): boolean;
  /** Authenticated bridge connection that is still receiving frames. */
  reachable(): boolean;
  alert(text: string): void;
  config?: EvoWatchdogConfig;
};

const minutesOf = (time: ClockTime) => time.hour * 60 + time.minute;

export function inOffWindow(ms: number, config: EvoWatchdogConfig = EVO_WATCHDOG_DEFAULTS): boolean {
  const date = new Date(ms);
  const minute = date.getHours() * 60 + date.getMinutes();
  const start = minutesOf(config.offStart);
  const end = minutesOf(config.offEnd);
  return start <= end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Most recent local instant at or before `ms` whose clock time is the window end. */
export function lastOffWindowEnd(ms: number, config: EvoWatchdogConfig = EVO_WATCHDOG_DEFAULTS): number {
  const date = new Date(ms);
  date.setHours(config.offEnd.hour, config.offEnd.minute, 0, 0);
  if (date.getTime() > ms) date.setDate(date.getDate() - 1);
  return date.getTime();
}

export function clockLabel(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export class EvoWatchdog {
  private readonly config: EvoWatchdogConfig;
  private lastReachableMs: number;
  private alertedSinceMs: number | null = null;

  constructor(private readonly deps: EvoWatchdogDeps) {
    this.config = deps.config ?? EVO_WATCHDOG_DEFAULTS;
    // Unknown history at start: the outage, if any, counts from now.
    this.lastReachableMs = deps.now();
  }

  /** One evaluation; call periodically (every 30 s is enough for a 10 min threshold). */
  check(): void {
    const now = this.deps.now();
    if (!this.deps.enabled()) {
      this.lastReachableMs = now;
      this.alertedSinceMs = null;
      return;
    }
    if (this.deps.reachable()) {
      if (this.alertedSinceMs !== null) {
        const minutes = Math.max(1, Math.round((now - this.alertedSinceMs) / 60_000));
        this.deps.alert(`EVO-X2 accesible de nuevo desde este móvil (sin conexión ${minutes} min).`);
      }
      this.alertedSinceMs = null;
      this.lastReachableMs = now;
      return;
    }
    if (this.alertedSinceMs !== null || inOffWindow(now, this.config)) return;
    const windowEnd = lastOffWindowEnd(now, this.config);
    const afterNight = this.lastReachableMs < windowEnd;
    const since = afterNight ? windowEnd : this.lastReachableMs;
    if (now - since < this.config.thresholdMs) return;
    this.alertedSinceMs = since;
    this.deps.alert(afterNight
      ? `EVO-X2 inaccesible desde este móvil desde las ${clockLabel(since)}: no ha vuelto tras el apagado nocturno.`
      : `EVO-X2 inaccesible desde este móvil desde las ${clockLabel(since)}. Puede ser el equipo, la red o Tailscale.`);
  }
}
