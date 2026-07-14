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
  "session:save-error": {
    level: "warn",
    category: "agent",
    formatMessage: (event) =>
      `Failed to save session ${event.data?.target ?? "data"}: ${event.data?.error ?? "unknown"}`,
  },
  "prompt:submit": {
    level: "debug",
    category: "chat",
    formatMessage: (event) => `Prompt submitted: ${event.data?.prompt ?? ""}`,
  },
  "agent:thinking": {
    level: "debug",
    category: "agent",
    formatMessage: () => "Model reasoning started",
  },
  "agent:tool-start": {
    level: "info",
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
  "agent:abort": {
    level: "info",
    category: "agent",
    formatMessage: (event) => `Aborting agent (${event.data?.reason ?? "unknown"})`,
  },
  "agent:stream-error": {
    level: "error",
    category: "agent",
    formatMessage: (event) => `Stream error: ${event.data?.error ?? "unknown"}`,
  },
  "agent:stop": {
    level: "debug",
    category: "agent",
    formatMessage: (event) => `Agent stopped (${event.data?.reason ?? "unknown"})`,
  },
  "memory:prefetch": false,
  "memory:extract": false,
  "memory:consolidate": false,
  "compaction:auto-start": false,
  "compaction:auto-complete": false,
  "compaction:auto-error": false,
  "compaction:reactive-start": {
    level: "info",
    category: "agent",
    formatMessage: (event) =>
      `Reactive compact triggered (retry ${event.data?.retry ?? "?"}/${event.data?.maxRetries ?? "?"})`,
  },
  "compaction:reactive-complete": {
    level: "info",
    category: "agent",
    formatMessage: (event) =>
      `Reactive compact completed (${event.data?.originalMessages ?? "?"} → ${event.data?.compactedMessages ?? "?"} messages)`,
  },
  "compaction:reactive-error": {
    level: "error",
    category: "agent",
    formatMessage: (event) => `Reactive compact failed: ${event.data?.error ?? "unknown"}`,
  },
  "compaction:reactive-max-retries": {
    level: "error",
    category: "agent",
    formatMessage: () => "Reactive compact: max retries exceeded, giving up",
  },
  "subagent:created": {
    level: "info",
    category: "agent",
    formatMessage: (event) => `Subagent created: ${event.data?.subagentId ?? event.agentId}`,
  },
  "subagent:started": {
    level: "info",
    category: "agent",
    formatMessage: (event) => `Subagent started: ${event.data?.description ?? event.agentId}`,
  },
  "subagent:completed": {
    level: "info",
    category: "agent",
    formatMessage: (event) => `Subagent completed: ${event.data?.summary ?? "(no summary)"}`,
  },
  "subagent:error": {
    level: "error",
    category: "agent",
    formatMessage: (event) => `Subagent error: ${event.data?.error ?? "unknown"}`,
  },
  "subagent:destroyed": false,
  "subagent:ui-update": false,
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

function logSessionMcp(log: AgentLog, event: AgentEvent): void {
  const configLoadedFrom = event.data?.configLoadedFrom as string | undefined;
  if (configLoadedFrom) {
    log.info("agent", `MCP config loaded from ${configLoadedFrom}`);
  }

  const servers = (event.data?.servers as McpServerStatus[] | undefined) ?? [];
  if (servers.length === 0) {
    log.debug("agent", "No MCP servers connected");
    return;
  }

  for (const server of servers) {
    if (server.status === "connected") {
      log.info("agent", `MCP server connected: ${server.name}`, {
        toolCount: server.toolCount,
        transport: server.transport,
      });
      continue;
    }

    log.error("agent", `MCP server failed: ${server.name}`, new Error(server.error ?? "unknown"), {
      transport: server.transport,
    });
  }
}

function logMemoryPrefetch(log: AgentLog, event: AgentEvent): void {
  const status = event.data?.status as string | undefined;
  switch (status) {
    case "skip-no-manager":
      log.debug("memory", "No memory manager available, skipping prefetch");
      break;
    case "skip-no-query":
      log.debug("memory", "No user query found in messages, skipping memory prefetch");
      break;
    case "empty":
      log.debug("memory", "No relevant memories found for this query");
      break;
    case "selected":
      log.info("memory", `Selected ${event.data?.count ?? 0} relevant memories for turn context`, {
        filenames: event.data?.filenames,
        byteSize: event.data?.byteSize,
      });
      break;
    case "injected":
      // Legacy status — treat like selected (buffer filled; injection is turn-context).
      log.info("memory", `Selected ${event.data?.count ?? 0} relevant memories for turn context`, {
        filenames: event.data?.filenames,
        byteSize: event.data?.byteSize,
      });
      break;
    case "error":
      log.warn("memory", `Relevant memory prefetch failed: ${event.data?.error ?? "unknown"}`);
      break;
  }
}

function logMemoryExtract(log: AgentLog, event: AgentEvent): void {
  const status = event.data?.status as string | undefined;
  switch (status) {
    case "skip-in-progress":
      log.debug("memory", "Extraction already in progress, skipping");
      break;
    case "start":
      log.info("memory", "Extracting memories...");
      break;
    case "complete":
      log.info("memory", `Extracted ${event.data?.count ?? 0} new memories`, {
        count: event.data?.count,
      });
      break;
    case "empty":
      log.info("memory", "Extraction complete: no new memories to save");
      break;
    case "skip-short":
      log.debug("memory", `Skipping extraction: only ${event.data?.count ?? "?"} messages (need 15)`);
      break;
    case "error":
      log.warn("memory", `Memory extraction failed: ${event.data?.error ?? "unknown"}`);
      break;
  }
}

function logMemoryConsolidate(log: AgentLog, event: AgentEvent): void {
  const status = event.data?.status as string | undefined;
  switch (status) {
    case "start":
      log.info("memory", "Consolidating memories...");
      break;
    case "complete":
      log.info("memory", `Consolidated memories: ${event.data?.before ?? "?"} → ${event.data?.after ?? "?"}`, {
        before: event.data?.before,
        after: event.data?.after,
      });
      break;
    case "skip":
      log.debug("memory", "Memory consolidation produced no changes");
      break;
  }
}

function logCompactionAuto(log: AgentLog, event: AgentEvent): void {
  switch (event.type) {
    case "compaction:auto-start":
      log.info("system", "Auto-compacting context...");
      break;
    case "compaction:auto-complete":
      log.info("system", "Context compacted", {
        tokensBefore: event.data?.tokensBefore,
        tokensAfter: event.data?.tokensAfter,
      });
      break;
    case "compaction:auto-error": {
      const phase = event.data?.phase as string | undefined;
      const error = (event.data?.error as string | undefined) ?? "unknown";
      if (phase === "cache-cleanup") {
        log.warn("agent", "Failed to cleanup tool cache", { error });
        return;
      }
      log.error("agent", "Auto-compaction failed, continuing with original messages", new Error(error));
      log.warn("system", `Compaction failed: ${error}`);
      break;
    }
  }
}

function logCompactionReactive(log: AgentLog, event: AgentEvent): void {
  if (event.type !== "compaction:reactive-error") return;

  const phase = event.data?.phase as string | undefined;
  const error = (event.data?.error as string | undefined) ?? "unknown";
  if (phase === "cache-cleanup") {
    log.warn("agent", "Failed to cleanup tool cache after reactive compact", { error });
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
      case "compaction:reactive-error":
        if (event.data?.phase === "cache-cleanup") {
          logCompactionReactive(log, event);
          return;
        }
        break;
    }

    const rule = resolveRule(event.type, policy);
    if (!rule) return;

    writeLog(log, rule, event, rule.formatMessage(event));
  });
}
