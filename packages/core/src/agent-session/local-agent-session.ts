/**
 * In-process AgentSession: fans domain Emitters + filtered AgentEventBus into channels.
 */

import { subscribeStreamingCallback, subscribeStreamingClearCallback } from "../agent/tools/util/streaming-callback.js";

import { DEFAULT_SESSION_LIFECYCLE_EVENTS } from "./lifecycle-filter.js";
import {
  DEFAULT_AGENT_SESSION_CHANNELS,
  type AgentSession,
  type AgentSessionChannel,
  type AgentSessionCommand,
  type AgentSessionCommandResult,
  type AgentSessionSnapshot,
  type AgentSessionSubagentSummary,
  type AgentSessionSubscribeOptions,
  type AgentSessionSubscriber,
} from "./types.js";

import type { AgentManager } from "../managers/agent-manager.js";
import type { ManagedAgent } from "../managers/managed-agent.js";
import type { AgentEventType } from "../runtime-types/agent-events.js";

const SUBAGENT_ALLOWED_COMMANDS = new Set<AgentSessionCommand["type"]>(["stop"]);

export interface CreateLocalAgentSessionOptions {
  managed: ManagedAgent;
  manager?: AgentManager | null;
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

function buildSubagentSummaries(
  managed: ManagedAgent,
  manager: AgentManager | null | undefined
): AgentSessionSubagentSummary[] {
  if (!manager) return [];
  return manager.getSubagents(managed.id).map((child) => ({
    id: child.id,
    status: child.status,
    name: child.name,
    ...(child.parentTaskId ? { parentTaskToolCallId: child.parentTaskId } : {}),
  }));
}

function readSnapshot(managed: ManagedAgent, manager: AgentManager | null | undefined): AgentSessionSnapshot {
  const chat = managed.getChatController();
  const todos = managed.todoManager;
  return {
    agentId: managed.id,
    ...(managed.parentId ? { parentId: managed.parentId } : {}),
    status: managed.status,
    error: managed.error,
    pendingApprovalCount: managed.pendingApprovalCount,
    messages: chat?.getMessages() ?? managed.ui?.getMessages() ?? [],
    queues: chat?.getQueuedMessages() ?? { steer: [], followUp: [] },
    usage: managed.usage.getChangeSnapshot(),
    todos: todos?.getItems() ?? [],
    todosTitle: todos?.getTitle() ?? null,
    plan: managed.getPlanModeState(),
    autoApprove: managed.isAutoApproveEnabled(),
    subagents: buildSubagentSummaries(managed, manager),
  };
}

async function dispatchCommand(
  managed: ManagedAgent,
  manager: AgentManager | null | undefined,
  command: AgentSessionCommand
): Promise<AgentSessionCommandResult> {
  const isSubagent = Boolean(managed.parentId);
  if (isSubagent && !SUBAGENT_ALLOWED_COMMANDS.has(command.type)) {
    return {
      ok: false,
      code: "unsupported",
      error: `Command "${command.type}" is not supported on subagent sessions`,
    };
  }

  const chat = managed.getChatController();

  try {
    switch (command.type) {
      case "send": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        await chat.sendMessage(command.content);
        return { ok: true };
      }
      case "steer": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        chat.steer(command.content);
        return { ok: true };
      }
      case "followUp": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        chat.followUp(command.content);
        return { ok: true };
      }
      case "forceSubmit": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        chat.forceSubmit(command.content);
        return { ok: true };
      }
      case "stop": {
        if (chat) {
          chat.stop();
        } else {
          managed.abort("user-cancelled");
        }
        return { ok: true };
      }
      case "clear": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        chat.clearMessages();
        return { ok: true };
      }
      case "respondApproval": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        await chat.respondToToolApproval(command.approvalId, command.approved, command.reason);
        return { ok: true };
      }
      case "addToolResult": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        await chat.addToolResult(command.toolCallId, command.output);
        return { ok: true };
      }
      case "setClientToolWaiting": {
        managed.setClientToolWaiting(command.active);
        return { ok: true };
      }
      case "compact": {
        return {
          ok: false,
          code: "unsupported",
          error: "compact via AgentSession is not wired yet; use /compact command path",
        };
      }
      case "rename": {
        managed.name = command.name.trim();
        return { ok: true };
      }
      case "auto.set": {
        managed.setAutoApproveEnabled(command.enabled);
        return { ok: true };
      }
      case "plan.enable": {
        managed.enablePlanMode();
        return { ok: true };
      }
      case "plan.disable": {
        managed.disablePlanMode();
        return { ok: true };
      }
      case "plan.toggle": {
        const phase = managed.togglePlanMode();
        return { ok: true, data: { phase } };
      }
      case "plan.execute": {
        const result = managed.beginPlanExecution({ sendSteer: command.sendSteer });
        return result.ok
          ? { ok: true, data: result }
          : { ok: false, code: "failed", error: result.error ?? "plan execute failed" };
      }
      case "plan.cancel": {
        const ok = managed.cancelPlanExecution();
        return ok ? { ok: true } : { ok: false, code: "failed", error: "Cannot cancel plan execution" };
      }
      case "session.resume": {
        if (!manager) {
          return { ok: false, code: "failed", error: "AgentManager required for session.resume" };
        }
        const data = await managed.restoreSession(command.sessionId);
        return { ok: true, data: { sessionId: data.id } };
      }
      default: {
        const _exhaustive: never = command;
        return { ok: false, code: "invalid", error: `Unknown command: ${JSON.stringify(_exhaustive)}` };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, code: "failed", error: message };
  }
}

class LocalAgentSessionImpl implements AgentSession {
  readonly id: string;
  private readonly managed: ManagedAgent;
  private readonly manager: AgentManager | null | undefined;
  private readonly lifecycleEvents: readonly AgentEventType[];

  constructor(options: CreateLocalAgentSessionOptions) {
    this.managed = options.managed;
    this.manager = options.manager ?? options.managed.manager ?? null;
    this.id = options.managed.id;
    this.lifecycleEvents = options.lifecycleEvents ?? DEFAULT_SESSION_LIFECYCLE_EVENTS;
  }

  getSnapshot(): AgentSessionSnapshot {
    return readSnapshot(this.managed, this.manager);
  }

  getSummaryStreamSnapshot(key: string) {
    return this.managed.summaryStreams?.getSnapshot(key) ?? null;
  }

  dispatch(command: AgentSessionCommand): Promise<AgentSessionCommandResult> {
    return dispatchCommand(this.managed, this.manager, command);
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

    if (channelAllowed("lifecycle", selected) && manager) {
      const filter = new Set(this.lifecycleEvents);
      for (const type of this.lifecycleEvents) {
        unsubs.push(
          manager.on(type, (event) => {
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
  manager: AgentManager,
  subagentId: string,
  options?: Omit<CreateLocalAgentSessionOptions, "managed" | "manager">
): AgentSession | null {
  const child = manager.getAgent(subagentId);
  if (!child) return null;
  return createLocalAgentSession({ managed: child, manager, ...options });
}
