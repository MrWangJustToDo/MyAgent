// ============================================================================
// Event Types
// ============================================================================

import type { AgentEventPayloadMap } from "../../runtime-types/agent-event-payloads.js";
import type { AgentEventType } from "../../runtime-types/agent-events.js";

export type { AgentEventType } from "../../runtime-types/agent-events.js";
export type { AgentEventPayloadMap, AgentEventPayload } from "../../runtime-types/agent-event-payloads.js";

/** Shared serializable envelope + typed payload (discriminated on `type`). */
export type AgentEvent = {
  [K in AgentEventType]: {
    type: K;
    /** Epoch ms when the event was emitted. */
    ts: number;
    agentId: string;
    /** For subagent events, the parent agent ID */
    parentId?: string;
    /** Disk/session id when available (not the agent id). */
    sessionId?: string;
    payload: AgentEventPayloadMap[K];
  };
}[AgentEventType];

export type AgentEventListener = (event: AgentEvent) => void;

// ============================================================================
// AgentTelemetryBus
// ============================================================================

/** In-process telemetry bus for lifecycle notifications (fire-and-forget). */
export class AgentTelemetryBus {
  private eventListeners: Map<AgentEventType | "*", Set<AgentEventListener>> = new Map();

  on(type: AgentEventType | "*", listener: AgentEventListener): () => void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);

    return () => {
      this.eventListeners.get(type)?.delete(listener);
    };
  }

  /** Emit an agent event to all registered listeners. */
  emit(event: AgentEvent): void {
    this.notifyListeners(event);
  }

  private notifyListeners(event: AgentEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Ignore listener errors
        }
      }
    }

    const wildcardListeners = this.eventListeners.get("*");
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try {
          listener(event);
        } catch {
          // Ignore listener errors
        }
      }
    }
  }
}
