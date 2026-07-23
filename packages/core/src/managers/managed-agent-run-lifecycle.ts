/**
 * Prepare / finalize / abort run lifecycle for {@link ManagedAgent}.
 */

import { convertMessagesToModelMessages, type ModelMessage, type UIMessage as TanStackUIMessage } from "@tanstack/ai";

import { getLatestUserMessage } from "../agent/compaction/message-utils.js";
import { isToolContinuationPrepare } from "../agent/utils/tool-phase-utils.js";

import type { AgentEventType } from "./agent-event-bus.js";
import type { AgentStatus, RunFinalizeReason } from "./agent-types.js";
import type { AgentManager } from "./manager-agent.js";
import type { MemoryService } from "./memory-service.js";
import type { RunCoordinator } from "./run-coordinator.js";
import type { UsageTracker } from "./usage-tracker.js";
import type { AgentContext } from "../agent/agent-context";
import type { AgentLog } from "../agent/agent-log";
import type { TextAdapterConfig } from "../models/adapter-factory.js";

export interface RunLifecycleHost {
  id: string;
  parentId?: string;
  status: AgentStatus;
  context: AgentContext | null;
  usage: UsageTracker;
  memory: MemoryService;
  run: RunCoordinator;
  log: AgentLog | null;
  streamStartedAt: number;
  lastStreamDurationMs: number;
  resolveTextAdapter?: () => Promise<TextAdapterConfig | null>;
  syncContextFromUIMessages: (uiMessages: TanStackUIMessage[]) => void;
  setStatus: (status: AgentStatus) => void;
  emitEvent: (type: AgentEventType, data?: Record<string, unknown>) => void;
  persistSession: () => void;
  recordStreamDuration: () => void;
  captureTurnContextSnapshot: () => Promise<void>;
  clearTurnContext: () => void;
  /** Optional: mid-run steer / tool-phase continuation skips one-shot prepare work. */
  consumePrepareAsContinuation?: () => boolean;
}

export async function prepareManagedAgentForRun(
  host: RunLifecycleHost,
  options: {
    prompt?: string;
    messages?: Array<TanStackUIMessage | ModelMessage>;
    abortSignal?: AbortSignal;
  }
): Promise<void> {
  if (options.messages?.length) {
    host.syncContextFromUIMessages(options.messages as TanStackUIMessage[]);
    const baseline = convertMessagesToModelMessages(options.messages as TanStackUIMessage[]).length;
    host.context?.setRunBaselineCount(baseline);
  }

  const inputMessages = options.messages || [];

  host.run.setupAbortController(options.abortSignal, {
    onAborted: () => {
      host.setStatus("aborted");
    },
  });
  host.run.resetReactiveCompactRetries();

  const isToolContinuation =
    isToolContinuationPrepare(host.status, options.messages) || host.consumePrepareAsContinuation?.() === true;
  if (!isToolContinuation || host.streamStartedAt === 0) {
    host.streamStartedAt = Date.now();
  }

  if (!isToolContinuation && !host.parentId) {
    await host.memory.prefetchRelevantMemories({
      messages:
        getLatestUserMessage(options.prompt ? [{ role: "user", content: options.prompt }] : inputMessages) || [],
      usage: host.usage,
      log: host.log,
      resolveTextAdapter: host.resolveTextAdapter,
      emitEvent: (type, data) => host.emitEvent(type, data),
    });

    // Snapshot once per user turn — middleware reuses it across tool iterations.
    await host.captureTurnContextSnapshot();

    const userMsg = typeof options.prompt === "string" ? options.prompt : "(structured)";
    host.emitEvent("prompt:submit", {
      prompt: userMsg,
      contextMessageCount: inputMessages.length,
    });
  }
}

export function finalizeManagedAgentRun(
  host: RunLifecycleHost,
  manager: AgentManager,
  reason: RunFinalizeReason
): void {
  host.recordStreamDuration();
  host.persistSession();
  host.clearTurnContext();
  if (reason === "finished") {
    host.memory.runExtraction({
      agentId: host.id,
      context: host.context!,
      log: host.log,
      manager,
      emitEvent: (type, data) => host.emitEvent(type, data),
    });
  }
  host.emitEvent("agent:stop", { reason });
}

export function abortManagedAgentRun(host: RunLifecycleHost, reason?: string): void {
  host.emitEvent("agent:abort", { reason: reason ?? "(no reason)" });
  host.run.abort(reason ?? "user-cancelled");
  if (host.status !== "aborted" && host.status !== "idle" && host.status !== "completed") {
    host.setStatus("aborted");
  }
}
