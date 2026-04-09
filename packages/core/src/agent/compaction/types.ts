/**
 * Compaction Types - Type definitions for the context compaction system.
 *
 * The compaction system implements three-layer context compression:
 * - Layer 1 (micro_compact): Replace old tool results with placeholders
 * - Layer 2 (auto_compact): LLM-based summarization when threshold exceeded
 * - Layer 3 (compact tool): Manual trigger for conversation compression
 */

import { z } from "zod";

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for compaction configuration.
 */
export const compactionConfigSchema = z.object({
  /** Token threshold for auto-compaction (default: 100000) */
  tokenThreshold: z.number().int().positive().default(100000),
  /** Number of recent tool results to preserve in micro-compact (default: 3) */
  keepRecentToolResults: z.number().int().nonnegative().default(3),
  /** Directory for transcript storage relative to rootPath (default: ".transcripts") */
  transcriptDir: z.string().default(".transcripts"),
  /** Minimum size of tool result to consider for compaction (default: 100 chars) */
  minToolResultSize: z.number().int().nonnegative().default(100),
});

/**
 * Schema for compaction result.
 */
export const compactionResultSchema = z.object({
  /** Whether compaction was performed */
  compacted: z.boolean(),
  /** Estimated tokens before compaction */
  tokensBefore: z.number().int().nonnegative(),
  /** Estimated tokens after compaction */
  tokensAfter: z.number().int().nonnegative(),
  /** Type of compaction performed */
  type: z.enum(["micro", "auto", "manual"]).optional(),
  /** Path to transcript file if saved */
  transcriptPath: z.string().optional(),
  /** Summary generated if auto/manual compaction */
  summary: z.string().optional(),
  /** Error message if compaction failed */
  error: z.string().optional(),
});

/**
 * Schema for transcript entry (one message per line in JSONL).
 */
export const transcriptEntrySchema = z.object({
  /** Timestamp when the message was recorded */
  timestamp: z.string(),
  /** Message role */
  role: z.string(),
  /** Message content (can be complex for tool calls) */
  content: z.unknown(),
});

// ============================================================================
// Types
// ============================================================================

/**
 * Compaction configuration options.
 */
export type CompactionConfig = z.infer<typeof compactionConfigSchema>;

/**
 * Input type for partial compaction config (all fields optional).
 */
export type CompactionConfigInput = z.input<typeof compactionConfigSchema>;

/**
 * Result of a compaction operation.
 */
export type CompactionResult = z.infer<typeof compactionResultSchema>;

/**
 * A single entry in a transcript file.
 */
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;

// ============================================================================
// Defaults
// ============================================================================

/**
 * Default compaction configuration values.
 */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  tokenThreshold: 100000,
  keepRecentToolResults: 3,
  transcriptDir: ".transcripts",
  minToolResultSize: 100,
};

/**
 * Create a compaction config with defaults applied.
 *
 * @param input - Partial configuration to merge with defaults
 * @returns Complete compaction configuration
 *
 * @example
 * ```typescript
 * const config = createCompactionConfig({ tokenThreshold: 50000 });
 * // Result: { enabled: true, tokenThreshold: 50000, keepRecentToolResults: 3, ... }
 * ```
 */
export function createCompactionConfig(input?: CompactionConfigInput): CompactionConfig {
  if (!input) return { ...DEFAULT_COMPACTION_CONFIG };
  return compactionConfigSchema.parse(input);
}
