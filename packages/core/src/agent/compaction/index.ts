/**
 * Compaction Module - Context compression for infinite agent sessions.
 *
 * Implements two-layer context compaction:
 * - Layer 1 (micro_compact): Replace old tool results with placeholders
 * - Layer 2 (auto_compact): Subagent-based summarization when threshold exceeded
 * Manual: CLI `/compact` command (optional)
 *
 * @example
 * ```typescript
 * import { microCompact, autoCompact, estimateTokens } from "./compaction";
 *
 * // Estimate tokens before LLM call
 * const tokens = estimateTokens(messages);
 *
 * // Apply micro compaction (always)
 * const compactedMessages = microCompact(messages, config);
 *
 * // Check if auto compaction needed
 * if (shouldAutoCompact(compactedMessages, config)) {
 *   const result = await autoCompact(compactedMessages, config, agentId);
 * }
 * ```
 */

// Types and schemas
export {
  compactionConfigSchema,
  compactionResultSchema,
  type CompactionConfig,
  type CompactionConfigInput,
  type CompactionResult,
  DEFAULT_COMPACTION_CONFIG,
  createCompactionConfig,
} from "./types.js";

// Token estimation
export { estimateTokens, estimateMessageTokens } from "./token-estimator.js";

// Compaction prompt
export {
  COMPACTION_PROMPT,
  UPDATE_COMPACTION_PROMPT,
  COMPACTION_SYSTEM_PROMPT,
  buildCompactionPrompt,
  type CompactionTodoItem,
} from "./compaction-prompt.js";

// Micro compaction (Layer 1)
export { microCompact } from "./micro-compact.js";

// Auto compaction (Layer 2)
export {
  shouldAutoCompact,
  summarizeConversation,
  autoCompact,
  createCompactedMessages,
  type SummarizeOptions,
} from "./auto-compact.js";
export { applyCompactionResult, type ApplyCompactionResultOptions } from "./apply-compaction-result.js";

// Reactive compaction (Emergency)
export { isPromptTooLongError, reactiveCompact, getMaxReactiveRetries } from "./reactive-compact.js";
export type { ReactiveCompactConfig } from "./reactive-compact.js";
