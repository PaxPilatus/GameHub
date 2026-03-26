/**
 * Shared job / pipeline types for Party-RPG async workers (host-only orchestration).
 */

export type PartyRpgPipelineJobStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "invalidated";

export type PartyRpgJudgePipelineStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type JobQueueStatus = "queued" | "running" | "completed" | "failed" | "invalidated";

export type QueuedWorkUnit = {
  id: string;
  /** When false, work is skipped when it would start. */
  isValid: () => boolean;
  run: () => Promise<void>;
};
