/**
 * MemoryHandler — memory state and operations extracted from Base.
 *
 * Manages the memory system lifecycle: storing/retrieving the MEMORY.md index,
 * prefetching relevant memories per turn, and background extraction/consolidation.
 *
 * Used as the bottom of the mixin chain: MemoryHandler <- SessionHandler <- Base.
 */

import { getEnv } from "../../env.js";
import { extractMemories, consolidateMemories } from "../memory/memory-extractor.js";
import { findRelevantMemories, formatRelevantMemories } from "../memory/memory-retrieval.js";

import type { AgentContext } from "../agent-context";
import type { AgentLog } from "../agent-log";
import type { MemoryManager } from "../memory/memory-manager.js";
import type { LanguageModel, ModelMessage } from "ai";

export class MemoryHandler {
  // Fields populated by subclasses (Base sets these)
  protected agentId: string = "";
  model: LanguageModel | null = null;
  log: AgentLog | null = null;
  context: AgentContext | null = null;

  // Memory state
  memoryManager: MemoryManager | null = null;
  memoryContent: string = "";
  relevantMemoryContent: string = "";
  private alreadySurfaced: Set<string> = new Set();
  private extractionInProgress = false;
  private pendingSurfacedFilenames: string[] = [];

  setMemoryManager(m: MemoryManager): void {
    this.memoryManager = m;
  }

  getMemoryManager(): MemoryManager | null {
    return this.memoryManager;
  }

  /** Set cached memory index content (for synchronous access in buildSystemPrompt). */
  setMemoryContent(content: string): void {
    this.memoryContent = content;
  }

  getMemoryContent(): string {
    return this.memoryContent;
  }

  /**
   * Get the set of memory filenames already surfaced this session.
   * Used by findRelevantMemories to avoid wasting selection slots on repeats.
   */
  getAlreadySurfaced(): ReadonlySet<string> {
    return this.alreadySurfaced;
  }

  /** Mark memory filenames as surfaced (adds to the session-scoped set). */
  markMemoriesSurfaced(filenames: string[]): void {
    for (const f of filenames) {
      this.alreadySurfaced.add(f);
    }
  }

  /**
   * Commit pending surfaced filenames into the alreadySurfaced set.
   * Call this after a successful LLM step to confirm injection was used.
   */
  commitSurfacedMemories(): void {
    if (this.pendingSurfacedFilenames.length > 0) {
      this.markMemoriesSurfaced(this.pendingSurfacedFilenames);
      this.pendingSurfacedFilenames = [];
    }
  }

  /** Set the formatted relevant memory content for the current turn. */
  setRelevantMemoryContent(content: string): void {
    this.relevantMemoryContent = content;
  }

  getRelevantMemoryContent(): string {
    return this.relevantMemoryContent;
  }

  /**
   * Prefetch relevant memories for the current turn.
   * Runs a lightweight LLM side-query (with keyword fallback) to select
   * memories whose full content should be injected into the system prompt.
   */
  async prefetchRelevantMemories(messages: ModelMessage[]): Promise<void> {
    if (!this.memoryManager) {
      this.log?.debug("memory", "No memory manager available, skipping prefetch");
      return;
    }

    let query = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "user") {
        if (typeof msg.content === "string") {
          query = msg.content;
        } else if (Array.isArray(msg.content)) {
          const textPart = msg.content.find((p) => p.type === "text");
          if (textPart && "text" in textPart) {
            query = textPart.text as string;
          }
        }
        break;
      }
    }

    if (!query.trim()) {
      this.log?.debug("memory", "No user query found in messages, skipping memory prefetch");
      this.relevantMemoryContent = "";
      return;
    }

    try {
      const relevant = await findRelevantMemories(
        query,
        this.memoryManager,
        this.model,
        this.alreadySurfaced,
        {},
        this.context,
        this.log ?? undefined
      );

      if (relevant.length > 0) {
        this.relevantMemoryContent = formatRelevantMemories(relevant);
        this.pendingSurfacedFilenames = relevant.map((r) => r.filename);
        this.log?.info("memory", `Injected ${relevant.length} relevant memories into context`, {
          filenames: this.pendingSurfacedFilenames,
          byteSize: getEnv().byteLength(this.relevantMemoryContent, "utf-8"),
        });
      } else {
        this.relevantMemoryContent = "";
        this.pendingSurfacedFilenames = [];
        this.log?.debug("memory", "No relevant memories found for this query");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.log?.warn("memory", `Relevant memory prefetch failed: ${errorMsg}`);
      this.relevantMemoryContent = "";
      this.pendingSurfacedFilenames = [];
    }
  }

  /**
   * Run background memory extraction after each turn.
   * Fire-and-forget: errors are logged but never block the agent.
   * Uses a single-flight lock to prevent concurrent extraction/consolidation.
   */
  protected runMemoryExtraction(): void {
    if (!this.memoryManager || !this.context) return;
    if (this.extractionInProgress) {
      this.log?.debug("memory", "Extraction already in progress, skipping");
      return;
    }

    const messages = this.context.getMessages();
    if (messages.length < 15) return;

    const manager = this.memoryManager;
    const agentId = this.agentId;

    this.extractionInProgress = true;
    this.log?.notify("memory", "info", "Extracting memories...");

    (async () => {
      try {
        const count = await extractMemories(messages, manager, agentId);
        if (count > 0) {
          await manager.flushIndex();
          this.memoryContent = manager.getIndexContent();
          this.log?.notify("memory", "success", `Extracted ${count} new memories`, { count });
        }

        const memoryCount = await manager.getMemoryCount();
        if (memoryCount >= manager.getConsolidateThreshold()) {
          this.log?.notify("memory", "info", "Consolidating memories...");
          const result = await consolidateMemories(manager, agentId);
          if (result.changed) {
            await manager.flushIndex();
            this.memoryContent = manager.getIndexContent();
            this.log?.notify("memory", "success", `Consolidated memories: ${memoryCount} → ${result.count}`, {
              before: memoryCount,
              after: result.count,
            });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.log?.notify("memory", "warning", `Memory extraction failed: ${errorMsg}`);
      } finally {
        this.extractionInProgress = false;
      }
    })();
  }

  /** Reset memory-related state. */
  protected resetMemoryState(): void {
    this.relevantMemoryContent = "";
    this.pendingSurfacedFilenames = [];
    this.alreadySurfaced.clear();
  }
}
