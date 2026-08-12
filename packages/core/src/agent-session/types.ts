/**
 * Transport-agnostic Agent Session protocol.
 *
 * TODO(messages-incremental): Session currently delivers full `UIMessage[]` on
 * snapshot and the `messages` channel. A future change may add JSON-patch / delta
 * delivery for large histories — do not assume patches in hosts yet.
 *
 * Session lifecycle note:
 * - `clear` clears in-place messages (and related chat state) on the current agent.
 * - Creating a brand-new agent / disk session is Host.create (+ switch active id), not `clear`.
 */

import type { LogEntry } from "../agent/agent-log/types.js";
import type { ExtensionInfo } from "../agent/extension/types.js";
import type { McpServerStatus } from "../agent/mcp/manager.js";
import type { PlanModeState } from "../agent/plan/plan-mode-controller.js";
import type { SummaryStreamEvent, SummaryStreamSnapshot } from "../agent/summary-stream/types.js";
import type { TodoItem } from "../agent/todo-manager/types.js";
import type { StreamingChunk } from "../agent/tools/util/streaming-callback.js";
import type { QueuedMessagesSnapshot } from "../managers/agent-chat-controller.js";
import type { AgentEvent } from "../managers/agent-telemetry-bus.js";
import type { AgentL1State, AgentMode } from "../managers/managed-agent.js";
import type { UsageChangeSnapshot } from "../managers/usage-tracker.js";
import type { AgentStatus } from "../runtime-types/agent-status.js";
import type { ContentPart, UIMessage } from "@tanstack/ai";

// ============================================================================
// Channels
// ============================================================================

export const AGENT_SESSION_CHANNELS = [
  "state",
  "messages",
  "queues",
  "usage",
  "todos",
  "plan",
  "tool",
  "summary",
  "lifecycle",
  "log",
] as const;

export type AgentSessionChannel = (typeof AGENT_SESSION_CHANNELS)[number];

/** Channels delivered when `subscribe()` omits `channels` (`log` is opt-in). */
export const DEFAULT_AGENT_SESSION_CHANNELS: readonly AgentSessionChannel[] = [
  "state",
  "messages",
  "queues",
  "usage",
  "todos",
  "plan",
  "tool",
  "summary",
  "lifecycle",
];

// ============================================================================
// Snapshot
// ============================================================================

export interface AgentSessionMcpSummary {
  servers: McpServerStatus[];
}

export interface AgentSessionExtensionsSummary {
  extensions: ExtensionInfo[];
}

export interface AgentSessionSubagentSummary {
  id: string;
  status: AgentStatus;
  name?: string;
  /** Display label derived from spawn description when available. */
  description?: string;
  parentTaskToolCallId?: string;
  usage?: UsageChangeSnapshot;
}

export interface AgentSessionSnapshot {
  agentId: string;
  parentId?: string;
  name: string;
  status: AgentStatus;
  error: string;
  pendingApprovalCount: number;
  mode: AgentMode;
  lastStreamDurationMs: number;
  messages: UIMessage[];
  queues: QueuedMessagesSnapshot;
  usage: UsageChangeSnapshot;
  todos: TodoItem[];
  todosTitle: string | null;
  plan: PlanModeState;
  autoMode: boolean;
  mcp: AgentSessionMcpSummary;
  extensions: AgentSessionExtensionsSummary;
  subagents: AgentSessionSubagentSummary[];
}

// ============================================================================
// Commands
// ============================================================================

export type AgentSessionMessageContent = string | ContentPart[];

export type AgentSessionCommand =
  | { type: "send"; content: AgentSessionMessageContent }
  | { type: "steer"; content: AgentSessionMessageContent }
  | { type: "followUp"; content: AgentSessionMessageContent }
  | { type: "forceSubmit"; content: AgentSessionMessageContent }
  | { type: "stop" }
  /** Clear messages on the current agent. New agents use Host.create, not this command. */
  | { type: "clear" }
  | { type: "respondApproval"; approvalId: string; approved: boolean; reason?: string }
  | { type: "addToolResult"; toolCallId: string; output: Record<string, unknown> }
  | { type: "setClientToolWaiting"; active: boolean }
  | { type: "compact"; focus?: string }
  | { type: "rename"; name: string }
  /** Side-LLM title generation on the Host process (not in the UI). */
  | { type: "rename.generate" }
  | { type: "auto.set"; enabled: boolean }
  | { type: "auto.toggle" }
  | { type: "plan.enable" }
  | { type: "plan.disable" }
  | { type: "plan.toggle" }
  | { type: "plan.execute"; sendSteer?: boolean }
  | { type: "plan.cancel" }
  | { type: "plan.save"; nameHint?: string }
  | { type: "plan.load"; name: string }
  | { type: "plan.list" }
  | { type: "plan.complete" }
  | { type: "mcp.refresh" }
  | { type: "extension.toggle"; id: string; enabled: boolean }
  | { type: "extension.invokeCommand"; name: string; args?: string[] }
  /**
   * Restore an on-disk session onto the current agent (mid-session switch).
   * Bootstrap resume at create-time uses Host.create `{ resumeSessionId | continueSession }` —
   * both call ManagedAgent.restoreSession.
   */
  | { type: "session.resume"; sessionId: string }
  /** List on-disk sessions for the resume picker. */
  | { type: "session.list" }
  /**
   * Start a fresh on-disk session (slash `/clear`): persist current if needed, reset
   * transcript/plan/auto/todos, create a new SessionData. Prefer Host.create for a
   * brand-new agent process.
   */
  | { type: "session.new" };

export type AgentSessionCommandResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string; code?: "unsupported" | "not_found" | "invalid" | "failed" };

// ============================================================================
// Subscribe payloads
// ============================================================================

export type AgentSessionEvent =
  | { channel: "state"; payload: AgentL1State; ts: number }
  | { channel: "messages"; payload: UIMessage[]; ts: number }
  | { channel: "queues"; payload: QueuedMessagesSnapshot; ts: number }
  | { channel: "usage"; payload: UsageChangeSnapshot; ts: number }
  | { channel: "todos"; payload: { items: TodoItem[]; title: string | null }; ts: number }
  | { channel: "plan"; payload: PlanModeState; ts: number }
  | {
      channel: "tool";
      payload: { kind: "chunk"; chunk: StreamingChunk } | { kind: "clear"; toolCallId: string };
      ts: number;
    }
  | { channel: "summary"; payload: SummaryStreamEvent; ts: number }
  | { channel: "lifecycle"; payload: AgentEvent; ts: number }
  | { channel: "log"; payload: LogEntry; ts: number };

export type AgentSessionSubscriber = (event: AgentSessionEvent) => void;

export interface AgentSessionSubscribeOptions {
  channels?: AgentSessionChannel[];
}

// ============================================================================
// Session interface
// ============================================================================

export interface AgentSession {
  readonly id: string;
  getSnapshot(): AgentSessionSnapshot;
  /** Authoritative summary-stream state for remount (subscribe first, then call). */
  getSummaryStreamSnapshot(key: string): SummaryStreamSnapshot | null;
  dispatch(command: AgentSessionCommand): Promise<AgentSessionCommandResult>;
  subscribe(handler: AgentSessionSubscriber, options?: AgentSessionSubscribeOptions): () => void;
  close?(): Promise<void>;
}
