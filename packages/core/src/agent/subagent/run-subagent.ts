/**
 * Subagent runner — spawns and executes context-isolated subagents.
 */

import { AgentUIChannel } from "../../managers/agent-ui-channel.js";
import { emitAgentEvent } from "../../managers/emit-agent-event.js";
import { clearStreamingOutput } from "../tools/util/streaming-callback.js";
import { generateId } from "../utils.js";

import { extractAssistantText } from "./extract-assistant-text.js";
import { truncateSummary } from "./output.js";
import { buildExploreSystemPrompt } from "./prompt.js";
import { captureStreamFinishReason, deriveSubagentRunStats } from "./run-stats.js";
import { createSubagentTools } from "./tools.js";
import { SUBAGENT_DEFAULT_MAX_ITERATIONS } from "./types.js";

import type { SubagentConfig, SubagentResult } from "./types.js";
import type { AgentManager } from "../../managers/manager-agent.js";
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

  const subagentId = customId ?? generateId("subagent");
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
  });

  const subagentManaged = manager.getAgent(subagentId);
  if (!subagentManaged) {
    throw new Error(`Subagent not found: ${subagentId}`);
  }

  subagentManaged.tools = customTools !== undefined ? customTools : createSubagentTools(subagentManaged.usage);
  subagentManaged.runner = undefined;
  subagentManaged.tanstackTools = undefined;

  const messages: ModelMessage[] = [
    ...(initialMessages as unknown as ModelMessage[]),
    { role: "user", content: prompt },
  ];

  const userUIMessage: TanStackUIMessage = {
    id: generateId("msg"),
    role: "user",
    parts: [{ type: "text", content: prompt }],
    createdAt: new Date(),
  };

  if (parentTaskToolCallId) {
    clearStreamingOutput(parentTaskToolCallId);
  }

  const channel = new AgentUIChannel({ initialMessages: [userUIMessage] });
  subagentManaged.ui = channel;

  emitAgentEvent(subagent, "subagent:created", { parentId: parentAgentId, data: { subagentId } });
  emitAgentEvent(subagent, "subagent:started", {
    parentId: parentAgentId,
    data: { subagent_id: subagentId, description },
  });

  let output = "(no summary)";
  let aborted = false;
  let finishReason: string | null = null;
  let previewMessages: UIMessage[] = [];

  try {
    const rawStream = await manager.runAgent(subagentId, { messages, abortSignal });
    const stream = captureStreamFinishReason(rawStream, (reason) => {
      finishReason = reason;
    });
    previewMessages = (await channel.consumeRun({
      stream,
      parentTaskToolCallId,
      onUpdate: (updated) => {
        emitAgentEvent(subagent, "subagent:ui-update", {
          parentId: parentAgentId,
          data: { subagentId, messageCount: updated.length },
        });
      },
    })) as unknown as UIMessage[];
    output = extractAssistantText(previewMessages)?.trim() || "(no summary)";
  } catch (err) {
    const managed = manager.getAgent(subagentId);
    if (managed?.status === "aborted") {
      aborted = true;
    } else {
      throw err;
    }
  }

  const { summary: finalOutput, truncated } = truncateSummary(output, maxOutputLength);
  const usage = subagentManaged.usage.getTotal();

  if (aggregateUsageToParent && parentManaged) {
    parentManaged.usage.addTotal(usage);
  }

  emitAgentEvent(subagent, aborted ? "subagent:error" : "subagent:completed", {
    parentId: parentAgentId,
    data: { subagentId, output: finalOutput },
  });

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
