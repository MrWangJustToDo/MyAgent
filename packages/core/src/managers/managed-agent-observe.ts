/**
 * Host observation facade — single subscribe/teardown for L1–L3 (+ optional log).
 */

import {
  subscribeStreamingCallback,
  subscribeStreamingClearCallback,
  type StreamingChunk,
} from "../agent/tools/util/streaming-callback.js";

import type { AgentEvent, AgentEventType } from "./agent-event-bus.js";
import type { AgentUIChannel } from "./agent-ui-channel.js";
import type { AgentManager } from "./manager-agent.js";
import type { AgentLog } from "../agent/agent-log";
import type { LogEntry } from "../agent/agent-log/types.js";
import type { UIMessage } from "@tanstack/ai";

/** Default L2 events for UI / usage hosts (not every llm:iteration). */
export const DEFAULT_OBSERVE_EVENTS: AgentEventType[] = [
  "prompt:submit",
  "agent:stop",
  "agent:abort",
  "agent:stream-error",
  "agent:tool-approval-request",
  "agent:thinking",
  "subagent:created",
  "subagent:started",
  "subagent:completed",
  "subagent:error",
  "subagent:destroyed",
  "subagent:ui-update",
  "turn:summary",
  "plan:enter",
  "plan:ready",
  "plan:execute",
  "plan:cancel-execution",
  "plan:todo-replaced",
  "plan:exit",
];

export interface AgentObserveHandlers {
  /** L1 — status / error / pendingApproval */
  onState?: () => void;
  /** L2 — lifecycle bus (filtered) */
  onEvent?: (event: AgentEvent) => void;
  /**
   * Event filter for `onEvent`.
   * - omit / undefined → {@link DEFAULT_OBSERVE_EVENTS}
   * - `"*"` → all event types (still agent-filtered)
   */
  events?: AgentEventType[] | "*";
  /** L3 — UIMessage snapshots when a UI channel exists */
  onMessages?: (messages: UIMessage[]) => void;
  onStreaming?: (chunk: StreamingChunk) => void;
  onStreamingClear?: (toolCallId: string) => void;
  onLog?: (entry: LogEntry) => void;
}

export interface ObserveManagedAgentTarget {
  id: string;
  subscribeState: (listener: () => void) => () => void;
  ui?: Pick<AgentUIChannel, "subscribe" | "getMessages">;
  log?: Pick<AgentLog, "onLog"> | null;
}

function eventTypeAllowed(type: AgentEventType, filter: AgentEventType[] | "*"): boolean {
  if (filter === "*") return true;
  return filter.includes(type);
}

function shouldDeliverEvent(event: AgentEvent, agentId: string, filter: AgentEventType[] | "*"): boolean {
  if (!eventTypeAllowed(event.type, filter)) return false;
  if (event.agentId === agentId) return true;
  if (event.parentId === agentId && event.type.startsWith("subagent:")) return true;
  return false;
}

/**
 * Wire L1/L2/L3 (+ optional log) listeners for one managed agent.
 * Returns a single idempotent unsubscribe.
 */
export function observeManagedAgent(
  target: ObserveManagedAgentTarget,
  handlers: AgentObserveHandlers,
  manager: Pick<AgentManager, "on">
): () => void {
  const unsubs: Array<() => void> = [];
  let active = true;

  if (handlers.onState) {
    unsubs.push(target.subscribeState(handlers.onState));
  }

  if (handlers.onEvent) {
    const filter = handlers.events ?? DEFAULT_OBSERVE_EVENTS;
    const onEvent = handlers.onEvent;
    const types: Array<AgentEventType | "*"> = filter === "*" ? ["*"] : filter;
    for (const type of types) {
      unsubs.push(
        manager.on(type, (event) => {
          if (!shouldDeliverEvent(event, target.id, filter)) return;
          onEvent(event);
        })
      );
    }
  }

  if (handlers.onMessages && target.ui) {
    const onMessages = handlers.onMessages;
    unsubs.push(target.ui.subscribe((messages) => onMessages(messages as UIMessage[])));
    onMessages(target.ui.getMessages() as UIMessage[]);
  }

  if (handlers.onStreaming) {
    unsubs.push(subscribeStreamingCallback(handlers.onStreaming, { agentId: target.id }));
  }

  if (handlers.onStreamingClear) {
    unsubs.push(subscribeStreamingClearCallback(handlers.onStreamingClear, { agentId: target.id }));
  }

  if (handlers.onLog && target.log) {
    unsubs.push(target.log.onLog(handlers.onLog));
  }

  return () => {
    if (!active) return;
    active = false;
    for (const unsub of unsubs) {
      try {
        unsub();
      } catch {
        // Ignore teardown errors
      }
    }
  };
}
