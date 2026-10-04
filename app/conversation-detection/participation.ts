export type ParticipationMode = "off" | "enrollment" | "conversation";
export type LocalParticipationSnapshot = {
  status: string; worker: boolean; busy: boolean; inputBufferedBytes: number;
  enrolling: boolean; profileSaved: boolean; enrollmentMs: number; enrollmentSegments: number;
  comparisons: number; abstentions: number; dropped: number; voice: string; participation: string;
};
export interface DetectorParticipation {
  start(enrollment: boolean): boolean;
  stop(): void;
  resetStream(): void;
  acceptNative(pcm: unknown, vadState: string): void;
  snapshot(): LocalParticipationSnapshot;
  hasProfile(): boolean;
  deleteProfile(): boolean;
}
