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

import { generateId } from "../../base/utils.js";
import { agentManager, type AgentManager } from "../../managers/manager-agent.js";
import { emitHook } from "../hooks/hook-runner.js";
import { maybeCacheOutput } from "../tools/util/tool-output-cache.js";

import { extractSummary, truncateSummary } from "./output.js";
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

  const { agent: parentAgent, sandbox } = parentManagedAgent;

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
  const subagentTools = customTools !== undefined ? customTools : createSubagentTools(sandbox, subagentContext);
  subagent.setTools(subagentTools);
  subagent.customTools = {};

  // Emit subagent:created event
  agentManager.emit({
    type: "subagent:created",
    subagentId,
    parentId: parentAgentId,
    agent: subagent,
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

    // Emit subagent:step event
    agentManager.emit({
      type: "subagent:step",
      subagentId,
      parentId: parentAgentId,
      agent: subagent,
      data: { step: iterations, finishReason },
    });

    // Check if we hit the limit
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

      // Emit subagent:started event
      agentManager.emit({
        type: "subagent:started",
        subagentId,
        parentId: parentAgentId,
        agent: subagent,
      });

      emitHook(
        parentAgent.hookRegistry,
        "SubagentStart",
        {
          hook_event_name: "SubagentStart",
          session_id: parentAgent.getSessionData()?.id ?? parentAgentId,
          subagent_id: subagentId,
          description,
        },
        { logger: parentLog ?? undefined }
      );

      retries++;

      // reset step
      iterations = 0;

      // Run subagent - context was pre-seeded with initialMessages if provided
      // The prompt becomes the final user message
      // break the type, but current flow is ok, we will compact the message in prepareMessagesAsync function
      try {
        const result = await subagent.generate({
          prompt,
          messages: initialMessages || [],
          abortSignal,
          onStepFinish,
        });

        // Extract output from result
        const rawOutput = extractSummary(result);

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

        // Cache full output to disk when it's large, so the parent agent
        // can read_file the complete result via the cached path.
        // If cached, use the preview (head+tail with read_file hint) as output.
        // Otherwise fall back to truncateSummary for moderate-length output.
        let output: string;
        let truncated: boolean;
        let cachedOutputPath: string | null = null;

        if (sandbox) {
          const cached = await maybeCacheOutput(sandbox, rawOutput, `${subagentId}-task`);
          cachedOutputPath = cached.cachedOutputPath;
          if (cachedOutputPath) {
            output = cached.content;
            truncated = true;
          } else {
            ({ summary: output, truncated } = truncateSummary(rawOutput, maxOutputLength));
          }
        } else {
          ({ summary: output, truncated } = truncateSummary(rawOutput, maxOutputLength));
        }

        parentLog?.info("agent", "Subagent completed", {
          subagentId,
          iterations,
          reachedLimit,
          outputLength: output.length,
          truncated,
          cachedOutputPath,
          usage,
          output,
        });

        // Emit subagent:completed event
        agentManager.emit({
          type: "subagent:completed",
          subagentId,
          parentId: parentAgentId,
          agent: subagent,
          data: { summary: output, iterations },
        });

        emitHook(
          parentAgent.hookRegistry,
          "SubagentStop",
          {
            hook_event_name: "SubagentStop",
            session_id: parentAgent.getSessionData()?.id ?? parentAgentId,
            subagent_id: subagentId,
            summary: output,
          },
          { logger: parentLog ?? undefined }
        );

        return {
          subagentId,
          output,
          truncated,
          iterations,
          usage,
          reachedLimit,
          retries,
          cachedOutputPath,
        };
      } catch (error) {
        parentLog?.error("agent", "Subagent error", error as Error);

        // Emit subagent:error event
        agentManager.emit({
          type: "subagent:error",
          subagentId,
          parentId: parentAgentId,
          agent: subagent,
          data: { error: error instanceof Error ? error : new Error(String(error)) },
        });

        return {
          subagentId,
          output: (error as Error)?.message || "Unknown error",
          truncated: false,
          iterations: 0,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          reachedLimit: false,
          retries: retries,
          cachedOutputPath: null,
        };
      }
    }
  } finally {
    // Emit subagent:destroyed event before cleanup
    if (autoDestroy) {
      agentManager.emit({
        type: "subagent:destroyed",
        subagentId,
        parentId: parentAgentId,
        agent: subagent,
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
