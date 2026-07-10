import type { AgentEvent, AgentEventType } from "./agent-event-bus.js";

/** Minimal surface for unified agent event emission. */
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

/** Callback shape for services/middleware that emit lifecycle events. */
export type EmitAgentEventFn = (type: AgentEventType, data?: Record<string, unknown>) => void;

/** Bind {@link emitAgentEvent} to a managed agent or other emitter. */
export function createEmitFn(emitter: AgentEventEmitter): EmitAgentEventFn {
  return (type, data) => emitAgentEvent(emitter, type, { data });
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
