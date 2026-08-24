/**
 * Default AgentEvent types projected onto the Session `lifecycle` channel.
 *
 * Authoritative channels for UI data (do not rely on lifecycle for these):
 * - status / error / pendingApproval → `state`
 * - messages → `messages`
 * - queues → `queues`
 * - usage → `usage`
 * - todos → `todos`
 * - plan public state → `plan`
 * - tool process output (run_command stdout/stderr) → `tool`
 * - task/compact summary streams → `summary`
 * - structured log lines → `log` (opt-in)
 *
 * Lifecycle keeps typed telemetry: stop/abort/errors, approvals, subagent directory,
 * turn summary. Plan phase transitions and subagent:ui-update are omitted by default
 * (covered by `plan` channel / child sessions).
 *
 * Projected `lifecycle` channel payloads are the typed {@link AgentEvent} envelope
 * (`type`, `ts`, `agentId`, `parentId?`, `sessionId?`, `payload`) — same shape as the bus.
 */

import type { AgentEventType } from "../runtime-types/agent-events.js";

export const DEFAULT_SESSION_LIFECYCLE_EVENTS: readonly AgentEventType[] = [
  "prompt:submit",
  "agent:stop",
  "agent:abort",
  "agent:retry",
  "agent:stream-error",
  "agent:tool-start",
  "agent:tool-end",
  "agent:tool-error",
  "agent:tool-approval-request",
  "agent:thinking",
  "subagent:created",
  "subagent:started",
  "subagent:completed",
  "subagent:error",
  "subagent:destroyed",
  "subagent:phase",
  "turn:summary",
] as const;
