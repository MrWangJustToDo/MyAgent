/**
 * Eagerly start `task` subagents while the model streams.
 *
 * TanStack `chat()` executes tool calls sequentially, but a model emitting N
 * parallel task calls finishes streaming ALL of their arguments before the
 * execution phase begins. This middleware watches `TOOL_CALL_END` for `task`
 * calls and spawns the subagent right away; the sequential executor later
 * joins the already-running promise via the task tool (task-prefork.ts).
 *
 * Epoch hygiene: `RUN_STARTED` / `onFinish` / `onAbort` drop leftover pre-forked
 * runs — a restart-style retry re-streams tool calls with fresh ids, so orphans
 * from the dead attempt must not keep running.
 */

import { runSubagent } from "../../agent/subagent/run-subagent.js";
import { getTaskPreforkCoordinator } from "../../agent/subagent/task-prefork.js";
import { generateId } from "../../utils/generate-id.js";

import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { ManagedAgent, AgentManager } from "../../runtime-types/hosts.js";
import type { ChatMiddleware } from "@tanstack/ai";

export interface TaskPreforkMiddlewareDeps {
  getManagedAgent: () => ManagedAgent | undefined;
  manager: AgentManager;
}

interface PendingTaskCall {
  /** Args accumulated from TOOL_CALL_ARGS deltas. */
  argsText: string;
}

export function createTaskPreforkMiddleware(deps: TaskPreforkMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  // Per-stream-epoch state (reset on RUN_STARTED / finish / abort).
  let pendingCalls = new Map<string, PendingTaskCall>();

  const resetEpoch = () => {
    pendingCalls = new Map();
    const managed = deps.getManagedAgent();
    if (managed) {
      getTaskPreforkCoordinator(managed).abortAll();
    }
  };

  return {
    name: "task-prefork",
    onChunk: (_ctx, chunk) => {
      const managed = deps.getManagedAgent();
      if (!managed) return chunk;

      if (chunk.type === "RUN_STARTED") {
        resetEpoch();
        return chunk;
      }

      if (chunk.type === "TOOL_CALL_START") {
        if ((chunk.toolName ?? chunk.toolCallName) === "task") {
          pendingCalls.set(chunk.toolCallId, { argsText: "" });
        }
        return chunk;
      }

      if (chunk.type === "TOOL_CALL_ARGS") {
        const pending = pendingCalls.get(chunk.toolCallId);
        if (pending && typeof chunk.delta === "string") {
          pending.argsText += chunk.delta;
        }
        return chunk;
      }

      if (chunk.type === "TOOL_CALL_END") {
        const pending = pendingCalls.get(chunk.toolCallId);
        if (pending) {
          trySpawn(deps, managed, chunk.toolCallId, pending, chunk.input);
        }
      }

      return chunk;
    },
    onFinish: async () => {
      resetEpoch();
    },
    onAbort: async () => {
      resetEpoch();
    },
  };
}

/**
 * Parse the streamed args and pre-fork the subagent. Any parse failure simply
 * skips pre-forking — the task tool then runs serially at execute time.
 */
function trySpawn(
  deps: TaskPreforkMiddlewareDeps,
  managed: ManagedAgent,
  toolCallId: string,
  pending: PendingTaskCall,
  endInput: unknown
): void {
  let prompt: string | undefined;
  let description: string | undefined;

  const direct = endInput as { prompt?: unknown; description?: unknown } | undefined;
  if (direct && typeof direct === "object" && typeof direct.prompt === "string") {
    prompt = direct.prompt;
    if (typeof direct.description === "string") description = direct.description;
  } else {
    try {
      const parsed = JSON.parse(pending.argsText) as { prompt?: unknown; description?: unknown };
      if (typeof parsed.prompt === "string") prompt = parsed.prompt;
      if (typeof parsed.description === "string") description = parsed.description;
    } catch {
      return;
    }
  }
  if (!prompt?.trim()) return;

  const coordinator = getTaskPreforkCoordinator(managed);
  // Tie the subagent to the parent's current run so a parent abort cascades.
  const controller = new AbortController();
  const parentSignal = deps.manager.getAgent(managed.id)?.run.currentAbortController?.signal;
  const onParentAbort = () => controller.abort();
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });

  const started = coordinator.start(
    toolCallId,
    () => controller.abort(),
    () =>
      runPreForked(deps, managed.id, toolCallId, { prompt: prompt as string, description }, controller, () =>
        parentSignal?.removeEventListener("abort", onParentAbort)
      )
  );
  if (!started) {
    // Cap reached — the task tool runs this call serially at execute time.
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}

async function runPreForked(
  deps: TaskPreforkMiddlewareDeps,
  parentAgentId: string,
  toolCallId: string,
  args: { prompt: string; description?: string },
  controller: AbortController,
  cleanup: () => void
): ReturnType<typeof runSubagent> {
  try {
    return await runSubagent(
      {
        subagentId: generateId("subagent", { exists: (id) => deps.manager.getAgent(id) != null }),
        prompt: args.prompt,
        description: args.description,
        parentAgentId,
        parentTaskToolCallId: toolCallId,
        autoDestroy: false,
        maxOutputLength: Infinity,
        abortSignal: controller.signal,
      },
      { manager: deps.manager }
    );
  } finally {
    cleanup();
  }
}
