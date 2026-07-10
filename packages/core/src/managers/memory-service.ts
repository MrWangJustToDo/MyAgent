/**
 * MemoryService — memory index state and per-turn memory operations.
 * Cross-subsystem data is passed in via input objects; no back-references to other services.
 */

import { extractTextFromContent } from "../agent/compaction/message-utils.js";
import { extractMemories, consolidateMemories } from "../agent/memory/memory-extractor.js";
import { findRelevantMemories, formatRelevantMemories } from "../agent/memory/memory-retrieval.js";
import { getEnv } from "../env.js";

import type { EmitAgentEventFn } from "./emit-agent-event.js";
import type { AgentManager } from "./manager-agent.js";
import type { UsageTracker } from "./usage-tracker.js";
import type { AgentContext } from "../agent/agent-context";
import type { AgentLog } from "../agent/agent-log";
import type { MemoryManager } from "../agent/memory/memory-manager.js";
import type { TextAdapterConfig } from "../models/adapter-factory.js";
import type { ModelMessage } from "@tanstack/ai";

export interface MemoryPrefetchInput {
  messages: ModelMessage[];
  usage: UsageTracker;
  log: AgentLog | null;
  resolveTextAdapter?: () => Promise<TextAdapterConfig | null>;
  emitEvent?: EmitAgentEventFn;
}

export interface MemoryExtractionInput {
  agentId: string;
  context: AgentContext;
  log: AgentLog | null;
  manager: AgentManager;
  emitEvent?: EmitAgentEventFn;
}

export class MemoryService {
  private manager: MemoryManager | null = null;
  private content = "";
  private relevantContent = "";
  private alreadySurfaced = new Set<string>();
  private extractionInProgress = false;
  private pendingSurfacedFilenames: string[] = [];

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

  async prefetchRelevantMemories(input: MemoryPrefetchInput): Promise<void> {
    const { messages, usage, log, resolveTextAdapter, emitEvent } = input;
    if (!this.manager) {
      emitEvent?.("memory:prefetch", { status: "skip-no-manager" });
      return;
    }

    let query = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "user") {
        query = extractTextFromContent(msg.content);
        break;
      }
    }

    if (!query.trim()) {
      this.relevantContent = "";
      emitEvent?.("memory:prefetch", { status: "skip-no-query" });
      return;
    }

    try {
      const textAdapter = (await resolveTextAdapter?.()) ?? null;
      const relevant = await findRelevantMemories(
        query,
        this.manager,
        textAdapter,
        this.alreadySurfaced,
        {},
        usage,
        log ?? undefined
      );

      if (relevant.length > 0) {
        this.relevantContent = formatRelevantMemories(relevant);
        this.pendingSurfacedFilenames = relevant.map((r) => r.filename);
        emitEvent?.("memory:prefetch", {
          status: "injected",
          count: relevant.length,
          filenames: this.pendingSurfacedFilenames,
          byteSize: getEnv().byteLength(this.relevantContent, "utf-8"),
        });
      } else {
        this.relevantContent = "";
        this.pendingSurfacedFilenames = [];
        emitEvent?.("memory:prefetch", { status: "empty" });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.relevantContent = "";
      this.pendingSurfacedFilenames = [];
      emitEvent?.("memory:prefetch", { status: "error", error: errorMsg });
    }
  }

  runExtraction(input: MemoryExtractionInput): void {
    const { agentId, context, manager: agentManager, emitEvent } = input;
    if (!this.manager || !context) return;
    if (this.extractionInProgress) {
      emitEvent?.("memory:extract", { status: "skip-in-progress" });
      return;
    }

    const canon = context.getCanonicalFromUI();
    const messages = context.getMessagesForLLM(canon);
    if (messages.length < 15) {
      emitEvent?.("memory:extract", { status: "skip-short", count: messages.length });
      return;
    }

    const memoryManager = this.manager;

    this.extractionInProgress = true;
    emitEvent?.("memory:extract", { status: "start" });

    (async () => {
      try {
        const count = await extractMemories(messages, memoryManager, agentId, agentManager);
        if (count > 0) {
          await memoryManager.flushIndex();
          this.content = memoryManager.getIndexContent();
          emitEvent?.("memory:extract", { status: "complete", count });
        } else {
          emitEvent?.("memory:extract", { status: "empty" });
        }

        const memoryCount = await memoryManager.getMemoryCount();
        if (memoryCount >= memoryManager.getConsolidateThreshold()) {
          emitEvent?.("memory:consolidate", { status: "start", count: memoryCount });
          const result = await consolidateMemories(memoryManager, agentId, agentManager);
          if (result.changed) {
            await memoryManager.flushIndex();
            this.content = memoryManager.getIndexContent();
            emitEvent?.("memory:consolidate", {
              status: "complete",
              before: memoryCount,
              after: result.count,
            });
          } else {
            emitEvent?.("memory:consolidate", { status: "skip", count: memoryCount });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        emitEvent?.("memory:extract", { status: "error", error: errorMsg });
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
