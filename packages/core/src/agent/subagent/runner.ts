/**
 * Subagent runner — spawns and executes context-isolated subagents.
 *
 * Uses AgentManager to create a child agent with fresh context,
 * configurable tools and system prompt, then runs it to completion.
 *
 * @example
 * ```typescript
 * // For task exploration (default)
 * const result = await runSubagent({
 *   prompt: "Find what testing framework this project uses",
 *   parentAgentId: agent.id,
 * });
 *
 * // For compaction (no tools, custom prompt)
 * const result = await runSubagent({
 *   prompt: conversationText,
 *   parentAgentId: agent.id,
 *   systemPrompt: COMPACTION_PROMPT,
 *   tools: {}, // No tools
 *   maxIterations: 1, // Single pass
 *   description: "compaction",
 * });
 * ```
 */

import { agentManager, type AgentManager } from "../../managers/manager-agent.js";
import { generateId } from "../utils.js";

import { truncateSummary } from "./output.js";
import { buildExploreSystemPrompt } from "./prompt.js";
import { createSubagentTools } from "./tools.js";
import { SUBAGENT_DEFAULT_MAX_ITERATIONS, SUBAGENT_MAX_RETRIES } from "./types.js";

import type { SubagentConfig, SubagentResult } from "./types.js";

/**
 * Runs a subagent with fresh context to complete a delegated task.
 *
 * Uses AgentManager to spawn a proper subagent with:
 * 1. Parent/child relationship tracking
 * 2. Fresh context (empty messages)
 * 3. Configurable tools (default: read-only exploration tools)
 * 4. Configurable system prompt (default: exploration prompt)
 * 5. Accessible via agentManager.getAgent(subagentId)
 *
 * Internally uses subagent.stream() for execution, which enables real-time
 * streaming behavior (onChunk → context.emitStream, status changes).
 */
export async function runSubagent(config: SubagentConfig): Promise<SubagentResult> {
  const {
    subagentId: customId,
    prompt,
    description = "subtask",
    parentAgentId,
    systemPrompt: customSystemPrompt,
    tools: customTools,
    maxIterations = SUBAGENT_DEFAULT_MAX_ITERATIONS,
    maxRetried = SUBAGENT_MAX_RETRIES,
    maxOutputLength,
    retryOnEmpty = true,
    abortSignal,
    autoDestroy = true,
    aggregateUsageToParent = true,
    initialMessages,
  } = config;

  // Build system prompt: use custom if provided, otherwise generate with actual maxIterations
  const systemPrompt = customSystemPrompt ?? buildExploreSystemPrompt(maxIterations);

  // Generate or use custom subagent ID
  const subagentId = customId ?? generateId("subagent");

  // Get parent managed agent from AgentManager
  const parentManagedAgent = agentManager.getAgent(parentAgentId);
  if (!parentManagedAgent) {
    throw new Error(`Parent agent not found: ${parentAgentId}`);
  }

  const { agent: parentAgent } = parentManagedAgent;

  // Get resources from parent agent
  const parentContext = parentAgent.getContext();
  const parentLog = parentAgent.getLog();

  parentLog?.info("agent", `Starting subagent: ${description}`, { systemPrompt, subagentId, prompt, initialMessages });

  // Track iterations and usage
  let iterations = 0;
  let reachedLimit = false;
  let retries = 0;
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  };

  // Spawn subagent via AgentManager (creates parent/child relationship)
  // Inherits model, languageModel, rootPath from parent config
  const subagent = await agentManager.spawnSubagent(parentAgentId, {
    id: subagentId,
    name: `subagent-${description}`,
    systemPrompt,
    maxIterations,
  });

  // Set tools - use custom tools if provided, otherwise use read-only exploration tools.
  // Always clear customTools added by createManagedAgent (todo, webfetch, websearch)
  // since subagents should only have their explicitly configured tool set.
  const subagentContext = subagent.getContext() ?? undefined;
  const subagentTools = customTools !== undefined ? customTools : createSubagentTools(subagentContext);
  subagent.setTools(subagentTools);
  subagent.customTools = {};

  agentManager.emit({
    type: "subagent:created",
    agentId: subagentId,
    parentId: parentAgentId,
    data: { subagentId },
  });

  // Helper to track step progress
  const onStepFinish = (event: {
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
      outputTokenDetails?: { reasoningTokens?: number };
    };
    finishReason?: string;
  }) => {
    iterations++;
    const { usage: stepUsage, finishReason } = event;

    if (stepUsage) {
      usage.inputTokens += stepUsage.inputTokens ?? 0;
      usage.outputTokens += stepUsage.outputTokens ?? 0;
      usage.totalTokens += (stepUsage.inputTokens ?? 0) + (stepUsage.outputTokens ?? 0);
      usage.cacheReadTokens += stepUsage.inputTokenDetails?.cacheReadTokens ?? 0;
      usage.cacheWriteTokens += stepUsage.inputTokenDetails?.cacheWriteTokens ?? 0;
      usage.reasoningTokens += stepUsage.outputTokenDetails?.reasoningTokens ?? 0;
    }

    parentLog?.debug("agent", `Subagent step ${iterations}`, { subagentId, finishReason });

    agentManager.emit({
      type: "subagent:step",
      agentId: subagentId,
      parentId: parentAgentId,
      data: { subagentId, step: iterations, finishReason },
    });

    if (iterations >= maxIterations) {
      reachedLimit = true;
    }
  };

  try {
    while (true) {
      if (retries > maxRetried) {
        throw new Error("max retry for current task");
      }

      subagent.todoManager?.reset();
      subagent.context?.reset();
      subagent.context?.resetUsage();

      agentManager.emit({
        type: "subagent:started",
        agentId: subagentId,
        parentId: parentAgentId,
        data: {
          subagent_id: subagentId,
          session_id: parentAgent.getSessionData()?.id ?? parentAgentId,
          description,
        },
      });

      retries++;

      // reset step
      iterations = 0;

      // Run subagent via stream() - enables real-time streaming behavior:
      // - onChunk → context.emitStream for UI streaming
      // - onStepFinish → tracks iteration count and usage
      // - onFinish → finalizes session
      // streamResult.text drives stream consumption internally.
      try {
        const streamResult = await subagent.stream({
          prompt,
          messages: initialMessages || [],
          abortSignal,
          onStepFinish,
        });

        // streamResult.text drives stream consumption internally.
        // All callbacks (onChunk, onStepFinish, onFinish) fire during consumption.
        const rawOutput = (await streamResult.text)?.trim() || "(no summary)";

        // Aggregate usage to parent's context
        if (aggregateUsageToParent && parentContext) {
          parentContext.addTotalUsage(usage);
        }

        if (retryOnEmpty && (!rawOutput || rawOutput === "(no summary)")) {
          parentLog?.warn("agent", "Subagent output empty", {
            subagentId,
            retries,
          });

          continue;
        }

        const { summary: output, truncated } = truncateSummary(rawOutput, maxOutputLength);

        parentLog?.info("agent", "Subagent completed", {
          subagentId,
          iterations,
          reachedLimit,
          outputLength: output.length,
          truncated,
          usage,
          output,
        });

        agentManager.emit({
          type: "subagent:completed",
          agentId: subagentId,
          parentId: parentAgentId,
          data: {
            subagent_id: subagentId,
            session_id: parentAgent.getSessionData()?.id ?? parentAgentId,
            summary: output,
            iterations,
          },
        });

        return {
          subagentId,
          output,
          truncated,
          iterations,
          usage,
          reachedLimit,
          retries,
        };
      } catch (error) {
        parentLog?.error("agent", "Subagent error", error as Error);

        agentManager.emit({
          type: "subagent:error",
          agentId: subagentId,
          parentId: parentAgentId,
          data: { subagentId, error: error instanceof Error ? error.message : String(error) },
        });

        return {
          subagentId,
          output: (error as Error)?.message || "Unknown error",
          truncated: false,
          iterations: 0,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          reachedLimit: false,
          retries: retries,
        };
      }
    }
  } finally {
    if (autoDestroy) {
      agentManager.emit({
        type: "subagent:destroyed",
        agentId: subagentId,
        parentId: parentAgentId,
        data: { subagentId },
      });
      agentManager.destroyAgent(subagentId);
    }
  }
}

/**
 * Get a subagent instance by ID.
 */
export function getSubagent(am: AgentManager, subagentId: string) {
  return am.getAgent(subagentId);
}

/**
 * Destroy a subagent by ID.
 */
export function destroySubagent(am: AgentManager, subagentId: string) {
  am.destroyAgent(subagentId);
}
