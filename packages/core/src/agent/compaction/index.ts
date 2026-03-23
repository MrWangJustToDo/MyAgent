/**
 * Compaction Module - Context compression for infinite agent sessions.
 *
 * Implements three-layer context compaction:
 * - Layer 1 (micro_compact): Replace old tool results with placeholders
 * - Layer 2 (auto_compact): LLM-based summarization when threshold exceeded
 * - Layer 3 (compact tool): Manual trigger for conversation compression
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
 *   const result = await autoCompact(compactedMessages, config, model, sandbox);
 * }
 * ```
 */

// Types and schemas
export {
  // Schemas
  compactionConfigSchema,
  compactionResultSchema,
  transcriptEntrySchema,
  // Types
  type CompactionConfig,
  type CompactionConfigInput,
  type CompactionResult,
  type TranscriptEntry,
  // Defaults
  DEFAULT_COMPACTION_CONFIG,
  createCompactionConfig,
} from "./types.js";

// Token estimation
export { estimateTokens, estimateMessageTokens } from "./token-estimator.js";

// Compaction prompt
export { COMPACTION_PROMPT, buildCompactionPrompt } from "./compaction-prompt.js";

// Micro compaction (Layer 1)
export { microCompact } from "./micro-compact.js";

// Auto compaction (Layer 2)
export {
  shouldAutoCompact,
  saveTranscript,
  summarizeConversation,
  autoCompact,
  createCompactedMessages,
} from "./auto-compact.js";
