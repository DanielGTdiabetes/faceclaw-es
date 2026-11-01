/** Single low-priority, exclusive lease. Normal users may share the existing stream. */
export class AudioCaptureArbiter {
  private readonly owners = new Set<string>();
  private generation = 0;
  private detector: { id: number; revoke: () => void } | null = null;

  setOwner(owner: string, active: boolean): void {
    if (active) {
      this.owners.add(owner);
      this.revokeDetector(); // Before any normal user changes the native capture.
    } else {
      this.owners.delete(owner);
    }
  }

  isBusy(): boolean { return this.owners.size > 0; }

  acquireDetector(revoke: () => void): number | null {
    if (this.isBusy() || this.detector) return null;
    const id = ++this.generation;
    this.detector = { id, revoke };
    return id;
  }

  releaseDetector(id: number): boolean {
    if (this.detector?.id !== id) return false;
    this.detector = null;
    return true;
  }

  revokeDetector(): void {
    const lease = this.detector;
    this.detector = null;
    lease?.revoke();
  }
}
