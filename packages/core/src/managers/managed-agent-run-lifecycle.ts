/**
 * Prepare / finalize / abort run lifecycle for {@link ManagedAgent}.
 */

import { convertMessagesToModelMessages, type ModelMessage, type UIMessage as TanStackUIMessage } from "@tanstack/ai";

import { getLatestUserMessage } from "../agent/compaction/message-utils.js";
import { isToolContinuationPrepare } from "../agent/utils/tool-phase-utils.js";

import type { AgentManager } from "./agent-manager.js";
import type { RunFinalizeReason } from "./agent-types.js";
import type { ManagedAgent } from "./managed-agent.js";

/** Lifecycle helpers operate on the full ManagedAgent surface (type-only import). */
export type RunLifecycleHost = ManagedAgent;

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
  }

  const inputMessages = options.messages || [];

  host.run.setupAbortController(options.abortSignal, {
    onAborted: () => {
      host.setStatus("aborted");
    },
  });
  host.run.resetReactiveCompactRetries();

  // Always consume the flag (avoid `||` short-circuit leaving a stale continuation mark).
  const flaggedContinuation = host.consumePrepareAsContinuation() === true;
  const isToolContinuation = isToolContinuationPrepare(host.status, options.messages) || flaggedContinuation;
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

    // Snapshot once per user turn — admit into UI when payload changes (epoch-style).
    await host.collectExtensionPromptHooks(typeof options.prompt === "string" ? options.prompt : "(structured)");
    await host.captureTurnContextSnapshot();
    host.admitTurnContextIfNeeded();

    const userMsg = typeof options.prompt === "string" ? options.prompt : "(structured)";
    host.emitEvent("prompt:submit", {
      prompt: userMsg,
      contextMessageCount: (host.ui?.getMessages() ?? inputMessages).length,
    });
  }

  // Baseline after optional turn_context admission so engine/UI lengths stay aligned.
  const baselineMessages = (host.ui?.getMessages() ?? host.context?.getUIMessages() ?? options.messages) as
    | TanStackUIMessage[]
    | undefined;
  if (baselineMessages?.length) {
    host.syncContextFromUIMessages(baselineMessages);
    host.context?.setRunBaselineCount(convertMessagesToModelMessages(baselineMessages).length);
  }
}

export function finalizeManagedAgentRun(
  host: RunLifecycleHost,
  manager: AgentManager,
  reason: RunFinalizeReason
): void {
  // Idempotent per turn — pump `stop()` and outcome paths may both attempt finalize.
  if (!host.beginTurnFinalize()) return;

  host.clearPrepareAsContinuation();
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
