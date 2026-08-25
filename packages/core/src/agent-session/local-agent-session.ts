/**
 * In-process AgentSession: fans domain Emitters + filtered AgentTelemetryBus into channels.
 */

import { subscribeStreamingCallback, subscribeStreamingClearCallback } from "../agent/tools/util/streaming-callback.js";

import { DEFAULT_SESSION_LIFECYCLE_EVENTS } from "./lifecycle-filter.js";
import { dispatchLocalAgentSessionCommand } from "./local-session-dispatch.js";
import { readLocalAgentSessionSnapshot } from "./local-session-snapshot.js";
import {
  DEFAULT_AGENT_SESSION_CHANNELS,
  type AgentSession,
  type AgentSessionChannel,
  type AgentSessionCommand,
  type AgentSessionCommandResult,
  type AgentSessionSnapshot,
  type AgentSessionSubscribeOptions,
  type AgentSessionSubscriber,
} from "./types.js";

import type { AgentManager } from "../managers/agent-manager.js";
import type { AgentEvent } from "../managers/agent-telemetry-bus.js";
import type { ManagedAgent } from "../managers/managed-agent.js";
import type { AgentEventType } from "../runtime-types/agent-events.js";

/** Manager surface used by Local Session (AgentManager satisfies this). */
export type LocalAgentSessionManager = Pick<AgentManager, "getAgent" | "getSubagents"> & {
  on?: (type: AgentEventType, listener: (event: AgentEvent) => void) => () => void;
};

export interface CreateLocalAgentSessionOptions {
  managed: ManagedAgent;
  manager?: LocalAgentSessionManager | null;
  /** Override lifecycle event filter (default {@link DEFAULT_SESSION_LIFECYCLE_EVENTS}). */
  lifecycleEvents?: readonly AgentEventType[];
}

function now(): number {
  return Date.now();
}

function channelAllowed(channel: AgentSessionChannel, selected: ReadonlySet<AgentSessionChannel>): boolean {
  return selected.has(channel);
}

function resolveChannels(options?: AgentSessionSubscribeOptions): Set<AgentSessionChannel> {
  if (options?.channels && options.channels.length > 0) {
    return new Set(options.channels);
  }
  return new Set(DEFAULT_AGENT_SESSION_CHANNELS);
}

class LocalAgentSessionImpl implements AgentSession {
  readonly id: string;
  private readonly managed: ManagedAgent;
  private readonly manager: LocalAgentSessionManager | null | undefined;
  private readonly lifecycleEvents: readonly AgentEventType[];

  constructor(options: CreateLocalAgentSessionOptions) {
    this.managed = options.managed;
    this.manager = options.manager ?? options.managed.manager ?? null;
    this.id = options.managed.id;
    this.lifecycleEvents = options.lifecycleEvents ?? DEFAULT_SESSION_LIFECYCLE_EVENTS;
  }

  getSnapshot(): AgentSessionSnapshot {
    return readLocalAgentSessionSnapshot(this.managed, this.manager);
  }

  getSummaryStreamSnapshot(key: string) {
    return this.managed.summaryStreams?.getSnapshot(key) ?? null;
  }

  listSummaryStreamSnapshots() {
    return this.managed.summaryStreams?.listSnapshots() ?? [];
  }

  dispatch(command: AgentSessionCommand): Promise<AgentSessionCommandResult> {
    return dispatchLocalAgentSessionCommand(this.managed, this.manager, command);
  }

  subscribe(handler: AgentSessionSubscriber, options?: AgentSessionSubscribeOptions): () => void {
    const selected = resolveChannels(options);
    const unsubs: Array<() => void> = [];
    const managed = this.managed;
    const manager = this.manager;

    if (channelAllowed("state", selected)) {
      unsubs.push(
        managed.on("change", (payload) => {
          handler({ channel: "state", payload, ts: now() });
        })
      );
    }

    if (channelAllowed("messages", selected)) {
      let messagesUnsub: (() => void) | undefined;
      const wireMessages = () => {
        messagesUnsub?.();
        messagesUnsub = undefined;
        const ui = managed.ui;
        if (!ui) return;
        messagesUnsub = ui.on("messages", (payload) => {
          handler({ channel: "messages", payload, ts: now() });
        });
      };
      wireMessages();
      unsubs.push(
        managed.on("ui", () => {
          wireMessages();
        })
      );
      unsubs.push(() => {
        messagesUnsub?.();
      });
    }

    if (channelAllowed("queues", selected)) {
      const chat = managed.getChatController();
      if (chat) {
        unsubs.push(
          chat.on("change", (payload) => {
            handler({ channel: "queues", payload, ts: now() });
          })
        );
      }
    }

    if (channelAllowed("usage", selected)) {
      unsubs.push(
        managed.usage.on("change", (payload) => {
          handler({ channel: "usage", payload, ts: now() });
        })
      );
    }

    if (channelAllowed("todos", selected)) {
      const todos = managed.todoManager;
      if (todos) {
        unsubs.push(
          todos.on("change", (items) => {
            handler({
              channel: "todos",
              payload: { items, title: todos.getTitle() },
              ts: now(),
            });
          })
        );
      }
    }

    if (channelAllowed("plan", selected)) {
      unsubs.push(
        managed.planMode.on("change", (payload) => {
          handler({ channel: "plan", payload, ts: now() });
        })
      );
    }

    if (channelAllowed("tool", selected)) {
      unsubs.push(
        subscribeStreamingCallback(
          (chunk) => {
            handler({ channel: "tool", payload: { kind: "chunk", chunk }, ts: now() });
          },
          { agentId: managed.id }
        )
      );
      unsubs.push(
        subscribeStreamingClearCallback(
          (toolCallId) => {
            handler({ channel: "tool", payload: { kind: "clear", toolCallId }, ts: now() });
          },
          { agentId: managed.id }
        )
      );
    }

    if (channelAllowed("summary", selected) && managed.summaryStreams) {
      unsubs.push(
        managed.summaryStreams.subscribe((payload) => {
          handler({ channel: "summary", payload, ts: now() });
        })
      );
    }

    if (channelAllowed("log", selected) && managed.log) {
      unsubs.push(
        managed.log.on("entry", (payload) => {
          handler({ channel: "log", payload, ts: now() });
        })
      );
    }

    if (channelAllowed("extension-ui", selected)) {
      const ui = managed.extensionRunner?.getUI();
      if (ui) {
        unsubs.push(
          ui.subscribe<{ key: string; text: string }>("set-status", (data) => {
            handler({ channel: "extension-ui", payload: { type: "set-status", ...data }, ts: now() });
          }),
          ui.subscribe<{ message: string; level?: "success" | "info" | "error" }>("notify", (data) => {
            handler({ channel: "extension-ui", payload: { type: "notify", ...data }, ts: now() });
          }),
          ui.subscribe<{ id: string; component: string; props: Record<string, unknown> }>("set-widget", (data) => {
            handler({ channel: "extension-ui", payload: { type: "set-widget", ...data }, ts: now() });
          }),
          ui.subscribe<{ id: string; question: string }>("confirm", (data) => {
            handler({ channel: "extension-ui", payload: { type: "confirm", ...data }, ts: now() });
          })
        );
        // Reconcile status set before this subscription mounted (e.g. during
        // bootstrap, before the host's extension-ui subscription attaches).
        for (const [key, text] of Object.entries(ui.getStatus())) {
          if (text) {
            handler({ channel: "extension-ui", payload: { type: "set-status", key, text }, ts: now() });
          }
        }
      }
    }

    if (channelAllowed("lifecycle", selected) && manager?.on) {
      const filter = new Set(this.lifecycleEvents);
      const on = manager.on.bind(manager);
      for (const type of this.lifecycleEvents) {
        unsubs.push(
          on(type, (event) => {
            if (!filter.has(event.type)) return;
            if (event.agentId === managed.id || (event.parentId === managed.id && event.type.startsWith("subagent:"))) {
              handler({ channel: "lifecycle", payload: event, ts: now() });
            }
          })
        );
      }
    }

    let active = true;
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
}

/**
 * Create a Local AgentSession wrapping any ManagedAgent (root or subagent).
 */
export function createLocalAgentSession(options: CreateLocalAgentSessionOptions): AgentSession {
  return new LocalAgentSessionImpl(options);
}

/**
 * Open a child AgentSession by subagent id (same contract as the parent).
 */
export function sessionForSubagent(
  manager: LocalAgentSessionManager,
  subagentId: string,
  options?: Omit<CreateLocalAgentSessionOptions, "managed" | "manager">
): AgentSession | null {
  const child = manager.getAgent(subagentId);
  if (!child) return null;
  return createLocalAgentSession({ managed: child, manager, ...options });
}
