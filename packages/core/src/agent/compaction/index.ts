/**
 * Compaction Module - Context compression for infinite agent sessions.
 *
 * Implements context compaction layers:
 * - Layer 1 (tool_compact): `toModelOutput` transforms + recent-window placeholders
 * - Layer 2 (auto_compact): LLM summarization when threshold exceeded
 * - Reactive: emergency compaction on prompt_too_long errors
 * Manual: CLI `/compact` command (optional)
 *
 * Large tool outputs at execute time use `maybeCacheOutput` (tool-output-cache) — separate from compaction.
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

// Message content helpers
export { extractTextFromContent, getFirstTextPartContent } from "./message-utils.js";

// Compaction prompt
export {
  COMPACTION_PROMPT,
  UPDATE_COMPACTION_PROMPT,
  COMPACTION_SYSTEM_PROMPT,
  buildCompactionPrompt,
  type CompactionTodoItem,
} from "./compaction-prompt.js";

// Tool compaction (Layer 1 — placeholders + toModelOutput)
export { applyToolCompact, createToolPlaceholder, type ApplyToolCompactOptions } from "./tool-compact";
export { ToolCompactCache } from "./tool-compact/tool-compact-cache.js";
export { toModelOutputRegistry } from "../tools/tanstack/to-model-output-registry.js";

// Auto compaction (Layer 2)
export {
  shouldTriggerAutoCompact,
  summarizeConversation,
  autoCompact,
  createCompactedMessages,
  type SummarizeOptions,
} from "./auto-compact.js";
export {
  applyCompactionResult,
  applyReactiveCompactionResult,
  type ApplyCompactionResultOptions,
} from "./apply-compaction-result.js";

// Reactive compaction (Emergency)
export { isPromptTooLongError, reactiveCompact, getMaxReactiveRetries } from "./reactive-compact.js";
export type { ReactiveCompactConfig } from "./reactive-compact.js";
