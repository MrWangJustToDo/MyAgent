/**
 * Subagent types, interfaces, and constants.
 */

import type { ToolsRecord } from "../tools/tanstack/tools-record.js";
import type { ModelMessage } from "@tanstack/ai";

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
  /** Parent task tool call ID for summary streaming in the task tool UI */
  parentTaskToolCallId?: string;
  /** Custom system prompt (default: SUBAGENT_EXPLORE_SYSTEM_PROMPT) */
  systemPrompt?: string;
  /** Custom tools (default: read-only exploration tools, pass {} for no tools) */
  tools?: ToolsRecord;
  /** Maximum iterations (default: 50) */
  maxIterations?: number;
  /** Maximum output length before truncation (default: 5000) */
  maxOutputLength?: number;
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Auto-destroy subagent after completion (default: true) */
  autoDestroy?: boolean;
  /** Whether to aggregate usage to parent agent (default: true) */
  aggregateUsageToParent?: boolean;
  /**
   * Initial messages to seed the subagent's context.
   * If provided, these are used instead of starting from empty.
   * Useful for compaction where you want to pass conversation history.
   */
  initialMessages?: ModelMessage[];
  /**
   * Bridge the run through {@link AgentUIChannel} for SubagentPanel preview and
   * task-tool summary streaming via {@link parentTaskToolCallId}.
   *
   * Defaults to `true` when `parentTaskToolCallId` is set, otherwise `false`.
   * Set explicitly to `false` for headless runs (compaction, memory extraction).
   */
  bridgeUI?: boolean;
}

/** Resolve whether a subagent run should bridge through {@link AgentUIChannel}. */
export function resolveSubagentBridgeUI(config: Pick<SubagentConfig, "bridgeUI" | "parentTaskToolCallId">): boolean {
  return config.bridgeUI ?? Boolean(config.parentTaskToolCallId);
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
  /**
   * Whether the subagent finished without a natural end — i.e. it was
   * stopped by the step-count cap or by the stall detector rather than
   * producing a final text answer. The findings returned may be partial.
   */
  incomplete: boolean;
  /** Whether the subagent was cancelled (aborted) before completing */
  aborted: boolean;
}
