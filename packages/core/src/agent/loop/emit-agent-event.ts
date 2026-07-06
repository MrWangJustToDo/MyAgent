import type { AgentEvent, AgentEventType } from "../../managers/agent-event-bus.js";

/** Minimal surface for unified agent event emission (Base / Agent satisfy this). */
export interface AgentEventEmitter {
  readonly id: string;
  dispatchEvent?: (event: AgentEvent) => void;
  getSessionData?(): { id: string } | null;
}

export interface EmitAgentEventOptions {
  /** Override agentId (default: emitter.id) */
  agentId?: string;
  parentId?: string;
  data?: Record<string, unknown>;
}

/**
 * Unified event emission helper.
 * Injects session_id when session data is available.
 */
export function emitAgentEvent(
  emitter: AgentEventEmitter,
  type: AgentEventType,
  options?: EmitAgentEventOptions
): void {
  if (!emitter.dispatchEvent) return;

  const sessionId = emitter.getSessionData?.()?.id ?? emitter.id;

  emitter.dispatchEvent({
    type,
    agentId: options?.agentId ?? emitter.id,
    parentId: options?.parentId,
    data: { session_id: sessionId, ...options?.data },
  });
}
