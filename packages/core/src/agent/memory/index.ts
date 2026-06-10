// Memory module exports
export { MemoryManager } from "./memory-manager.js";
export { extractMemories, consolidateMemories } from "./memory-extractor.js";
export { findRelevantMemories, formatRelevantMemories } from "./memory-retrieval.js";
export {
  MEMORY_TYPES,
  DEFAULT_MEMORY_DIR,
  MEMORY_INDEX_FILENAME,
  DEFAULT_CONSOLIDATE_THRESHOLD,
  DEFAULT_MAX_INDEX_LINES,
  DEFAULT_MAX_INDEX_BYTES,
  DEFAULT_MAX_RELEVANT_MEMORIES,
  DEFAULT_MAX_MEMORY_LINES_PER_FILE,
  DEFAULT_MAX_MEMORY_BYTES_PER_FILE,
  DEFAULT_MAX_SESSION_MEMORY_BYTES,
  memoryTypeSchema,
  memoryMetadataSchema,
  memorySchema,
  type MemoryType,
  type MemoryMetadata,
  type Memory,
  type MemoryManagerConfig,
} from "./types.js";
export type { RelevantMemory, FindRelevantMemoriesOptions } from "./memory-retrieval.js";
