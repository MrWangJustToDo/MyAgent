/**
 * Worker-profile runner — spawns and executes context-isolated subagents.
 * Uses shared `runAgentOnce` for stream consume + detached outcome.
 */

import { ensureUIChannel, runAgentOnce } from "../run/run-agent-skeleton.js";
import { extractAssistantText } from "../stream/extract-assistant-text.js";
import { throwOnRunError } from "../stream/stream-errors.js";
import { clearStreamingOutput } from "../tools/util/streaming-callback.js";
import { generateId } from "../utils.js";

import { truncateSummary } from "./output.js";
import { buildExploreSystemPrompt } from "./prompt.js";
import { captureStreamFinishReason, deriveSubagentRunStats } from "./run-stats.js";
import { resolveSubagentBridgeUI, SUBAGENT_DEFAULT_MAX_ITERATIONS } from "./types.js";

import type { SubagentConfig, SubagentResult } from "./types.js";
import type { AgentManager } from "../../runtime-types/hosts.js";
import type { ModelMessage, UIMessage as TanStackUIMessage, UIMessage } from "@tanstack/ai";

export interface SubagentRunDeps {
  manager: AgentManager;
}

/**
 * Runs a subagent with fresh context to complete a delegated task.
 */
export async function runSubagent(config: SubagentConfig, deps: SubagentRunDeps): Promise<SubagentResult> {
  return executeSubagentRun(config, deps.manager);
}

/**
 * Get a subagent instance by ID.
 */
export function getSubagent(manager: AgentManager, subagentId: string) {
  return manager.getAgent(subagentId);
}

/**
 * Destroy a subagent by ID.
 */
export function destroySubagent(manager: AgentManager, subagentId: string) {
  manager.destroyAgent(subagentId);
}

async function executeSubagentRun(config: SubagentConfig, manager: AgentManager): Promise<SubagentResult> {
  const {
    subagentId: customId,
    prompt,
    description = "subtask",
    parentAgentId,
    parentTaskToolCallId,
    systemPrompt: customSystemPrompt,
    tools: customTools,
    maxIterations = SUBAGENT_DEFAULT_MAX_ITERATIONS,
    maxOutputLength,
    abortSignal,
    autoDestroy = true,
    aggregateUsageToParent = true,
    initialMessages,
  } = config;

  const bridgeUI = resolveSubagentBridgeUI(config);
  const subagentId = customId ?? generateId("subagent", { exists: (id) => manager.getAgent(id) != null });
  const systemPrompt = customSystemPrompt ?? buildExploreSystemPrompt(maxIterations);

  const parentManaged = manager.getAgent(parentAgentId);
  if (!parentManaged) {
    throw new Error(`Parent agent not found: ${parentAgentId}`);
  }

  const subagent = await manager.spawnSubagent(parentAgentId, {
    id: subagentId,
    name: `subagent-${description}`,
    systemPrompt,
    maxIterations,
    subagentTools: customTools,
  });

  // link task to agent, for unstable input
  subagent.parentTaskId = parentTaskToolCallId;

  const subagentManaged = manager.getAgent(subagentId);
  if (!subagentManaged) {
    throw new Error(`Subagent not found: ${subagentId}`);
  }

  const messages: ModelMessage[] = [...(initialMessages ?? []), { role: "user", content: prompt }];

  let channel = undefined;
  if (bridgeUI) {
    const userUIMessage: TanStackUIMessage = {
      id: generateId("msg"),
      role: "user",
      parts: [{ type: "text", content: prompt }],
      createdAt: new Date(),
    };

    if (parentTaskToolCallId) {
      clearStreamingOutput(parentTaskToolCallId, { agentId: parentAgentId });
    }

    channel = ensureUIChannel(subagentManaged, { initialMessages: [userUIMessage] });
  } else {
    subagentManaged.setUIChannel(undefined);
  }

  subagent.emitEvent("subagent:created", { subagentId }, { parentId: parentAgentId });
  subagent.emitEvent("subagent:started", { subagent_id: subagentId, description }, { parentId: parentAgentId });

  let output = "(no summary)";
  let aborted = false;
  let finishReason: string | null = null;
  let previewMessages: UIMessage[] = [];

  try {
    const result = await runAgentOnce({
      manager,
      agentId: subagentId,
      messages,
      abortSignal,
      consume: bridgeUI ? "ui" : "headless",
      channel,
      parentTaskToolCallId: bridgeUI ? parentTaskToolCallId : undefined,
      streamingAgentId: bridgeUI ? parentAgentId : undefined,
      onUpdate: bridgeUI
        ? (updated) => {
            subagentManaged.emitEvent(
              "subagent:ui-update",
              { subagentId, messageCount: updated.length },
              { parentId: parentAgentId }
            );
          }
        : undefined,
      transformStream: (stream) =>
        throwOnRunError(
          captureStreamFinishReason(stream, (reason) => {
            finishReason = reason;
          })
        ),
      // Detached path avoids task-panel ghosts; chat pump applies path:"chat" itself.
      outcome: { path: "detached", kind: "finished" },
    });
    previewMessages = result.messages;
    output = extractAssistantText(previewMessages)?.trim() || "(no summary)";
  } catch (err) {
    const managed = manager.getAgent(subagentId);
    if (managed?.status === "aborted") {
      aborted = true;
      subagentManaged.statusController.applyRunOutcome({
        kind: "aborted",
        messages: previewMessages,
        path: "detached",
      });
    } else {
      throw err;
    }
  }

  const { summary: finalOutput, truncated } = truncateSummary(output, maxOutputLength);
  const usage = subagentManaged.usage.getTotal();

  if (aggregateUsageToParent && parentManaged) {
    parentManaged.usage.addTotal(usage);
  }

  subagent.emitEvent(
    aborted ? "subagent:error" : "subagent:completed",
    aborted ? { subagentId, error: finalOutput } : { subagentId, summary: finalOutput },
    { parentId: parentAgentId }
  );

  if (autoDestroy) {
    manager.destroyAgent(subagentId);
  }

  const runStats = deriveSubagentRunStats({
    messages: previewMessages,
    maxIterations,
    finishReason,
    output: finalOutput,
    aborted,
    status: subagentManaged.status,
  });

  return {
    subagentId,
    output: finalOutput,
    truncated,
    iterations: runStats.iterations,
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    },
    reachedLimit: runStats.reachedLimit,
    incomplete: runStats.incomplete,
    aborted,
  };
}
