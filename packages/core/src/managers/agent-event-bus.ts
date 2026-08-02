// ============================================================================
// Event Types
// ============================================================================

import type { AgentEventType } from "../runtime-types/agent-events.js";

export type { AgentEventType } from "../runtime-types/agent-events.js";

/** Unified agent event */
export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  /** For subagent events, the parent agent ID */
  parentId?: string;
  /** Event-specific payload */
  data?: Record<string, unknown>;
}

export type AgentEventListener = (event: AgentEvent) => void;

// ============================================================================
// AgentEventBus
// ============================================================================

/** In-process event bus for lifecycle and notification events (fire-and-forget). */
export class AgentEventBus {
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
