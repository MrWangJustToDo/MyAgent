import type { AgentEvent, AgentEventBus, AgentEventType } from "./agent-event-bus.js";
import type { AgentLog } from "../agent/agent-log/agent-log.js";
import type { LogCategory, LogLevel } from "../agent/agent-log/types.js";
import type { McpServerStatus } from "../agent/mcp/manager.js";

// ============================================================================
// Policy
// ============================================================================

export interface EventLogRule {
  level: LogLevel;
  category: LogCategory;
  formatMessage: (event: AgentEvent) => string;
}

export interface EventLogPolicy {
  /** Master switch for event-driven logging */
  enabled?: boolean;
  /** Per-event overrides; set to `false` to suppress logging for an event type */
  events?: Partial<Record<AgentEventType, EventLogRule | false>>;
}

export type EventLogResolver = (event: AgentEvent) => AgentLog | null | undefined;

const DEFAULT_EVENT_LOG_RULES: Record<AgentEventType, EventLogRule | false> = {
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
  "plan:exit": {
    level: "info",
    category: "agent",
    formatMessage: () => "Plan mode off",
  },
};

function resolveRule(type: AgentEventType, policy?: EventLogPolicy): EventLogRule | false | undefined {
  const override = policy?.events?.[type];
  if (override === false) return false;
  if (override) return override;
  return DEFAULT_EVENT_LOG_RULES[type];
}

function writeLog(log: AgentLog, rule: EventLogRule, event: AgentEvent, message: string): void {
  const data = event.data ? { ...event.data, eventType: event.type } : { eventType: event.type };

  switch (rule.level) {
    case "debug":
      log.debug(rule.category, message, data);
      break;
    case "info":
      log.info(rule.category, message, data);
      break;
    case "warn":
      log.warn(rule.category, message, data);
      break;
    case "error": {
      const errorMessage = (event.data?.error as string | undefined) ?? message;
      log.error(rule.category, message, new Error(errorMessage), data);
      break;
    }
  }
}

// ============================================================================
// Custom handlers (events that need complex multi-entry logic)
// ============================================================================

function logSessionMcp(log: AgentLog, event: AgentEvent): void {
  const configLoadedFrom = event.data?.configLoadedFrom as string | undefined;
  if (configLoadedFrom) {
    log.info("system", `MCP config: ${configLoadedFrom}`);
  }

  const servers = (event.data?.servers as McpServerStatus[] | undefined) ?? [];
  if (servers.length === 0) {
    log.debug("system", "No MCP servers configured");
    return;
  }

  for (const server of servers) {
    if (server.status === "connected") {
      log.info("system", `MCP server: ${server.name} (${server.toolCount ?? 0} tools)`);
    } else {
      log.warn("system", `MCP server failed: ${server.name} — ${server.error ?? "unknown"}`);
    }
  }
}

function logMemoryPrefetch(log: AgentLog, event: AgentEvent): void {
  const status = event.data?.status as string | undefined;
  const count = event.data?.count as number | undefined;
  switch (status) {
    case "skip-no-manager":
    case "skip-no-query":
      break; // silent — not actionable
    case "empty":
      log.debug("memory", "Memory prefetch: none found");
      break;
    case "selected":
    case "injected":
      log.debug("memory", `Memory prefetch: ${count ?? 0} relevant memories (${event.data?.byteSize ?? "?"} bytes)`);
      break;
    case "error":
      log.warn("memory", `Memory prefetch failed: ${event.data?.error ?? "unknown"}`);
      break;
  }
}

function logMemoryExtract(log: AgentLog, event: AgentEvent): void {
  const status = event.data?.status as string | undefined;
  switch (status) {
    case "start":
      log.debug("memory", "Memory extraction starting...");
      break;
    case "complete":
      log.debug("memory", `Memory extraction: ${event.data?.count ?? 0} new memories`);
      break;
    case "empty":
      log.debug("memory", "Memory extraction: no new memories");
      break;
    case "error":
      log.warn("memory", `Memory extraction failed: ${event.data?.error ?? "unknown"}`);
      break;
    default:
      break; // skip-in-progress, skip-short — silent
  }
}

function logMemoryConsolidate(log: AgentLog, event: AgentEvent): void {
  const status = event.data?.status as string | undefined;
  switch (status) {
    case "complete":
      log.debug("memory", `Memory consolidated: ${event.data?.before ?? "?"}→${event.data?.after ?? "?"} entries`);
      break;
    case "error":
      log.warn("memory", `Memory consolidation failed: ${event.data?.error ?? "unknown"}`);
      break;
    default:
      break; // start, skip — silent
  }
}

function logCompactionAuto(log: AgentLog, event: AgentEvent): void {
  switch (event.type) {
    case "compaction:auto-start":
      log.info("compaction", "Auto-compacting context...");
      break;
    case "compaction:auto-complete":
      log.info(
        "compaction",
        `Auto-compact: ${event.data?.tokensBefore ?? "?"}→${event.data?.tokensAfter ?? "?"} tokens`
      );
      break;
    case "compaction:auto-error": {
      const phase = event.data?.phase as string | undefined;
      const error = (event.data?.error as string | undefined) ?? "unknown";
      if (phase === "cache-cleanup") {
        log.warn("compaction", "Auto-compact cache cleanup failed", { error });
        return;
      }
      log.error("compaction", `Auto-compact failed: ${error}`, new Error(error));
      break;
    }
  }
}

/**
 * Bridge {@link AgentEventBus} events into per-agent {@link AgentLog} entries.
 * Centralizes lifecycle logging so emit sites do not duplicate log calls.
 */
export function attachEventLogBridge(
  bus: AgentEventBus,
  resolveLog: EventLogResolver,
  policy?: EventLogPolicy
): () => void {
  const enabled = policy?.enabled ?? true;
  if (!enabled) return () => {};

  return bus.on("*", (event) => {
    const log = resolveLog(event);
    if (!log) return;

    switch (event.type) {
      case "session:mcp":
        logSessionMcp(log, event);
        return;
      case "memory:prefetch":
        logMemoryPrefetch(log, event);
        return;
      case "memory:extract":
        logMemoryExtract(log, event);
        return;
      case "memory:consolidate":
        logMemoryConsolidate(log, event);
        return;
      case "compaction:auto-start":
      case "compaction:auto-complete":
      case "compaction:auto-error":
        logCompactionAuto(log, event);
        return;
    }

    const rule = resolveRule(event.type, policy);
    if (!rule) return;

    writeLog(log, rule, event, rule.formatMessage(event));
  });
}
