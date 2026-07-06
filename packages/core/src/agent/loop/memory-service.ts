/**
 * MemoryService — memory state and per-turn operations.
 *
 * Composed by Base; no longer part of the class inheritance chain.
 */

import { getEnv } from "../../env.js";
import { extractMemories, consolidateMemories } from "../memory/memory-extractor.js";
import { findRelevantMemories, formatRelevantMemories } from "../memory/memory-retrieval.js";

import type { AgentLoopHost } from "./agent-loop-host.js";
import type { MemoryManager } from "../memory/memory-manager.js";
import type { ModelMessage } from "ai";

export class MemoryService {
  private manager: MemoryManager | null = null;
  private content = "";
  private relevantContent = "";
  private alreadySurfaced = new Set<string>();
  private extractionInProgress = false;
  private pendingSurfacedFilenames: string[] = [];

  constructor(private readonly getHost: () => AgentLoopHost) {}

  setManager(manager: MemoryManager): void {
    this.manager = manager;
  }

  getManager(): MemoryManager | null {
    return this.manager;
  }

  setContent(content: string): void {
    this.content = content;
  }

  getContent(): string {
    return this.content;
  }

  getRelevantContent(): string {
    return this.relevantContent;
  }

  clearTurnContext(): void {
    this.relevantContent = "";
  }

  commitSurfacedMemories(): void {
    if (this.pendingSurfacedFilenames.length > 0) {
      for (const f of this.pendingSurfacedFilenames) {
        this.alreadySurfaced.add(f);
      }
      this.pendingSurfacedFilenames = [];
    }
  }

  async prefetchRelevantMemories(messages: ModelMessage[]): Promise<void> {
    const { log, model, context } = this.getHost();
    if (!this.manager) {
      log?.debug("memory", "No memory manager available, skipping prefetch");
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
      log?.debug("memory", "No user query found in messages, skipping memory prefetch");
      this.relevantContent = "";
      return;
    }

    try {
      const relevant = await findRelevantMemories(
        query,
        this.manager,
        model,
        this.alreadySurfaced,
        {},
        context,
        log ?? undefined
      );

      if (relevant.length > 0) {
        this.relevantContent = formatRelevantMemories(relevant);
        this.pendingSurfacedFilenames = relevant.map((r) => r.filename);
        log?.info("memory", `Injected ${relevant.length} relevant memories into context`, {
          filenames: this.pendingSurfacedFilenames,
          byteSize: getEnv().byteLength(this.relevantContent, "utf-8"),
        });
      } else {
        this.relevantContent = "";
        this.pendingSurfacedFilenames = [];
        log?.debug("memory", "No relevant memories found for this query");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log?.warn("memory", `Relevant memory prefetch failed: ${errorMsg}`);
      this.relevantContent = "";
      this.pendingSurfacedFilenames = [];
    }
  }

  runExtraction(): void {
    const { log, context, agentId } = this.getHost();
    if (!this.manager || !context) return;
    if (this.extractionInProgress) {
      log?.debug("memory", "Extraction already in progress, skipping");
      return;
    }

    const messages = context.getMessages();
    if (messages.length < 15) return;

    const manager = this.manager;

    this.extractionInProgress = true;
    log?.notify("memory", "info", "Extracting memories...");

    (async () => {
      try {
        const count = await extractMemories(messages, manager, agentId);
        if (count > 0) {
          await manager.flushIndex();
          this.content = manager.getIndexContent();
          log?.notify("memory", "success", `Extracted ${count} new memories`, { count });
        }

        const memoryCount = await manager.getMemoryCount();
        if (memoryCount >= manager.getConsolidateThreshold()) {
          log?.notify("memory", "info", "Consolidating memories...");
          const result = await consolidateMemories(manager, agentId);
          if (result.changed) {
            await manager.flushIndex();
            this.content = manager.getIndexContent();
            log?.notify("memory", "success", `Consolidated memories: ${memoryCount} → ${result.count}`, {
              before: memoryCount,
              after: result.count,
            });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log?.notify("memory", "warning", `Memory extraction failed: ${errorMsg}`);
      } finally {
        this.extractionInProgress = false;
      }
    })();
  }

  resetState(): void {
    this.relevantContent = "";
    this.pendingSurfacedFilenames = [];
    this.alreadySurfaced.clear();
  }
}
