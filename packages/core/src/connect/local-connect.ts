import { stream } from "@tanstack/ai-client";

import { agentManager } from "../managers/manager-agent.js";

import type { RunAgentStreamInput } from "../managers/run-agent.js";
import type { StreamChunk } from "@tanstack/ai";
import type { ConnectConnectionAdapter, RunAgentInputContext } from "@tanstack/ai-client";

// ============================================================================
// Local connect
// ============================================================================

export interface LocalConnectManager {
  runAgentStream(agentId: string, input: RunAgentStreamInput): AsyncIterable<StreamChunk>;
}

/**
 * In-process {@link ConnectConnectionAdapter} for CLI/app `useChat`.
 * Forwards `runContext` thread/run ids; delegates streaming to {@link AgentManager.runAgentStream}.
 */
export function createLocalConnect(agentId: string, manager: LocalConnectManager): ConnectConnectionAdapter {
  return {
    connect(messages, data, abortSignal, runContext?: RunAgentInputContext) {
      return manager.runAgentStream(agentId, toRunAgentStreamInput(messages, data, abortSignal, runContext));
    },
  };
}

/**
 * Default {@link createLocalConnect} using the global {@link agentManager} singleton.
 *
 * Also available via TanStack `stream()` for callers that do not need `runContext`:
 * ```typescript
 * stream((messages, data, abortSignal) =>
 *   agentManager.runAgentStream(agentId, { messages, data, abortSignal })
 * )
 * ```
 */
export function localConnect(agentId: string): ConnectConnectionAdapter {
  return stream((messages, data, abortSignal) => agentManager.runAgentStream(agentId, { messages, data, abortSignal }));
}

function toRunAgentStreamInput(
  messages: Parameters<ConnectConnectionAdapter["connect"]>[0],
  data: Record<string, unknown> | undefined,
  abortSignal: AbortSignal | undefined,
  runContext?: RunAgentInputContext
): RunAgentStreamInput {
  return {
    messages,
    data,
    abortSignal,
    threadId: runContext?.threadId,
    runId: runContext?.runId,
    parentRunId: runContext?.parentRunId,
    forwardedProps: runContext?.forwardedProps,
  };
}
