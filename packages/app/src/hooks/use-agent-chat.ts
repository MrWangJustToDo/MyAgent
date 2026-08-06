import { agentManager, createLocalAgentSession, isActiveStatus } from "@my-agent/core";
import { throttle } from "lodash-es";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { bindAgentSession } from "../adapter/create-agent.js";
import { useAdapter } from "../context/adapter-context.js";
import { clearFlatMessageCache } from "../utils/message-flat-cache.js";
import { isToolCallPart, isPendingToolApproval, parseToolInput } from "../utils/tool-part.js";

import { useAgentStatus } from "./use-agent-status.js";
import { useAgent } from "./use-agent.js";
import { useCallbackRef } from "./use-callback-ref.js";
import { useForceUpdate } from "./use-force-update.js";
import { useTodoManager } from "./use-todo-manager.js";
import { handleToolLifecycleEvent } from "./use-tool-timing-store.js";
import { getWorkSpaceInfo } from "./use-workspace-info.js";

import type { AppConfig } from "../adapter/types.js";
import type { Attachment } from "../types/attachment.js";
import type {
  AgentChatController,
  AgentSession,
  AgentStatus,
  ManagedAgent,
  QueuedMessagesSnapshot,
} from "@my-agent/core";
import type { ContentPart, UIMessage } from "@tanstack/ai";

// ============================================================================
// Types
// ============================================================================

export interface SendMessageContent {
  text: string;
  files?: Attachment[];
}

export interface UseAgentChatReturn {
  messages: UIMessage[];
  sendMessage: (content: string | SendMessageContent) => Promise<void>;
  /**
   * Queue a mid-run correction (after current tool batch). Idle → sendMessage.
   *
   * NOTE: Not the default keybinding anymore. Enter (running) → followUp;
   * Option+Enter → forceSubmit. `steer` is for programmatic use where you
   * want the message delivered within the same turn (before the next LLM call).
   */
  steer: (content: string | SendMessageContent) => void;
  /** Queue a message for when the agent would stop. Idle → sendMessage. */
  followUp: (content: string | SendMessageContent) => void;
  /** Force-submit: abort current run, inject message, start new pump. */
  forceSubmit: (content: string | SendMessageContent) => void;
  queuedMessages: QueuedMessagesSnapshot;
  status: AgentStatus;
  isLoading: boolean;
  isReady: boolean;
  stop: () => void;
  clearMessages: () => void;
  setMessages: (messages: UIMessage[]) => void;
  error: Error | null;
  initLoading: boolean;
  initError: Error | null | undefined;
  addToolApprovalResponse: (options: {
    id: string;
    approved: boolean;
    reason?: string;
    isLast?: boolean;
    toolCallId?: string;
    toolName?: string;
  }) => void;
  allPendingApproval: Array<{
    id: string;
    toolName: string;
    toolCallId: string;
  }>;
  allPendingAskUser: Array<{
    toolCallId: string;
    question: string;
    options?: string[];
    multiSelect?: boolean;
  }>;
  addToolOutput: (options: { tool: string; toolCallId: string; output: Record<string, unknown> }) => void;
  /** Pause/resume status while a client tool waits for user input (`ask_user`). */
  setClientToolWaiting: (active: boolean) => void;
  /** Flush chat messages to session (single write path for `uiMessages`). */
  saveSessionFromChat: () => void;
}

function attachmentToContentPart(attachment: Attachment, imageIndex?: number): ContentPart {
  if (attachment.type === "image") {
    return {
      type: "image",
      source: { type: "url", value: attachment.dataUrl },
      metadata: {
        mediaType: attachment.mediaType,
        filename: attachment.filename,
        ...(imageIndex !== undefined ? { imageIndex } : {}),
      },
    };
  }
  return {
    type: "text",
    content: `[Attached file: ${attachment.filename}]`,
  };
}

function toChatContent(content: string | SendMessageContent): string | ContentPart[] {
  if (typeof content === "string") return content;
  if (!content.files?.length) return content.text;
  const parts: ContentPart[] = [{ type: "text", content: content.text }];
  let imageIndex = 0;
  for (const file of content.files) {
    if (file.type === "image") {
      imageIndex += 1;
      parts.push(attachmentToContentPart(file, imageIndex));
    } else {
      parts.push(attachmentToContentPart(file));
    }
  }
  return parts;
}

function isAgentLoading(status: AgentStatus): boolean {
  return isActiveStatus(status) && status !== "waiting" && status !== "awaiting_user";
}

// ============================================================================
// Hook
// ============================================================================

export function useAgentChat(config: AppConfig): UseAgentChatReturn {
  const adapter = useAdapter();

  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<Error | null>(null);
  const [agent, setAgent] = useState<ManagedAgent | null>(null);
  const [session, setSession] = useState<AgentSession | null>(null);
  const [chat, setChat] = useState<AgentChatController | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessagesSnapshot>({ steer: [], followUp: [] });
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [agentError, setAgentError] = useState("");

  const forceUpdate = useForceUpdate({ time: 100 });
  const initIdRef = useRef(0);

  useEffect(() => {
    if (agent) {
      useAgent.getActions().setAgent(agent);
    }
  }, [agent]);

  useEffect(() => {
    const currentInitId = ++initIdRef.current;

    const setAgentStatus = useAgentStatus.getActions().setStatus;

    const init = async () => {
      setInitLoading(true);
      setInitError(null);

      try {
        await getWorkSpaceInfo();
        await adapter.destroy();
        if (currentInitId !== initIdRef.current) return;

        const result = await adapter.initialize(config);
        if (currentInitId !== initIdRef.current) return;

        const managed = result.agent;
        const controller = managed.initChat(agentManager, (result.initialMessages as UIMessage[] | undefined) ?? []);
        const localSession = createLocalAgentSession({ managed, manager: agentManager });
        bindAgentSession(localSession, { useAgent });

        setAgent(managed);
        setChat(controller);
        setSession(localSession);
        const initial = controller.getMessages();
        setMessages(initial);
        setStatus(managed.status);
        setAgentError(managed.error);
        setAgentStatus(managed.status);
        setQueuedMessages(controller.getQueuedMessages());
        managed.resetSessionSyncTracker(initial);
        managed.syncInteractionStateFromUIMessages(initial);
      } catch (e) {
        if (currentInitId !== initIdRef.current) return;
        setInitError(e as Error);
      }

      if (currentInitId !== initIdRef.current) return;
      setTimeout(() => {
        if (typeof process === "object") {
          import("ansi-escapes").then((pkg) => process?.stdout?.write?.(pkg.clearScreen + pkg.cursorTo(0, 0)));
        }
        setInitLoading(false);
      }, 200);
    };

    void init();

    return () => {
      bindAgentSession(null, { useAgent });
      void adapter.destroy();
    };
  }, [
    config.model,
    config.baseURL,
    config.systemPrompt,
    config.maxIterations,
    config.style,
    config.apiKey,
    config.mcpConfigPath,
    adapter,
    config,
  ]);

  useEffect(() => {
    if (!session || !agent) return;

    const setAgentStatus = useAgentStatus.getActions().setStatus;

    // UI only — session disk writes are owned by core (user-message / pump-complete / force).
    const updateUi = throttle((next: UIMessage[]) => {
      setMessages(next);
    }, 60);

    return session.subscribe(
      (event) => {
        if (event.channel === "messages") {
          updateUi(event.payload);
          return;
        }
        if (event.channel === "queues") {
          setQueuedMessages(event.payload);
          return;
        }
        if (event.channel === "state") {
          setStatus(event.payload.status);
          setAgentError(event.payload.error);
          setAgentStatus(event.payload.status);
          forceUpdate();
          return;
        }
        if (event.channel === "todos") {
          useTodoManager.getActions().refresh();
          return;
        }
        if (event.channel === "lifecycle") {
          handleToolLifecycleEvent(event.payload);
        }
      },
      { channels: ["messages", "queues", "state", "todos", "lifecycle"] }
    );
  }, [session, agent, forceUpdate]);

  const error = agentError ? new Error(agentError) : null;
  const isLoading = isAgentLoading(status);

  const saveSessionFromChat = useCallbackRef(() => {
    if (messages.length > 0 && agent) {
      agent.saveSessionUIMessages(messages);
    }
  });

  const stop = useCallback(() => {
    if (agent) {
      const activeSubagents = agentManager.getActiveSubagents(agent.id);
      if (activeSubagents.length > 0) {
        for (const sub of activeSubagents) {
          void createLocalAgentSession({ managed: sub, manager: agentManager }).dispatch({ type: "stop" });
        }
        forceUpdate();
        return;
      }
    }
    void session?.dispatch({ type: "stop" });
    forceUpdate();
  }, [agent, session, forceUpdate]);

  const sendMessage = useCallback(
    async (content: string | SendMessageContent) => {
      if (!session) return;
      await session.dispatch({ type: "send", content: toChatContent(content) });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  const steer = useCallback(
    // NOTE: Not the default keybinding anymore. Enter (running) → followUp;
    // Option+Enter → forceSubmit. `steer` is kept for programmatic use where
    // you want the message delivered within the same turn (before the next LLM call).
    (content: string | SendMessageContent) => {
      if (!session) return;
      void session.dispatch({ type: "steer", content: toChatContent(content) });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  const followUp = useCallback(
    (content: string | SendMessageContent) => {
      if (!session) return;
      void session.dispatch({ type: "followUp", content: toChatContent(content) });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  const forceSubmit = useCallback(
    (content: string | SendMessageContent) => {
      if (!session) return;
      void session.dispatch({ type: "forceSubmit", content: toChatContent(content) });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  const clearMessages = useCallback(() => {
    void session?.dispatch({ type: "clear" });
    clearFlatMessageCache();
    setMessages([]);
    setQueuedMessages({ steer: [], followUp: [] });
  }, [session]);

  const addToolApprovalResponse = useCallback(
    async (options: {
      id: string;
      approved: boolean;
      reason?: string;
      isLast?: boolean;
      toolCallId?: string;
      toolName?: string;
    }) => {
      await session?.dispatch({
        type: "respondApproval",
        approvalId: options.id,
        approved: options.approved,
        reason: options.reason,
      });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  const allPendingApproval = useMemo(() => {
    const all: UseAgentChatReturn["allPendingApproval"] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (!isToolCallPart(part)) continue;
        if (!isPendingToolApproval(part)) continue;
        const approvalId = part.approval?.id;
        if (!approvalId) continue;
        all.push({
          id: approvalId,
          toolName: part.name,
          toolCallId: part.id,
        });
      }
    }
    return all;
  }, [messages]);

  const allPendingAskUser = useMemo(() => {
    const all: UseAgentChatReturn["allPendingAskUser"] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (!isToolCallPart(part)) continue;
        if (part.name !== "ask_user") continue;
        if (part.state !== "input-complete" || part.output !== undefined) continue;
        const input = parseToolInput(part) as
          | { question?: string; options?: string[]; multiSelect?: boolean }
          | undefined;
        all.push({
          toolCallId: part.id,
          question: input?.question ?? "",
          options: input?.options,
          multiSelect: input?.multiSelect,
        });
      }
    }
    return all;
  }, [messages]);

  const setClientToolWaiting = useCallback(
    (active: boolean) => {
      void session?.dispatch({ type: "setClientToolWaiting", active });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  const addToolOutput = useCallback(
    async (options: { tool: string; toolCallId: string; output: Record<string, unknown> }) => {
      await session?.dispatch({
        type: "addToolResult",
        toolCallId: options.toolCallId,
        output: options.output,
      });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  return {
    messages,
    sendMessage,
    steer,
    followUp,
    forceSubmit,
    queuedMessages,
    allPendingApproval,
    allPendingAskUser,
    addToolOutput,
    setClientToolWaiting,
    status,
    isLoading,
    isReady: !initLoading && session !== null,
    stop,
    clearMessages,
    setMessages: (next) => {
      chat?.setMessages(next);
      if (next.length === 0) clearFlatMessageCache();
      setMessages(next);
      agent?.syncInteractionStateFromUIMessages(next);
    },
    error,
    initLoading,
    initError,
    addToolApprovalResponse,
    saveSessionFromChat,
  };
}
