/**
 * Typed payloads for {@link AgentEventType}.
 *
 * Wire shape uses `payload` (not a loose `data` bag). Field names for tools keep
 * existing snake_case keys (`tool_name`, `tool_call_id`) used by Event→Log and app timing.
 */

import type { AgentEventType } from "./agent-events.js";
import type { AgentRetryStrategy } from "./agent-retry.js";
import type { McpServerStatus } from "../agent/mcp/manager.js";

/** Explicit empty object for events with no fields. */
export type EmptyAgentEventPayload = Record<string, never>;

type PlanPhase = "off" | "planning" | "ready" | "executing" | "retro";

export type AgentEventPayloadMap = {
  "session:doc": {
    source?: string;
    length?: number;
    message?: string;
  };
  "session:memory": {
    memoryCount?: number;
    indexLength?: number;
  };
  "session:mcp": {
    configPath?: string;
    configLoadedFrom?: string;
    servers?: McpServerStatus[];
    toolCount?: number;
  };
  "session:skill": {
    count?: number;
    names?: string[];
  };
  "session:start": {
    cwd?: string;
  };
  "session:restore": {
    sessionId?: string;
    messageCount?: number;
    tokenEstimate?: number;
    planPhase?: PlanPhase;
    autoMode?: boolean;
    /** Count of `media://` refs that could not be hydrated from disk on restore. */
    mediaMissing?: number;
  };
  "session:save-error": {
    target?: string;
    error?: string;
  };
  "prompt:submit": {
    prompt?: string;
    contextMessageCount?: number;
  };
  "prompt:before": {
    prompt?: string;
    hasTurnContext?: boolean;
  };
  "agent:thinking": EmptyAgentEventPayload;
  "agent:tool-start": {
    tool_name?: string;
    tool_call_id?: string;
    tool_input?: unknown;
    timestamp?: number;
  };
  "agent:tool-approval-request": {
    tool_name?: string;
    tool_call_id?: string;
    approval_id?: string;
    tool_input?: unknown;
  };
  "agent:tool-approval-resolved": {
    tool_name?: string;
    tool_call_id?: string;
    approval_id?: string;
    decision: "approved" | "denied";
    reason?: string;
  };
  "agent:tool-end": {
    tool_name?: string;
    tool_call_id?: string;
    duration_ms?: number;
    tool_output?: unknown;
    /**
     * True when the output carries a user-cancel marker (`cancelled` / `aborted`) rather
     * than being a genuine success.
     *
     * This event fires whenever the tool RETURNS, and a tool that catches its own abort
     * returns normally — `run_command` settles with `cancelled: true` and the partial
     * stdout, the `task` tool with `aborted: true`. Classifying by the return (which is
     * all TanStack reports: `info.ok`) therefore recorded a user-cancelled call as a
     * successful one, and the log bridge wrote `Tool end: …` with nothing about the
     * cancel. The verdict has to come from the output, because the return says nothing.
     */
    cancelled?: boolean;
    timestamp?: number;
  };
  "agent:tool-error": {
    tool_name?: string;
    tool_call_id?: string;
    error?: string;
    /**
     * True when the failure IS the user aborting the run, not a tool fault. Without it the
     * lifecycle stream cannot tell "the command failed" from "the user pressed Esc", so a
     * consumer counting failures counts cancels, and the log bridge reports a cancel as an
     * error. The row still settles as `output-error` (the abort reached TanStack as a throw),
     * which is exactly why the distinction has to be carried here.
     */
    cancelled?: boolean;
    timestamp?: number;
  };
  "agent:abort": {
    reason?: string;
  };
  "agent:retry": {
    attempt?: number;
    maxAttempts?: number;
    strategy?: AgentRetryStrategy;
    error?: string;
    delayMs?: number;
    retryAfterSeconds?: number;
  };
  "agent:stream-error": {
    error?: string;
  };
  "agent:stop": {
    reason?: string;
  };
  "agent:extension-error": {
    extensionId?: string;
    phase?: string;
    error?: string;
  };
  "memory:prefetch": {
    status?: string;
    count?: number;
    byteSize?: number;
    error?: string;
    filenames?: string[];
  };
  "memory:extract": {
    status?: string;
    count?: number;
    error?: string;
  };
  "memory:consolidate": {
    status?: string;
    before?: number;
    after?: number;
    count?: number;
    error?: string;
  };
  "llm:request": {
    model?: string;
    /** Provider id reported by the adapter usage (sticky across iterations). */
    provider?: string;
    iteration?: number;
    messagesCount?: number;
    toolsCount?: number;
  };
  "llm:response": {
    model?: string;
    /** Provider id reported by the adapter usage. */
    provider?: string;
    iteration?: number;
    finishReason?: string;
    inputTokens?: number;
    outputTokens?: number;
    cacheHitTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
    costUsd?: number;
    roundElapsedMs?: number;
    firstTokenMs?: number;
    durationMs?: number;
  };
  "turn:summary": {
    outcome?: "finished" | "aborted" | "error";
    /** Driver-level tool-phase continuations executed in this run (each one streamed once). */
    phases?: number;
    toolCalls?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    costUsd?: number;
    durationMs?: number;
  };
  "compaction:auto-start": {
    tokensBefore?: number;
  };
  "compaction:auto-complete": {
    tokensBefore?: number;
    tokensAfter?: number;
  };
  "compaction:auto-error": {
    phase?: string;
    error?: string;
  };
  "compaction:reactive-start": {
    retry?: number;
    maxRetries?: number;
  };
  "compaction:reactive-complete": {
    originalCount?: number;
    compactedCount?: number;
    tokensBefore?: number;
    tokensAfter?: number;
  };
  "compaction:reactive-error": {
    phase?: string;
    error?: string;
  };
  "compaction:reactive-max-retries": EmptyAgentEventPayload;
  "subagent:created": {
    subagentId?: string;
  };
  "subagent:started": {
    subagentId?: string;
    description?: string;
  };
  "subagent:completed": {
    subagentId?: string;
    summary: string;
    iterations?: number;
    /** Iteration budget the count was measured against (structured log data field). */
    maxIterations?: number;
    durationMs?: number;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  "subagent:error": {
    subagentId?: string;
    error?: string;
    /**
     * True when the run was cut short by the user rather than failing.
     *
     * The abort path reuses this event (a cancelled subagent has no other terminal
     * event), so without the flag a cancel was written at `error` level carrying the
     * subagent's partial narration as if it were a fault message. That is the same
     * conflation `agent:tool-error` already avoids, expressed the same way.
     */
    cancelled?: boolean;
  };
  "subagent:destroyed": {
    subagentId?: string;
  };
  "subagent:phase": {
    subagentId?: string;
    /**
     * Task-level phase: running (exploring), summary (the subagent is writing its
     * own report), or limit (budget cutoff; the progress-summary fallback is
     * writing the report instead).
     */
    phase?: "running" | "summary" | "limit";
    parentTaskToolCallId?: string;
  };
  "subagent:progress-summary-error": {
    subagentId?: string;
    parentAgentId?: string;
    error?: string;
  };
  "plan:enter": {
    phase?: PlanPhase;
  };
  "plan:ready": {
    phase?: PlanPhase;
    stepCount?: number;
    preservedExistingTodos?: boolean;
    todosSeeded?: boolean;
    planFilePath?: string | null;
  };
  "plan:execute": {
    phase?: PlanPhase;
    stepCount?: number;
    replacedExistingTodos?: boolean;
    planFilePath?: string | null;
  };
  "plan:cancel-execution": {
    phase?: PlanPhase;
    stepCount?: number;
  };
  "plan:todo-replaced": {
    stepCount?: number;
  };
  "plan:retro": {
    phase?: PlanPhase;
    stepCount?: number;
    planFilePath?: string | null;
  };
  "plan:complete": {
    phase?: PlanPhase;
    planFilePath?: string | null;
    stepCount?: number;
  };
  "plan:exit": {
    phase?: PlanPhase;
  };
};

export type AgentEventPayload<T extends AgentEventType> = AgentEventPayloadMap[T];

/** Compile-time completeness check against {@link AgentEventType}. */
type _MissingPayloadKeys = Exclude<AgentEventType, keyof AgentEventPayloadMap>;
type _AssertPayloadMapComplete = [_MissingPayloadKeys] extends [never] ? true : _MissingPayloadKeys;
const _payloadMapComplete: _AssertPayloadMapComplete = true;
void _payloadMapComplete;
