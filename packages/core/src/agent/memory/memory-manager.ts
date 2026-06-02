/**
 * MemoryManager - Manages persistent cross-session memory files.
 *
 * Stores memories as markdown files with YAML frontmatter in `.agent-memory/`.
 * Auto-generates a `MEMORY.md` index that is injected into the system prompt.
 *
 * Uses the sandbox filesystem for all I/O, ensuring compatibility with
 * local/native/remote sandboxes.
 *
 * @example
 * ```typescript
 * const manager = new MemoryManager({ sandbox, rootPath: "/project", logger });
 * await manager.initialize();
 *
 * await manager.writeMemory("user-prefers-tabs", "user", "Prefers tabs", "Details...");
 * const index = manager.getIndexContent();
 * ```
 */

import * as nodePath from "path";
import { parse as parseYaml } from "yaml";

import {
  DEFAULT_CONSOLIDATE_THRESHOLD,
  DEFAULT_MAX_INDEX_BYTES,
  DEFAULT_MAX_INDEX_LINES,
  DEFAULT_MEMORY_DIR,
  MEMORY_INDEX_FILENAME,
  memoryMetadataSchema,
} from "./types.js";

import type { Memory, MemoryManagerConfig, MemoryMetadata, MemoryType } from "./types.js";
import type { Sandbox } from "../../environment/types.js";
import type { AgentLog } from "../agent-log/agent-log.js";

// ============================================================================
// MemoryManager Class
// ============================================================================

export class MemoryManager {
  private sandbox: Sandbox;
  private rootPath: string;
  private memoryDir: string;
  private memoryPath: string;
  private indexPath: string;
  private logger?: AgentLog;
  private consolidateThreshold: number;
  private maxIndexLines: number;
  private maxIndexBytes: number;

  /** Cached index content for synchronous access in buildSystemPrompt() */
  private cachedIndex: string = "";

  constructor(sandbox: Sandbox, config: MemoryManagerConfig, logger?: AgentLog) {
    this.sandbox = sandbox;
    this.rootPath = config.rootPath;
    this.memoryDir = config.memoryDir ?? DEFAULT_MEMORY_DIR;
    this.memoryPath = nodePath.join(this.rootPath, this.memoryDir);
    this.indexPath = nodePath.join(this.memoryPath, MEMORY_INDEX_FILENAME);
    this.logger = logger;
    this.consolidateThreshold = config.consolidateThreshold ?? DEFAULT_CONSOLIDATE_THRESHOLD;
    this.maxIndexLines = config.maxIndexLines ?? DEFAULT_MAX_INDEX_LINES;
    this.maxIndexBytes = config.maxIndexBytes ?? DEFAULT_MAX_INDEX_BYTES;
  }

  /**
   * Ensure the memory directory exists and load the initial index.
   */
  async initialize(): Promise<void> {
    const exists = await this.sandbox.filesystem.exists(this.memoryPath);
    if (!exists) {
      await this.sandbox.filesystem.mkdir(this.memoryPath);
      this.logger?.info("memory", `Created memory directory: ${this.memoryDir}`);
    }

    // Load existing index into cache
    await this.refreshIndex();
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Get the cached MEMORY.md index content (synchronous).
   * This is what gets injected into the system prompt.
   */
  getIndexContent(): string {
    return this.cachedIndex;
  }

  /**
   * Read the full content of a specific memory file.
   */
  async readMemory(filename: string): Promise<string | null> {
    const filePath = nodePath.join(this.memoryPath, filename);
    try {
      const exists = await this.sandbox.filesystem.exists(filePath);
      if (!exists) return null;
      return await this.sandbox.filesystem.readFile(filePath);
    } catch {
      return null;
    }
  }

  /**
   * List all memory files with parsed metadata.
   */
  async listMemories(): Promise<Memory[]> {
    const result: Memory[] = [];

    try {
      const entries = await this.sandbox.filesystem.readdir(this.memoryPath);
      const mdFiles = entries
        .filter((e) => e.type === "file" && e.name.endsWith(".md") && e.name !== MEMORY_INDEX_FILENAME)
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of mdFiles) {
        try {
          const filePath = nodePath.join(this.memoryPath, entry.name);
          const content = await this.sandbox.filesystem.readFile(filePath);
          const { metadata, body } = this.parseFrontmatter(content);

          result.push({
            name: metadata?.name ?? entry.name.replace(/\.md$/, ""),
            type: metadata?.type ?? "user",
            description: metadata?.description ?? body.split("\n")[0]?.slice(0, 80) ?? "",
            body,
            filename: entry.name,
            createdAt: metadata?.createdAt,
            updatedAt: metadata?.updatedAt,
          });
        } catch {
          this.logger?.warn("memory", `Failed to parse memory file: ${entry.name}`);
        }
      }

      this.logger?.debug("memory", `Listed ${result.length} memories in ${this.memoryPath}`);
    } catch {
      this.logger?.debug("memory", "Failed to list memory directory");
    }

    return result;
  }

  /**
   * Get the count of memory files (excluding MEMORY.md).
   */
  async getMemoryCount(): Promise<number> {
    try {
      const entries = await this.sandbox.filesystem.readdir(this.memoryPath);
      return entries.filter((e) => e.type === "file" && e.name.endsWith(".md") && e.name !== MEMORY_INDEX_FILENAME)
        .length;
    } catch {
      return 0;
    }
  }

  /**
   * Get the consolidation threshold.
   */
  getConsolidateThreshold(): number {
    return this.consolidateThreshold;
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Write a memory file with YAML frontmatter, then rebuild the index.
   */
  async writeMemory(name: string, type: MemoryType, description: string, body: string): Promise<string> {
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const filename = `${slug}.md`;
    const filePath = nodePath.join(this.memoryPath, filename);

    const now = new Date().toISOString();

    // Check if file already exists to preserve createdAt
    let createdAt = now;
    try {
      const existing = await this.sandbox.filesystem.exists(filePath);
      if (existing) {
        const existingContent = await this.sandbox.filesystem.readFile(filePath);
        const { metadata } = this.parseFrontmatter(existingContent);
        if (metadata?.createdAt) {
          createdAt = metadata.createdAt;
        }
      }
    } catch {
      // New file
    }

    const content = [
      "---",
      `name: ${name}`,
      `type: ${type}`,
      `description: ${description}`,
      `createdAt: ${createdAt}`,
      `updatedAt: ${now}`,
      "---",
      "",
      body,
      "",
    ].join("\n");

    await this.sandbox.filesystem.writeFile(filePath, content);
    this.logger?.info("memory", `Wrote memory: ${filename}`);

    await this.refreshIndex();
    return filename;
  }

  /**
   * Delete a memory file, then rebuild the index.
   */
  async deleteMemory(filename: string): Promise<void> {
    const filePath = nodePath.join(this.memoryPath, filename);
    try {
      await this.sandbox.filesystem.remove(filePath);
      this.logger?.info("memory", `Deleted memory: ${filename}`);
    } catch {
      this.logger?.warn("memory", `Failed to delete memory: ${filename}`);
    }
    await this.refreshIndex();
  }

  /**
   * Delete all memory files (used during consolidation before rewriting).
   */
  async deleteAllMemories(): Promise<void> {
    try {
      const entries = await this.sandbox.filesystem.readdir(this.memoryPath);
      for (const entry of entries) {
        if (entry.type === "file" && entry.name.endsWith(".md") && entry.name !== MEMORY_INDEX_FILENAME) {
          const filePath = nodePath.join(this.memoryPath, entry.name);
          await this.sandbox.filesystem.remove(filePath);
        }
      }
    } catch {
      this.logger?.warn("memory", "Failed to delete all memory files");
    }
  }

  // ============================================================================
  // Index Management
  // ============================================================================

  /**
   * Rebuild the MEMORY.md index from all memory files, then update the cache.
   */
  async refreshIndex(): Promise<void> {
    const memories = await this.listMemories();
    const lines: string[] = [];

    for (const mem of memories) {
      lines.push(`- [${mem.name}](${mem.filename}) — ${mem.description}`);
      if (lines.length >= this.maxIndexLines) break;
    }

    const indexContent = lines.length > 0 ? lines.join("\n") + "\n" : "";

    // Apply size limit
    const bytes = Buffer.byteLength(indexContent, "utf-8");
    if (bytes > this.maxIndexBytes) {
      const truncated = indexContent.slice(0, this.maxIndexBytes);
      const lastNewline = truncated.lastIndexOf("\n");
      this.cachedIndex = lastNewline > 0 ? truncated.slice(0, lastNewline + 1) : truncated;
    } else {
      this.cachedIndex = indexContent;
    }

    // Write the index file
    try {
      await this.sandbox.filesystem.writeFile(this.indexPath, this.cachedIndex);
    } catch {
      this.logger?.warn("memory", "Failed to write MEMORY.md index");
    }
  }

  // ============================================================================
  // Frontmatter Parsing
  // ============================================================================

  /**
   * Parse YAML frontmatter from memory file content.
   * Reuses the same pattern as SkillLoader.parseFrontmatter().
   */
  private parseFrontmatter(text: string): { metadata: MemoryMetadata | null; body: string } {
    if (!text.startsWith("---")) {
      return { metadata: null, body: text.trim() };
    }

    const endIndex = text.indexOf("\n---", 3);
    if (endIndex === -1) {
      return { metadata: null, body: text.trim() };
    }

    const yamlContent = text.slice(4, endIndex).trim();
    const body = text.slice(endIndex + 4).trim();

    try {
      const parsed = parseYaml(yamlContent);
      const validated = memoryMetadataSchema.safeParse(parsed);

      if (!validated.success) {
        return { metadata: null, body: text.trim() };
      }

      return { metadata: validated.data, body };
    } catch {
      return { metadata: null, body: text.trim() };
    }
  }
}
