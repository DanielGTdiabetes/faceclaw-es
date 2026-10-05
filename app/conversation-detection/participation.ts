export type ParticipationMode = "off" | "enrollment" | "conversation";
export type LocalParticipationSnapshot = {
  status: string; worker: boolean; busy: boolean; inputBufferedBytes: number;
  enrolling: boolean; profileSaved: boolean; enrollmentMs: number; enrollmentSegments: number;
  comparisons: number; abstentions: number; dropped: number; voice: string; participation: string;
  enrollmentFeedback?: string;
  requiredSegments?: number;
};
export interface DetectorParticipation {
  start(enrollment: boolean, durationMs?: number): boolean;
  stop(): void;
  resetStream(): void;
  acceptNative(pcm: unknown, vadState: string, audioStartMs?: number): void;
  drainProfileMatches?(): ProfileVoiceMatch[];
  snapshot(): LocalParticipationSnapshot;
  hasProfile(): boolean;
  profileState?(): string;
  deleteProfile(): boolean;
}
import { type ProfileVoiceMatch } from "./profile-speaker-matcher";
