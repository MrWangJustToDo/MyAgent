import { DEFAULT_EVENT_LOG_RULES, type EventLogRule } from "./event-log-rules.js";

import type { AgentEvent, AgentTelemetryBus, AgentEventType } from "./agent-telemetry-bus.js";
import type { AgentLog } from "../../agent/agent-log/agent-log.js";
import type { McpServerStatus } from "../../agent/mcp/manager.js";

export type { EventLogRule } from "./event-log-rules.js";

/** Read payload fields for logging formatters. */
function p(event: AgentEvent): Record<string, unknown> {
  return event.payload as Record<string, unknown>;
}

// ============================================================================
// Policy
// ============================================================================

export interface EventLogPolicy {
  /** Master switch for event-driven logging */
  enabled?: boolean;
  /** Per-event overrides; set to `false` to suppress logging for an event type */
  events?: Partial<Record<AgentEventType, EventLogRule | false>>;
}

export type EventLogResolver = (event: AgentEvent) => AgentLog | null | undefined;

function resolveRule(type: AgentEventType, policy?: EventLogPolicy): EventLogRule | false | undefined {
  const override = policy?.events?.[type];
  if (override === false) return false;
  if (override) return override;
  return DEFAULT_EVENT_LOG_RULES[type];
}

function writeLog(log: AgentLog, rule: EventLogRule, event: AgentEvent, message: string): void {
  const data = { ...p(event), eventType: event.type };

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
      const errorMessage = (p(event).error as string | undefined) ?? message;
      log.error(rule.category, message, new Error(errorMessage), data);
      break;
    }
  }
}

// ============================================================================
// Custom handlers (events that need complex multi-entry logic)
// ============================================================================

function logSessionMcp(log: AgentLog, event: AgentEvent): void {
  const configLoadedFrom = p(event).configLoadedFrom as string | undefined;
  if (configLoadedFrom) {
    log.info("system", `MCP config: ${configLoadedFrom}`);
  }

  const servers = (p(event).servers as McpServerStatus[] | undefined) ?? [];
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
  const status = p(event).status as string | undefined;
  const count = p(event).count as number | undefined;
  switch (status) {
    case "skip-no-manager":
    case "skip-no-query":
      break; // silent — not actionable
    case "empty":
      log.debug("memory", "Memory prefetch: none found");
      break;
    case "selected":
    case "injected":
      log.debug("memory", `Memory prefetch: ${count ?? 0} relevant memories (${p(event).byteSize ?? "?"} bytes)`);
      break;
    case "error":
      log.warn("memory", `Memory prefetch failed: ${p(event).error ?? "unknown"}`);
      break;
  }
}

function logMemoryExtract(log: AgentLog, event: AgentEvent): void {
  const status = p(event).status as string | undefined;
  switch (status) {
    case "start":
      log.debug("memory", "Memory extraction starting...");
      break;
    case "complete":
      log.debug("memory", `Memory extraction: ${p(event).count ?? 0} new memories`);
      break;
    case "empty":
      log.debug("memory", "Memory extraction: no new memories");
      break;
    case "error":
      log.warn("memory", `Memory extraction failed: ${p(event).error ?? "unknown"}`);
      break;
    default:
      break; // queued, skip-short — silent
  }
}

function logMemoryConsolidate(log: AgentLog, event: AgentEvent): void {
  const status = p(event).status as string | undefined;
  switch (status) {
    case "complete":
      log.debug("memory", `Memory consolidated: ${p(event).before ?? "?"}→${p(event).after ?? "?"} entries`);
      break;
    case "error":
      log.warn("memory", `Memory consolidation failed: ${p(event).error ?? "unknown"}`);
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
      log.info("compaction", `Auto-compact: ${p(event).tokensBefore ?? "?"}→${p(event).tokensAfter ?? "?"} tokens`);
      break;
    case "compaction:auto-error": {
      const phase = p(event).phase as string | undefined;
      const error = (p(event).error as string | undefined) ?? "unknown";
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
 * Bridge {@link AgentTelemetryBus} events into per-agent {@link AgentLog} entries.
 * Centralizes lifecycle logging so emit sites do not duplicate log calls.
 */
export function bridgeTelemetryToAgentLog(
  bus: AgentTelemetryBus,
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
