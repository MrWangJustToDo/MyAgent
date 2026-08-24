// ============================================================================
// Agent Retry State
// ============================================================================

/** Recovery strategy that produced a retry (surfaced to hosts for display). */
export type AgentRetryStrategy =
  | "transient" // 429 / gateway / network — exponential backoff, same messages
  | "capability" // multimodal parts stripped after provider schema rejection
  | "reactive_compact" // emergency context compaction on prompt_too_long
  | "max_tokens"; // output truncation — escalate max_tokens / continuation prompt

/** Live retry visibility for the UI: attempt counts, strategy and last error. */
export interface AgentRetryState {
  /** 1-based retry attempt about to run. */
  attempt: number;
  /** Upper bound for this strategy (recovery attempts or truncation continuations). */
  maxAttempts: number;
  strategy: AgentRetryStrategy;
  /** Short error text that triggered the retry (empty for truncation). */
  error?: string;
  /** Backoff delay before the retry starts (ms), when known. */
  delayMs?: number;
  /** Provider-advised wait (Retry-After, seconds), when present. */
  retryAfterSeconds?: number;
  /** Epoch ms when the retry state was recorded. */
  startedAt: number;
}
