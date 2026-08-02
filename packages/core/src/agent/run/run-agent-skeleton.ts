/**
 * Shared single-run skeleton for InteractiveChat phases and Worker/subagent runs.
 *
 * Profiles own outer loops (chat pump vs one-shot worker). This module owns
 * UI attach, stream consume, and optional outcome application.
 *
 * Lives under `agent/run/` so Worker code can import it without crossing the
 * agent→managers boundary. Managers may import this module.
 */

import { consumeStreamToMessages } from "../subagent/consume-stream-to-messages.js";
import { AgentUIChannel } from "../ui-channel.js";

import type { AgentManager, ManagedAgent } from "../../runtime-types/hosts.js";
import type { ModelMessage, StreamChunk, UIMessage } from "@tanstack/ai";

export type AgentStreamConsumeMode = "ui" | "headless";

export interface EnsureUIChannelOptions {
  /** Used only when creating a new channel (no existing `managed.ui`). */
  initialMessages?: UIMessage[];
}

/**
 * Attach or reuse {@link AgentUIChannel} on a managed agent.
 * Sole UI attach helper for skeleton / UI runs.
 */
export function ensureUIChannel(managed: ManagedAgent, options?: EnsureUIChannelOptions): AgentUIChannel {
  const existing = managed.ui;
  if (existing) return existing;
  const channel = new AgentUIChannel({ initialMessages: options?.initialMessages });
  managed.setUIChannel(channel);
  return channel;
}

export interface ConsumeAgentStreamOptions {
  stream: AsyncIterable<StreamChunk>;
  mode: AgentStreamConsumeMode;
  /** Required when `mode` is `"ui"`. */
  channel?: AgentUIChannel;
  parentTaskToolCallId?: string;
  streamingAgentId?: string;
  onUpdate?: (messages: UIMessage[]) => void;
}

/**
 * Consume one agent stream into UIMessage snapshots (UI channel or headless).
 */
export async function consumeAgentStream(options: ConsumeAgentStreamOptions): Promise<UIMessage[]> {
  const { stream, mode, channel, parentTaskToolCallId, streamingAgentId, onUpdate } = options;

  if (mode === "headless") {
    return consumeStreamToMessages(stream);
  }

  if (!channel) {
    throw new Error('AgentUIChannel is required when consume mode is "ui"');
  }

  return (await channel.consumeRun({
    stream,
    parentTaskToolCallId,
    streamingAgentId,
    onUpdate,
  })) as UIMessage[];
}

export interface RunAgentOnceOutcome {
  path: "chat" | "detached";
  kind: "finished" | "aborted" | "error" | "waiting";
  errorMessage?: string;
  /** Override messages passed to applyRunOutcome (defaults to consumed messages). */
  messages?: UIMessage[];
}

export interface RunAgentOnceOptions {
  manager: AgentManager;
  agentId: string;
  messages?: Array<UIMessage | ModelMessage>;
  abortSignal?: AbortSignal;
  threadId?: string;
  runId?: string;
  consume: AgentStreamConsumeMode;
  /** Pre-attached channel for UI mode; otherwise {@link ensureUIChannel} is used. */
  channel?: AgentUIChannel;
  uiAttach?: EnsureUIChannelOptions;
  parentTaskToolCallId?: string;
  streamingAgentId?: string;
  onUpdate?: (messages: UIMessage[]) => void;
  /** Optional wrapper (e.g. finish-reason capture). Applied before consume. */
  transformStream?: (stream: AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>;
  /**
   * When set, apply run outcome after consume.
   * InteractiveChat pump omits this and finalizes after the full tool-phase loop.
   */
  outcome?: RunAgentOnceOutcome;
}

export interface RunAgentOnceResult {
  messages: UIMessage[];
  channel?: AgentUIChannel;
}

/**
 * One LLM/tool stream: start → consume → optional outcome.
 * Does not own chat queues, approvals, or session persistence.
 */
export async function runAgentOnce(options: RunAgentOnceOptions): Promise<RunAgentOnceResult> {
  const {
    manager,
    agentId,
    messages: inputMessages,
    abortSignal,
    threadId,
    runId,
    consume,
    uiAttach,
    parentTaskToolCallId,
    streamingAgentId,
    onUpdate,
    transformStream,
    outcome,
  } = options;

  const managed = manager.getAgent(agentId);
  if (!managed) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  let channel = options.channel;
  if (consume === "ui") {
    channel = channel ?? ensureUIChannel(managed, uiAttach);
  }

  let stream: AsyncIterable<StreamChunk> = manager.runAgentStream(agentId, {
    messages: inputMessages,
    abortSignal,
    threadId,
    runId,
  });
  if (transformStream) {
    stream = transformStream(stream);
  }

  const messages = await consumeAgentStream({
    stream,
    mode: consume,
    channel,
    parentTaskToolCallId,
    streamingAgentId,
    onUpdate,
  });

  if (outcome) {
    managed.statusController.applyRunOutcome({
      kind: outcome.kind,
      messages: outcome.messages ?? messages,
      path: outcome.path,
      errorMessage: outcome.errorMessage,
    });
  }

  return { messages, channel };
}
