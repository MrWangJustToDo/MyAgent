/**
 * MemoryHandler — memory state and operations extracted from Base.
 *
 * Manages the memory system lifecycle: storing/retrieving the MEMORY.md index,
 * prefetching relevant memories per turn, and background extraction/consolidation.
 *
 * Used as the bottom of the mixin chain: MemoryHandler <- SessionHandler <- Base.
 */

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
    if (!this.memoryManager) return;

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
        this.context
      );

      if (relevant.length > 0) {
        this.markMemoriesSurfaced(relevant.map((r) => r.filename));
        this.relevantMemoryContent = formatRelevantMemories(relevant);
        this.log?.info("memory", `Loaded ${relevant.length} relevant memories`, {
          filenames: relevant.map((r) => r.filename),
        });
      } else {
        this.relevantMemoryContent = "";
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.log?.warn("memory", `Relevant memory prefetch failed: ${errorMsg}`);
      this.relevantMemoryContent = "";
    }
  }

  /**
   * Run background memory extraction after each turn.
   * Fire-and-forget: errors are logged but never block the agent.
   */
  protected runMemoryExtraction(): void {
    if (!this.memoryManager || !this.context) return;

    const messages = this.context.getMessages();
    if (messages.length < 15) return;

    const manager = this.memoryManager;
    const agentId = this.agentId;

    this.log?.notify("memory", "info", "Extracting memories...");

    (async () => {
      try {
        const count = await extractMemories(messages, manager, agentId);
        if (count > 0) {
          this.memoryContent = manager.getIndexContent();
          this.log?.notify("memory", "success", `Extracted ${count} new memories`, { count });
        }

        const memoryCount = await manager.getMemoryCount();
        if (memoryCount >= manager.getConsolidateThreshold()) {
          this.log?.notify("memory", "info", "Consolidating memories...");
          const after = await consolidateMemories(manager, agentId);
          if (after > 0) {
            this.memoryContent = manager.getIndexContent();
            this.log?.notify("memory", "success", `Consolidated memories: ${memoryCount} → ${after}`, {
              before: memoryCount,
              after,
            });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.log?.notify("memory", "warning", `Memory extraction failed: ${errorMsg}`);
      }
    })();
  }

  /** Reset memory-related state. */
  protected resetMemoryState(): void {
    this.relevantMemoryContent = "";
    this.alreadySurfaced.clear();
  }
}
