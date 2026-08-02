/**
 * Transport-agnostic Agent Session protocol.
 *
 * TODO(messages-incremental): Session currently delivers full `UIMessage[]` on
 * snapshot and the `messages` channel. A future change may add JSON-patch / delta
 * delivery for large histories — do not assume patches in hosts yet.
 */

import type { LogEntry } from "../agent/agent-log/types.js";
import type { PlanModeState } from "../agent/plan/plan-mode-controller.js";
import type { TodoItem } from "../agent/todo-manager/types.js";
import type { StreamingChunk } from "../agent/tools/util/streaming-callback.js";
import type { QueuedMessagesSnapshot } from "../managers/agent-chat-controller.js";
import type { AgentEvent } from "../managers/agent-event-bus.js";
import type { AgentL1State } from "../managers/managed-agent.js";
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
  "streaming",
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
  "streaming",
  "lifecycle",
];

// ============================================================================
// Snapshot
// ============================================================================

export interface AgentSessionSubagentSummary {
  id: string;
  status: AgentStatus;
  name?: string;
  parentTaskToolCallId?: string;
}

export interface AgentSessionSnapshot {
  agentId: string;
  parentId?: string;
  status: AgentStatus;
  error: string;
  pendingApprovalCount: number;
  messages: UIMessage[];
  queues: QueuedMessagesSnapshot;
  usage: UsageChangeSnapshot;
  todos: TodoItem[];
  todosTitle: string | null;
  plan: PlanModeState;
  autoApprove: boolean;
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
  | { type: "stop" }
  | { type: "clear" }
  | { type: "respondApproval"; approvalId: string; approved: boolean; reason?: string }
  | { type: "addToolResult"; toolCallId: string; output: Record<string, unknown> }
  | { type: "setClientToolWaiting"; active: boolean }
  | { type: "compact" }
  | { type: "rename"; name: string }
  | { type: "auto.set"; enabled: boolean }
  | { type: "plan.enable" }
  | { type: "plan.disable" }
  | { type: "plan.toggle" }
  | { type: "plan.execute"; sendSteer?: boolean }
  | { type: "plan.cancel" }
  | { type: "session.resume"; sessionId: string };

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
      channel: "streaming";
      payload: { kind: "chunk"; chunk: StreamingChunk } | { kind: "clear"; toolCallId: string };
      ts: number;
    }
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
  dispatch(command: AgentSessionCommand): Promise<AgentSessionCommandResult>;
  subscribe(handler: AgentSessionSubscriber, options?: AgentSessionSubscribeOptions): () => void;
  close?(): Promise<void>;
}
