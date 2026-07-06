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
import { emitAgentEvent } from "../loop/emit-agent-event.js";
import { clearStreamingOutput } from "../tools/util/streaming-callback.js";
import { generateId } from "../utils.js";

import { consumeSubagentUIStream } from "./consume-subagent-ui-stream.js";
import { extractAssistantText } from "./extract-assistant-text.js";
import { truncateSummary } from "./output.js";
import { buildExploreSystemPrompt } from "./prompt.js";
import { subagentPreviewStore } from "./subagent-preview-store.js";
import { createSubagentTools } from "./tools.js";
import { SUBAGENT_DEFAULT_MAX_ITERATIONS, SUBAGENT_MAX_RETRIES } from "./types.js";

import type { SubagentConfig, SubagentResult } from "./types.js";
import type { UIMessage } from "ai";

type UsageSnapshot = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
};

function diffUsage(current: UsageSnapshot, before: UsageSnapshot): UsageSnapshot {
  return {
    inputTokens: current.inputTokens - before.inputTokens,
    outputTokens: current.outputTokens - before.outputTokens,
    totalTokens: current.totalTokens - before.totalTokens,
    cacheReadTokens: (current.cacheReadTokens ?? 0) - (before.cacheReadTokens ?? 0),
    cacheWriteTokens: (current.cacheWriteTokens ?? 0) - (before.cacheWriteTokens ?? 0),
    reasoningTokens: (current.reasoningTokens ?? 0) - (before.reasoningTokens ?? 0),
  };
}

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
 * Internally uses subagent.stream() for execution (status changes, tool lifecycle).
 */
export async function runSubagent(config: SubagentConfig): Promise<SubagentResult> {
  const {
    subagentId: customId,
    prompt,
    description = "subtask",
    parentAgentId,
    parentTaskToolCallId,
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
  let lastStepNaturalEnd = false; // last step finished with a final text answer (no tool call, finishReason "stop")
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

  emitAgentEvent(subagent, "subagent:created", {
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

    emitAgentEvent(subagent, "subagent:step", {
      parentId: parentAgentId,
      data: { subagentId, step: iterations, finishReason },
    });

    // A natural end is a final text answer with no tool call. Anything else
    // (tool-calls, length, etc.) means the loop will continue or be force-
    // stopped by a stop condition (step cap / stall detector). We record this
    // so the final result can report whether the subagent truly finished.
    lastStepNaturalEnd = finishReason === "stop";

    if (iterations >= maxIterations) {
      reachedLimit = true;
    }
  };

  try {
    while (true) {
      if (retries > maxRetried) {
        throw new Error("max retry for current task");
      }

      const usageBeforeAttempt: UsageSnapshot = { ...usage };

      subagent.todoManager?.reset();
      subagent.context?.reset();
      subagent.context?.resetUsage();
      subagentPreviewStore.clear(subagentId);
      if (parentTaskToolCallId) {
        clearStreamingOutput(parentTaskToolCallId);
      }

      const aggregateAttemptUsage = () => {
        if (!aggregateUsageToParent || !parentContext) return;
        parentContext.addTotalUsage(diffUsage(usage, usageBeforeAttempt));
      };

      emitAgentEvent(subagent, "subagent:started", {
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
      lastStepNaturalEnd = false;
      reachedLimit = false;

      // Run subagent via stream() — onStepFinish tracks iterations; UI uses UIMessage preview store.
      try {
        const userUIMessage: UIMessage = {
          id: generateId("msg"),
          role: "user",
          parts: [{ type: "text", text: prompt }],
        };
        const initialUIMessages: UIMessage[] = [userUIMessage];

        const streamResult = await subagent.stream({
          messages: [...(initialMessages || []), { role: "user" as const, content: prompt }],
          abortSignal,
          onStepEnd: onStepFinish,
        });

        const previewMessages = await consumeSubagentUIStream({
          subagentId,
          stream: streamResult.stream,
          tools: subagent.tools,
          initialMessages: initialUIMessages,
          parentTaskToolCallId,
          onUpdate: (messages) => {
            emitAgentEvent(subagent, "subagent:ui-update", {
              parentId: parentAgentId,
              data: { subagentId, messageCount: messages.length },
            });
          },
        });

        const rawOutput = extractAssistantText(previewMessages)?.trim() || "(no summary)";

        aggregateAttemptUsage();

        // streamText does NOT throw on abort — it resolves normally with
        // whatever partial text was generated. The abort is signalled via
        // the subagent's status ("aborted", set by onAbort). Check it here
        // so we don't mistake a cancelled run for a successful (possibly
        // empty) completion and either retry or return partial results.
        if (subagent.status === "aborted") {
          parentLog?.warn("agent", "Subagent aborted", { subagentId, iterations, usage });

          emitAgentEvent(subagent, "subagent:error", {
            parentId: parentAgentId,
            data: { subagentId, error: "Subagent aborted" },
          });

          return {
            subagentId,
            output: `(subagent cancelled by user after ${iterations} iteration${iterations === 1 ? "" : "s"}; no results available)`,
            truncated: false,
            iterations,
            usage,
            reachedLimit: false,
            incomplete: true,
            retries: retries,
            aborted: true,
          };
        }

        // `incomplete` = the loop was force-stopped (step cap or stall
        // detector) rather than reaching a natural final answer. Such runs
        // should NOT be retried on empty output: a stalled/exhausted subagent
        // will just stall again, wasting tokens. Only retry when the model
        // reached a natural end but happened to emit no text (rare glitch).
        const incomplete = !lastStepNaturalEnd;

        if (retryOnEmpty && !incomplete && (!rawOutput || rawOutput === "(no summary)")) {
          parentLog?.warn("agent", "Subagent output empty", {
            subagentId,
            retries,
          });

          continue;
        }

        // When the run was force-stopped with no usable output, give the
        // parent agent an explicit message instead of an empty string, so it
        // knows the subtask could not be completed.
        let effectiveOutput = rawOutput;
        if (incomplete && (!effectiveOutput || effectiveOutput === "(no summary)")) {
          effectiveOutput = reachedLimit
            ? `(subagent hit the ${maxIterations}-step iteration limit without finishing; no summary produced)`
            : `(subagent stalled after ${iterations} step${iterations === 1 ? "" : "s"} of tool calls with no textual progress; no summary produced)`;
        }

        const { summary: output, truncated } = truncateSummary(effectiveOutput, maxOutputLength);

        // Append an incompleteness notice (after truncation) so the parent
        // agent is aware the findings may be partial and can decide whether
        // to re-delegate with a narrower scope or a different strategy.
        const finalOutput = incomplete
          ? `${output}${output.endsWith("\n") ? "" : "\n\n"}[${
              reachedLimit
                ? `reached the ${maxIterations}-step iteration limit`
                : `stalled after ${iterations} unproductive step${iterations === 1 ? "" : "s"}`
            }; findings may be incomplete]`
          : output;

        parentLog?.info("agent", "Subagent completed", {
          subagentId,
          iterations,
          reachedLimit,
          incomplete,
          outputLength: finalOutput.length,
          truncated,
          usage,
          output: finalOutput,
        });

        emitAgentEvent(subagent, "subagent:completed", {
          parentId: parentAgentId,
          data: {
            subagent_id: subagentId,
            session_id: parentAgent.getSessionData()?.id ?? parentAgentId,
            summary: finalOutput,
            iterations,
            incomplete,
          },
        });

        return {
          subagentId,
          output: finalOutput,
          truncated,
          iterations,
          usage,
          reachedLimit,
          incomplete,
          retries,
          aborted: false,
        };
      } catch (error) {
        aggregateAttemptUsage();

        const isAborted = error instanceof Error && (error.name === "AbortError" || error.message.includes("aborted"));

        if (isAborted) {
          parentLog?.warn("agent", "Subagent aborted", { subagentId, iterations, usage });
        } else {
          parentLog?.error("agent", "Subagent error", error as Error);
        }

        emitAgentEvent(subagent, "subagent:error", {
          parentId: parentAgentId,
          data: { subagentId, error: error instanceof Error ? error.message : String(error) },
        });

        // Preserve the real iterations/usage accumulated before the error
        // (onStepFinish fires per step, so these reflect actual progress).
        // For aborts, give a clear cancellation message instead of the raw
        // AbortError text so the parent LLM understands the task was cancelled.
        return {
          subagentId,
          output: isAborted
            ? `(subagent cancelled by user after ${iterations} iteration${iterations === 1 ? "" : "s"}; no results available)`
            : (error as Error)?.message || "Unknown error",
          truncated: false,
          iterations,
          usage,
          reachedLimit: false,
          incomplete: true,
          retries: retries,
          aborted: isAborted,
        };
      }
    }
  } finally {
    if (autoDestroy) {
      emitAgentEvent(subagent, "subagent:destroyed", {
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
