import type { LanguageModel, ModelMessage } from "ai";

// ============================================================================
// Agent Status
// ============================================================================

export type AgentStatus =
  | "idle"
  | "running"
  | "completed"
  | "error"
  | "aborted"
  | "waiting"
  | "compacting"
  | "thinking"
  | "responding";

/** Run options */
export interface AgentRunOptions {
  /** User prompt (creates a user message) */
  prompt?: string;
  /** Messages array */
  messages?: ModelMessage[];
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Override model for this run */
  model?: LanguageModel;
}
