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
  /** Token threshold (context window size) for auto-compaction (default: 100000) */
  tokenThreshold: z.number().int().positive().default(100000),
  /** Percentage of tokenThreshold at which compaction triggers (default: 85, like Claude Code's ~83.5%) */
  compactAtPercent: z.number().min(50).max(99).default(85),
  /** Number of recent tool results to preserve in micro-compact (default: 3) */
  keepRecentToolResults: z.number().int().nonnegative().default(3),
  /** Minimum size of tool result to consider for compaction (default: 100 chars) */
  minToolResultSize: z.number().int().nonnegative().default(100),
  /** Number of recent tokens to keep after compaction (default: 20000) */
  keepRecentTokens: z.number().int().positive().default(20000),
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
  /** Summary generated if auto/manual compaction */
  summary: z.string().optional(),
  /** Error message if compaction failed */
  error: z.string().optional(),
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

// ============================================================================
// Defaults
// ============================================================================

/**
 * Default compaction configuration values.
 */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  tokenThreshold: 100000,
  keepRecentToolResults: 3,
  minToolResultSize: 100,
  keepRecentTokens: 20000,
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
