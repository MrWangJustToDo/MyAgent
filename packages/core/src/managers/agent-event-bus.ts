import { emitHook } from "../agent/hooks/hook-runner.js";

import type { HookRegistry } from "../agent/hooks/hook-registry.js";
import type { HookLogger } from "../agent/hooks/hook-runner.js";
import type { HookEventInput, HookEventType } from "../agent/hooks/types.js";

// ============================================================================
// Event Types
// ============================================================================

/** All agent lifecycle event types */
export type AgentEventType =
  // Agent lifecycle
  | "session:start"
  | "prompt:submit"
  | "tool:post"
  | "tool:error"
  | "agent:stop"
  | "notification"
  // Subagent lifecycle
  | "subagent:created"
  | "subagent:started"
  | "subagent:step"
  | "subagent:completed"
  | "subagent:error"
  | "subagent:destroyed";

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
  agent: {
    hookRegistry: HookRegistry | null | undefined;
  };
  log?: HookLogger | null;
}

export type AgentEventHookTargetResolver = (event: AgentEvent) => AgentEventHookTarget | undefined;

// ============================================================================
// AgentEventBus
// ============================================================================

/** In-process event bus that also bridges events to configured hook scripts. */
export class AgentEventBus {
  private eventListeners: Map<AgentEventType | "*", Set<AgentEventListener>> = new Map();

  constructor(private readonly resolveHookTarget?: AgentEventHookTargetResolver) {}

  /**
   * Subscribe to agent events.
   *
   * @param type - Event type or "*" for all events
   * @param listener - Callback function
   * @returns Unsubscribe function
   */
  on(type: AgentEventType | "*", listener: AgentEventListener): () => void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);

    return () => {
      this.eventListeners.get(type)?.delete(listener);
    };
  }

  /** Emit an agent event. Dispatches to both in-process listeners and hook scripts. */
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
    const registry = target?.agent.hookRegistry;
    if (!registry) return;

    const hookEvent = mapToHookEvent(event);
    if (!hookEvent) return;

    const matchValue =
      event.type === "tool:post" || event.type === "tool:error"
        ? (event.data?.tool_name as string | undefined)
        : undefined;

    emitHook(registry, hookEvent.name, hookEvent.input, { matchValue, logger: target.log ?? undefined });
  }
}

// ============================================================================
// Event -> Hook Mapping
// ============================================================================

/** Map a unified AgentEvent to the corresponding HookEventType + HookEventInput. Returns null if no hook applies. */
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
    case "tool:post":
      return {
        name: "PostToolUse",
        input: {
          hook_event_name: "PostToolUse",
          session_id: (d.session_id as string) ?? event.agentId,
          tool_name: (d.tool_name as string) ?? "",
          tool_input: d.tool_input,
          tool_output: d.tool_output,
          duration_ms: (d.duration_ms as number) ?? 0,
        },
      };
    case "tool:error":
      return {
        name: "PostToolUseFailure",
        input: {
          hook_event_name: "PostToolUseFailure",
          session_id: (d.session_id as string) ?? event.agentId,
          tool_name: (d.tool_name as string) ?? "",
          tool_input: d.tool_input,
          error: (d.error as string) ?? "",
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
    case "notification":
      return {
        name: "Notification",
        input: {
          hook_event_name: "Notification",
          session_id: (d.session_id as string) ?? event.agentId,
          message: (d.message as string) ?? "",
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
    default:
      return null;
  }
}
