import { emitHook } from "../agent/hooks/hook-runner.js";

import type { HookRegistry } from "../agent/hooks/hook-registry.js";
import type { HookLogger } from "../agent/hooks/hook-runner.js";
import type { HookEventInput, HookEventType } from "../agent/hooks/types.js";

// ============================================================================
// Event Types
// ============================================================================

/** Agent lifecycle event types (emitted via {@link emitAgentEvent}). */
export type AgentEventType =
  | "session:doc"
  | "session:memory"
  | "session:mcp"
  | "session:skill"
  | "session:start"
  | "prompt:submit"
  | "agent:thinking"
  | "agent:tool-start"
  | "agent:tool-approval-request"
  | "agent:tool-end"
  | "agent:tool-error"
  | "agent:abort"
  | "agent:stream-error"
  | "agent:stop"
  | "memory:prefetch"
  | "memory:extract"
  | "memory:consolidate"
  | "compaction:auto-start"
  | "compaction:auto-complete"
  | "compaction:auto-error"
  | "compaction:reactive-start"
  | "compaction:reactive-complete"
  | "compaction:reactive-error"
  | "compaction:reactive-max-retries"
  | "session:save-error"
  | "subagent:created"
  | "subagent:started"
  | "subagent:completed"
  | "subagent:error"
  | "subagent:destroyed"
  | "subagent:ui-update";

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

export interface AgentEventHookTarget {
  hookRegistry: HookRegistry | null | undefined;
  log?: HookLogger | null;
}

export type AgentEventHookTargetResolver = (event: AgentEvent) => AgentEventHookTarget | undefined;

// ============================================================================
// AgentEventBus
// ============================================================================

/** In-process event bus that also bridges lifecycle events to configured hook scripts. */
export class AgentEventBus {
  private eventListeners: Map<AgentEventType | "*", Set<AgentEventListener>> = new Map();

  constructor(private readonly resolveHookTarget?: AgentEventHookTargetResolver) {}

  on(type: AgentEventType | "*", listener: AgentEventListener): () => void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);

    return () => {
      this.eventListeners.get(type)?.delete(listener);
    };
  }

  /** Emit an agent event. Dispatches to in-process listeners and hook scripts. */
  emit(event: AgentEvent): void {
    this.notifyListeners(event);
    this.dispatchHook(event);
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

  private dispatchHook(event: AgentEvent): void {
    const target = this.resolveHookTarget?.(event);
    const registry = target?.hookRegistry;
    if (!registry) return;

    const hookEvent = mapToHookEvent(event);
    if (!hookEvent) return;

    emitHook(registry, hookEvent.name, hookEvent.input, { logger: target.log ?? undefined });
  }
}

// ============================================================================
// Event -> Hook Mapping
// ============================================================================

/** Map lifecycle AgentEvents to hook scripts. Tool hooks use hooks-middleware directly. */
function mapToHookEvent(event: AgentEvent): { name: HookEventType; input: HookEventInput } | null {
  const d = event.data ?? {};
  switch (event.type) {
    case "session:start":
      return {
        name: "SessionStart",
        input: {
          hook_event_name: "SessionStart",
          session_id: (d.session_id as string) ?? event.agentId,
          cwd: (d.cwd as string) ?? "",
        },
      };
    case "prompt:submit":
      return {
        name: "UserPromptSubmit",
        input: {
          hook_event_name: "UserPromptSubmit",
          session_id: (d.session_id as string) ?? event.agentId,
          prompt: (d.prompt as string) ?? "",
        },
      };
    case "agent:stop":
      return {
        name: "Stop",
        input: {
          hook_event_name: "Stop",
          session_id: (d.session_id as string) ?? event.agentId,
          reason: (d.reason as string) ?? "unknown",
        },
      };
    case "subagent:started":
      return {
        name: "SubagentStart",
        input: {
          hook_event_name: "SubagentStart",
          session_id: (d.session_id as string) ?? event.agentId,
          subagent_id: (d.subagent_id as string) ?? event.agentId,
          description: (d.description as string) ?? "",
        },
      };
    case "subagent:completed":
      return {
        name: "SubagentStop",
        input: {
          hook_event_name: "SubagentStop",
          session_id: (d.session_id as string) ?? event.agentId,
          subagent_id: (d.subagent_id as string) ?? event.agentId,
          summary: (d.summary as string) ?? "",
        },
      };
    case "subagent:error":
      return {
        name: "Notification",
        input: {
          hook_event_name: "Notification",
          session_id: (d.session_id as string) ?? event.agentId,
          message: `Subagent error: ${(d.error as string) ?? "unknown"}`,
          rawData: event.data,
        },
      };
    default:
      return {
        name: "Notification",
        input: {
          hook_event_name: "Notification",
          session_id: (d.session_id as string) ?? event.agentId,
          message: event.type + (event.data?.message ? `：${event.data?.message}` : ""),
          rawData: event.data,
        },
      };
  }
}
