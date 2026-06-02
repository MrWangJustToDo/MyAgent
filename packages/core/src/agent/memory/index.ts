// Memory module exports
export { MemoryManager } from "./memory-manager.js";
export { extractMemories, consolidateMemories } from "./memory-extractor.js";
export {
  MEMORY_TYPES,
  DEFAULT_MEMORY_DIR,
  MEMORY_INDEX_FILENAME,
  DEFAULT_CONSOLIDATE_THRESHOLD,
  DEFAULT_MAX_INDEX_LINES,
  DEFAULT_MAX_INDEX_BYTES,
  memoryTypeSchema,
  memoryMetadataSchema,
  memorySchema,
  type MemoryType,
  type MemoryMetadata,
  type Memory,
  type MemoryManagerConfig,
} from "./types.js";
