/**
 * Compaction Module - Context compression for infinite agent sessions.
 *
 * Implements context compaction layers:
 * - Layer 1 (tool_compact): `toModelOutput` transforms (cached per toolCallId)
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
  STILL_IN_CONTEXT_RULES,
  buildCompactionPrompt,
  type CompactionTodoItem,
} from "./compaction-prompt.js";

export { applyToolCompact, type ApplyToolCompactOptions } from "./tool-compact";
export { ToolCompactCache } from "./tool-compact/tool-compact-cache.js";
export { toModelOutputRegistry } from "../tools/runtime/to-model-output-registry.js";

// Message-chain projection (summary-first wire)
export {
  CONVERSATION_SUMMARY_END,
  CONVERSATION_SUMMARY_START,
  createCompactionSummaryUIMessage,
  findLatestSummaryIndex,
  formatCompactionSummaryContent,
  getModelVisibleMessages,
  isCompactionSummaryModelMessage,
  isCompactionSummaryText,
  isCompactionSummaryUIMessage,
  isLatestDurableMessageCompactionSummary,
  type GetModelVisibleMessagesOptions,
} from "./message-chain-projection.js";
export { extractCompactionSummaryBody } from "./compaction-summary.js";

// Auto compaction (Layer 2)
export {
  shouldTriggerAutoCompact,
  summarizeConversation,
  autoCompact,
  createCompactedMessages,
  buildSummarizationUserPrompt,
  findCutPoint,
  extractExistingSummary,
  type SummarizeOptions,
} from "./auto-compact.js";
export { buildSegmentedConversationText, serializeConversation } from "./serialize-conversation.js";
export {
  applyCompactionResult,
  applyReactiveCompactionResult,
  type ApplyCompactionResultOptions,
} from "./apply-compaction-result.js";

// Compact transcript archive
export {
  COMPACT_TRANSCRIPT_ROOT,
  buildCompactArchiveMarkdown,
  extractCompactArchivePaths,
  formatCompactArchivesSection,
  maybeAppendCompactArchive,
  parseCompactSequence,
  stripCompactArchiveSections,
  writeCompactArchive,
  type CompactArchiveWriteResult,
  type WriteCompactArchiveOptions,
} from "./write-compact-archive.js";

// Reactive compaction (Emergency)
export { isPromptTooLongError, reactiveCompact, getMaxReactiveRetries } from "./reactive-compact.js";
export type { ReactiveCompactConfig } from "./reactive-compact.js";

export type { TokenUsage } from "../../runtime-types/token-usage.js";
