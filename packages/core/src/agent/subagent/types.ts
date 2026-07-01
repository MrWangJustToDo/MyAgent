/**
 * Subagent types, interfaces, and constants.
 */

import type { ModelMessage, ToolSet } from "ai";

// ============================================================================
// Constants
// ============================================================================

/**
 * Default maximum iterations for subagent loop.
 *
 * Acts as a safety cap only — the loop also stops as soon as the model
 * produces a final text answer (see `isNaturalEnd`). Set generously so
 * complex exploration tasks aren't truncated, while still bounding runaway
 * loops.
 */
export const SUBAGENT_DEFAULT_MAX_ITERATIONS = 50;

/** Default maximum characters for output (truncation limit) */
export const SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH = 5000;

/** Maximum retries when output is empty */
export const SUBAGENT_MAX_RETRIES = 2;

/** @deprecated Use SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH instead */
export const SUBAGENT_MAX_SUMMARY_LENGTH = SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH;

// ============================================================================
// Types
// ============================================================================

export interface SubagentConfig {
  /** Optional custom ID for the subagent (auto-generated if not provided) */
  subagentId?: string;
  /** The prompt/task for the subagent to complete */
  prompt: string;
  /** Short description for UI display (default: "subtask") */
  description?: string;
  /** Parent agent ID (to get agent instance from AgentManager) */
  parentAgentId: string;
  /** Custom system prompt (default: SUBAGENT_EXPLORE_SYSTEM_PROMPT) */
  systemPrompt?: string;
  /** Custom tools (default: read-only exploration tools, pass {} for no tools) */
  tools?: ToolSet;
  /** Maximum iterations (default: 30) */
  maxIterations?: number;
  /** Maximum retry (default: 2) */
  maxRetried?: number;
  /** Maximum output length before truncation (default: 5000) */
  maxOutputLength?: number;
  /** Whether to retry when output is empty (default: true) */
  retryOnEmpty?: boolean;
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Auto-destroy subagent after completion (default: true) */
  autoDestroy?: boolean;
  /** Whether to aggregate usage to parent context (default: true) */
  aggregateUsageToParent?: boolean;
  /**
   * Initial messages to seed the subagent's context.
   * If provided, these are used instead of starting from empty.
   * Useful for compaction where you want to pass conversation history.
   */
  initialMessages?: ModelMessage[];
}

export interface SubagentResult {
  /** Subagent ID - use to get instance via agentManager.getAgent(subagentId) */
  subagentId: string;
  /** Final output text (may be truncated; full output at cachedOutputPath) */
  output: string;
  /** Whether the output was truncated */
  truncated: boolean;
  /** Number of iterations used */
  iterations: number;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Whether iteration limit was reached */
  reachedLimit: boolean;
  /** Number of retries attempted */
  retries: number;
  /** Whether the subagent was cancelled (aborted) before completing */
  aborted: boolean;
}

/** @deprecated Use SubagentResult.output instead of summary */
export type SubagentResultLegacy = SubagentResult & { summary: string };
