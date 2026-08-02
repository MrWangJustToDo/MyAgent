/**
 * Default event → AgentLog mapping for {@link attachEventLogBridge}.
 */

import type { AgentEvent, AgentEventType } from "./agent-event-bus.js";
import type { LogCategory, LogLevel } from "../agent/agent-log/types.js";

export interface EventLogRule {
  level: LogLevel;
  category: LogCategory;
  formatMessage: (event: AgentEvent) => string;
}

export const DEFAULT_EVENT_LOG_RULES: Record<AgentEventType, EventLogRule | false> = {
  // ============================================================================
  // Session lifecycle
  // ============================================================================
  "session:start": {
    level: "info",
    category: "system",
    formatMessage: (event) => `Session started (cwd: ${event.data?.cwd ?? "unknown"})`,
  },
  "session:doc": {
    level: "info",
    category: "system",
    formatMessage: (event) => (event.data?.message as string) ?? "Agent documentation loaded",
  },
  "session:skill": {
    level: "debug",
    category: "skill",
    formatMessage: (event) => `Loaded ${event.data?.count ?? 0} skills`,
  },
  "session:mcp": false,
  "session:memory": {
    level: "info",
    category: "memory",
    formatMessage: (event) => {
      const count = typeof event.data?.memoryCount === "number" ? event.data.memoryCount : 0;
      return count > 0 ? `Memory initialized (${count} memories)` : "Memory initialized (empty)";
    },
  },
  "session:restore": {
    level: "info",
    category: "system",
    formatMessage: (event) =>
      `Session restored: ${event.data?.messageCount ?? "?"} messages, ${event.data?.tokenEstimate ?? "?"} tokens`,
  },
  "session:save-error": {
    level: "warn",
    category: "system",
    formatMessage: (event) =>
      `Failed to save session ${event.data?.target ?? "data"}: ${event.data?.error ?? "unknown"}`,
  },

  // ============================================================================
  // Turn lifecycle
  // ============================================================================
  "prompt:submit": {
    level: "info",
    category: "chat",
    formatMessage: (event) => {
      const prompt = event.data?.prompt as string | undefined;
      const preview = prompt ? (prompt.length > 80 ? prompt.slice(0, 80) + "..." : prompt) : "";
      const msgCount = event.data?.contextMessageCount ?? "?";
      return `Prompt: ${preview}  (${msgCount} context messages)`;
    },
  },
  "prompt:before": {
    level: "debug",
    category: "chat",
    formatMessage: (event) => {
      const hasTurn = event.data?.hasTurnContext ? "turn+ctx" : "no-turn-ctx";
      const hasSys = event.data?.hasSystemAppend ? "sys+append" : "no-sys-append";
      return `Extension prompt hooks (${hasTurn}, ${hasSys})`;
    },
  },
  "turn:summary": {
    level: "info",
    category: "chat",
    formatMessage: (event) => {
      const d = event.data ?? {};
      const llmCalls = d.llmCalls ?? "?";
      const toolCalls = d.toolCalls ?? "?";
      const inTokens = d.inputTokens ?? "?";
      const outTokens = d.outputTokens ?? "?";
      const ms = d.durationMs ?? "?";
      return `Turn complete: ${llmCalls} LLM calls, ${toolCalls} tools, ${inTokens}→${outTokens} tokens, ${ms}ms`;
    },
  },
  "agent:thinking": {
    level: "debug",
    category: "agent",
    formatMessage: () => "Model reasoning started",
  },
  "agent:stop": {
    level: "info",
    category: "agent",
    formatMessage: (event) => `Agent stop (${event.data?.reason ?? "unknown"})`,
  },
  "agent:abort": {
    level: "warn",
    category: "agent",
    formatMessage: (event) => `Agent aborted (${event.data?.reason ?? "unknown"})`,
  },
  "agent:stream-error": {
    level: "error",
    category: "agent",
    formatMessage: (event) => `Stream error: ${event.data?.error ?? "unknown"}`,
  },

  // ============================================================================
  // LLM calls
  // ============================================================================
  "llm:request": {
    level: "debug",
    category: "llm",
    formatMessage: (event) => {
      const d = event.data ?? {};
      return `LLM request: ${d.model ?? "?"} (${d.messagesCount ?? "?"} msgs, ${d.toolsCount ?? 0} tools)`;
    },
  },
  "llm:response": {
    level: "info",
    category: "llm",
    formatMessage: (event) => {
      const d = event.data ?? {};
      const fr = d.finishReason ?? "?";
      const inT = d.inputTokens ?? "?";
      const outT = d.outputTokens ?? "?";
      const cache = d.cacheHitTokens ? ` (cache +${d.cacheHitTokens})` : "";
      const ms = d.durationMs ?? "?";
      return `LLM response: ${fr}  ${inT}→${outT} tokens${cache}  ${ms}ms`;
    },
  },

  // ============================================================================
  // Tools
  // ============================================================================
  "agent:tool-start": {
    level: "debug",
    category: "tool",
    formatMessage: (event) => `Tool start: ${event.data?.tool_name ?? "unknown"}`,
  },
  "agent:tool-approval-request": {
    level: "info",
    category: "approval",
    formatMessage: (event) => `Approval requested: ${event.data?.tool_name ?? "unknown"}`,
  },
  "agent:tool-end": {
    level: "debug",
    category: "tool",
    formatMessage: (event) => {
      const name = event.data?.tool_name ?? "unknown";
      const duration = event.data?.duration_ms;
      return duration != null ? `Tool end: ${name} (${duration}ms)` : `Tool end: ${name}`;
    },
  },
  "agent:tool-error": {
    level: "warn",
    category: "tool",
    formatMessage: (event) => `Tool error: ${event.data?.tool_name ?? "unknown"} — ${event.data?.error ?? "unknown"}`,
  },

  // ============================================================================
  // Memory
  // ============================================================================
  "memory:prefetch": false,
  "memory:extract": false,
  "memory:consolidate": false,

  // ============================================================================
  // Compaction
  // ============================================================================
  "compaction:auto-start": false,
  "compaction:auto-complete": false,
  "compaction:auto-error": false,
  "compaction:reactive-start": {
    level: "info",
    category: "compaction",
    formatMessage: (event) =>
      `Reactive compact triggered (retry ${event.data?.retry ?? "?"}/${event.data?.maxRetries ?? "?"})`,
  },
  "compaction:reactive-complete": {
    level: "info",
    category: "compaction",
    formatMessage: (event) =>
      `Reactive compact: ${event.data?.originalCount ?? "?"}→${event.data?.compactedCount ?? "?"} messages` +
      (event.data?.tokensBefore != null ? `, ${event.data.tokensBefore}→${event.data.tokensAfter ?? "?"} tokens` : ""),
  },
  "compaction:reactive-error": {
    level: "error",
    category: "compaction",
    formatMessage: (event) => `Reactive compact failed: ${event.data?.error ?? "unknown"}`,
  },
  "compaction:reactive-max-retries": {
    level: "error",
    category: "compaction",
    formatMessage: () => "Reactive compact: max retries exceeded, giving up",
  },

  // ============================================================================
  // Subagents
  // ============================================================================
  "subagent:created": {
    level: "info",
    category: "system",
    formatMessage: (event) => `Subagent created: ${event.data?.subagentId ?? event.agentId}`,
  },
  "subagent:started": {
    level: "info",
    category: "system",
    formatMessage: (event) => `Subagent started: ${event.data?.description ?? event.agentId}`,
  },
  "subagent:completed": {
    level: "info",
    category: "system",
    formatMessage: (event) => `Subagent completed: ${event.data?.summary ?? "(no summary)"}`,
  },
  "subagent:error": {
    level: "error",
    category: "system",
    formatMessage: (event) => `Subagent error: ${event.data?.error ?? "unknown"}`,
  },
  "subagent:destroyed": false,
  "subagent:ui-update": false,

  // ============================================================================
  // Plan mode
  // ============================================================================
  "plan:enter": {
    level: "info",
    category: "agent",
    formatMessage: () => "Plan mode: planning (read-only)",
  },
  "plan:ready": {
    level: "info",
    category: "agent",
    formatMessage: (event) => `Plan ready (${event.data?.stepCount ?? "?"} steps) — /plan execute to run`,
  },
  "plan:execute": {
    level: "info",
    category: "agent",
    formatMessage: (event) => {
      const steps = event.data?.stepCount ?? "?";
      const replaced = event.data?.replacedExistingTodos ? " (replaced existing todos)" : "";
      return `Plan execution started (${steps} steps)${replaced}`;
    },
  },
  "plan:cancel-execution": {
    level: "info",
    category: "agent",
    formatMessage: () => "Plan execution paused — back to ready (read-only)",
  },
  "plan:todo-replaced": {
    level: "info",
    category: "agent",
    formatMessage: (event) => `Plan todos replaced previous list (${event.data?.stepCount ?? "?"} steps)`,
  },
  "plan:retro": {
    level: "info",
    category: "agent",
    formatMessage: () => "Plan retrospective — review against the plan, then complete_plan or /plan done",
  },
  "plan:complete": {
    level: "info",
    category: "agent",
    formatMessage: () => "Plan complete — plan mode off",
  },
  "plan:exit": {
    level: "info",
    category: "agent",
    formatMessage: () => "Plan mode off",
  },
};
