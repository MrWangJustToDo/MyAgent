/**
 * Worker-profile runner — spawns and executes context-isolated subagents.
 * Uses shared `runAgentOnce` for stream consume + detached outcome.
 */

import { generateId } from "../../utils/generate-id.js";
import { ensureUIChannel, runAgentOnce } from "../run/run-agent-skeleton.js";
import { extractAssistantText } from "../stream/extract-assistant-text.js";
import { throwOnRunError } from "../stream/stream-errors.js";
import { getCurrentDate, getGitInfo } from "../turn-context/env-context.js";

import { applySubagentCancelNotice, truncateSummary } from "./output.js";
import { isProgressSummaryEligible, summarizeProgress } from "./progress-summary.js";
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
    compactSummaryStream,
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

  // Build minimal turn context (date + git) for subagent's environmental awareness.
  // Keeps subagent isolated while providing necessary time/workspace context.
  const envContext = await buildSubagentTurnContext();
  const tcMessages: ModelMessage[] = envContext
    ? [{ role: "user", content: `<turn_context>\n${envContext}\n</turn_context>` }]
    : [];

  const messages: ModelMessage[] = [...tcMessages, ...(initialMessages ?? []), { role: "user", content: prompt }];

  const userUIMessage: TanStackUIMessage = {
    id: generateId("msg"),
    role: "user",
    parts: [{ type: "text", content: prompt }],
    createdAt: new Date(),
  };

  // Always attach a channel (durable message SoT). bridgeUI only gates parent panel streaming.
  const channel = ensureUIChannel(subagentManaged, { initialMessages: [userUIMessage] });

  const summaryHub = bridgeUI || compactSummaryStream ? parentManaged.summaryStreams : undefined;
  const compactId = compactSummaryStream?.compactId;

  subagent.emitEvent("subagent:created", { subagentId }, { parentId: parentAgentId });
  subagent.emitEvent("subagent:started", { subagentId, description }, { parentId: parentAgentId });

  subagentManaged.resetTurnLifecycle();

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
      channel,
      parentTaskToolCallId: bridgeUI ? parentTaskToolCallId : undefined,
      streamingAgentId: bridgeUI ? parentAgentId : undefined,
      summaryHub,
      compactId,
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
      // Outcome applied below — abort ends the stream without throwing, so we must
      // not hardcode `finished` (that would clobber `aborted` / skip cancel notice).
    });
    previewMessages = result.messages;
    output = extractAssistantText(previewMessages)?.trim() || "(no summary)";
  } catch (err) {
    const managed = manager.getAgent(subagentId);
    if (managed?.status === "aborted" || managed?.isAbortError(err)) {
      aborted = true;
      previewMessages = channel?.getMessages() ?? previewMessages;
      output = extractAssistantText(previewMessages)?.trim() || "(no summary)";
    } else {
      // Non-abort failure: clear the subagent's partial history and roll the
      // task-tool phase back out of `summary` so the preview does not linger on
      // stale tool rows / summary text after a failed run.
      try {
        channel.failRun();
      } catch {
        // ignore cleanup errors while propagating the run failure
      }
      try {
        subagentManaged.finalizeRun(manager, "error");
      } catch {
        // ignore finalize errors while propagating the run failure
      }
      throw err;
    }
  }

  // Esc → managed.abort() sets status during consume; stream often completes without throw.
  aborted =
    aborted ||
    subagentManaged.status === "aborted" ||
    Boolean(subagentManaged.run.currentAbortController?.signal.aborted);

  const outcomeKind = aborted ? "aborted" : "finished";
  subagentManaged.statusController.applyRunOutcome({
    kind: outcomeKind,
    messages: previewMessages,
    path: "detached",
  });
  subagentManaged.finalizeRun(manager, outcomeKind);
  const noticed = applySubagentCancelNotice(output, aborted);
  let { summary: finalOutput, truncated } = truncateSummary(noticed, maxOutputLength);

  const runStats = deriveSubagentRunStats({
    messages: previewMessages,
    maxIterations,
    finishReason,
    output: finalOutput,
    aborted,
    status: subagentManaged.status,
  });

  // Snapshot status flags BEFORE the progress-summary fallback. The fallback may
  // replace the output text, but it must NEVER change the subagent's status
  // semantics: a step-budget cutoff stays reachedLimit=true + incomplete=true
  // even after a progress report replaces the empty output. Returning these
  // snapshots (not re-read runStats) keeps the contract explicit.
  const statusFlags = {
    iterations: runStats.iterations,
    reachedLimit: runStats.reachedLimit,
    incomplete: runStats.incomplete,
  };

  // Fallback: when the subagent hit the iteration budget before writing a final
  // answer (reachedLimit + incomplete + nothing usable in the output), spawn a
  // parent-owned summarizer that distills the execution trace into a structured
  // progress report. Failure is silent — the original output is kept unchanged.
  //
  // Gated to exploration subagents (default explore tools). Compaction / memory
  // summarizer subagents pass `tools: {}` — never fall back for them, or the
  // fallback would recursively spawn yet another summarizer.
  if (!customTools && isProgressSummaryEligible(statusFlags.incomplete, statusFlags.reachedLimit, finalOutput)) {
    const progressSummary = await summarizeProgress(previewMessages, parentAgentId, manager, prompt);
    if (progressSummary) {
      const truncatedResult = truncateSummary(progressSummary, maxOutputLength);
      finalOutput = truncatedResult.summary;
      truncated = truncatedResult.truncated;
    }
  }

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

  return {
    subagentId,
    output: finalOutput,
    truncated,
    iterations: statusFlags.iterations,
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    },
    reachedLimit: statusFlags.reachedLimit,
    incomplete: statusFlags.incomplete,
    aborted,
  };
}

/**
 * Build minimal environment turn context for subagents.
 *
 * Only includes `<current_date>` and `<git_status>` — no memory, todo, plan,
 * or extension context. This keeps subagents context-isolated while providing
 * necessary time/workspace awareness (e.g., for `websearch` time-sensitive queries).
 */
async function buildSubagentTurnContext(): Promise<string | undefined> {
  const currentDate = getCurrentDate();
  const { branch: gitBranch, status: gitStatus } = await getGitInfo();

  const parts: string[] = [];

  if (currentDate) {
    parts.push(["<current_date>", currentDate, "</current_date>"].join("\n"));
  }

  if (gitBranch || gitStatus) {
    const gitParts: string[] = [];
    if (gitBranch) {
      gitParts.push(`Branch: ${gitBranch}`);
    }
    if (gitStatus) {
      gitParts.push(`Status:\n${gitStatus}`);
    }
    parts.push(["<git_status>", ...gitParts, "</git_status>"].join("\n"));
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
