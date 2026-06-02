/**
 * Memory Types - Type definitions for the persistent memory system.
 *
 * Memories are cross-session knowledge files stored in `.agent-memory/`.
 * Each memory is a markdown file with YAML frontmatter (same format as skills).
 */

import { z } from "zod";

// ============================================================================
// Constants
// ============================================================================

export const MEMORY_TYPES = ["user", "feedback", "project", "reference"] as const;

export const DEFAULT_MEMORY_DIR = ".agent-memory";

export const MEMORY_INDEX_FILENAME = "MEMORY.md";

export const DEFAULT_CONSOLIDATE_THRESHOLD = 15;

export const DEFAULT_MAX_INDEX_LINES = 200;

export const DEFAULT_MAX_INDEX_BYTES = 25 * 1024; // 25 KB

// ============================================================================
// Zod Schemas
// ============================================================================

export const memoryTypeSchema = z.enum(MEMORY_TYPES);

export const memoryMetadataSchema = z.object({
  name: z.string(),
  type: memoryTypeSchema,
  description: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const memorySchema = z.object({
  name: z.string(),
  type: memoryTypeSchema,
  description: z.string(),
  body: z.string(),
  filename: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// ============================================================================
// Types
// ============================================================================

export type MemoryType = z.infer<typeof memoryTypeSchema>;

export type MemoryMetadata = z.infer<typeof memoryMetadataSchema>;

export type Memory = z.infer<typeof memorySchema>;

export interface MemoryManagerConfig {
  /** Root path of the project */
  rootPath: string;
  /** Memory directory name (relative to rootPath). Default: `.agent-memory` */
  memoryDir?: string;
  /** Trigger consolidation when file count exceeds this. Default: 15 */
  consolidateThreshold?: number;
  /** Max lines in MEMORY.md index. Default: 200 */
  maxIndexLines?: number;
  /** Max bytes in MEMORY.md index. Default: 25KB */
  maxIndexBytes?: number;
}
