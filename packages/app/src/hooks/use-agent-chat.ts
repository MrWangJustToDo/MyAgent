import { agentManager, isActiveStatus } from "@my-agent/core";
import { throttle } from "lodash-es";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAdapter } from "../context/adapter-context.js";
import { isToolCallPart, isPendingToolApproval, parseToolInput } from "../utils/tool-part.js";

import { useAgent } from "./use-agent.js";
import { useCallbackRef } from "./use-callback-ref.js";
import { useForceUpdate } from "./use-force-update.js";
import { getWorkSpaceInfo } from "./use-workspace-info.js";

import type { AppConfig } from "../adapter/types.js";
import type { Attachment } from "../types/attachment.js";
import type { AgentChatController, AgentStatus, ManagedAgent, QueuedMessagesSnapshot } from "@my-agent/core";
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
  /** Queue a mid-run correction (after current tool batch). Idle → sendMessage. */
  steer: (content: string | SendMessageContent) => void;
  /** Queue a message for when the agent would stop. Idle → sendMessage. */
  followUp: (content: string | SendMessageContent) => void;
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
  const [chat, setChat] = useState<AgentChatController | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessagesSnapshot>({ steer: [], followUp: [] });

  const forceUpdate = useForceUpdate({ time: 100 });
  const initIdRef = useRef(0);
  const messagesRef = useRef<UIMessage[]>([]);

  useEffect(() => {
    if (agent) {
      useAgent.getActions().setAgent(agent);
    }
  }, [agent]);

  useEffect(() => {
    if (!agent) return;
    return agent.observe({
      onState: () => {
        forceUpdate();
        const next = messagesRef.current;
        if (next.length > 0) {
          agent.maybeSaveSessionUIMessages(next, "checkpoint");
        }
      },
    });
  }, [agent, forceUpdate]);

  useEffect(() => {
    const currentInitId = ++initIdRef.current;

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

        setAgent(managed);
        setChat(controller);
        const initial = controller.getMessages();
        messagesRef.current = initial;
        setMessages(initial);
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
    if (!chat) return;

    const updateUi = throttle((next: UIMessage[]) => {
      messagesRef.current = next;
      setMessages(next);
      agent?.maybeSaveSessionUIMessages(next, "checkpoint");
    }, 60);

    const unsubMessages = chat.subscribeMessages(updateUi);
    const unsubQueue = chat.subscribeQueuedMessages(setQueuedMessages);

    return () => {
      unsubMessages();
      unsubQueue();
    };
  }, [chat, agent, forceUpdate]);

  const status = agent?.status ?? "idle";
  const error = agent?.error ? new Error(agent.error) : null;
  const isLoading = agent ? isAgentLoading(agent.status) : false;

  const saveSessionFromChat = useCallbackRef(() => {
    if (messages.length > 0 && agent) {
      agent.saveSessionUIMessages(messages);
    }
  });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const stop = useCallback(() => {
    if (agent) {
      const activeSubagents = agentManager.getActiveSubagents(agent.id);
      if (activeSubagents.length > 0) {
        for (const sub of activeSubagents) {
          sub.abort("user-cancelled");
        }
        forceUpdate();
        return;
      }
    }
    chat?.stop();
    forceUpdate();
  }, [agent, chat, forceUpdate]);

  const sendMessage = useCallback(
    async (content: string | SendMessageContent) => {
      if (!chat) return;
      await chat.sendMessage(toChatContent(content));
      forceUpdate();
    },
    [chat, forceUpdate]
  );

  const steer = useCallback(
    (content: string | SendMessageContent) => {
      if (!chat) return;
      chat.steer(toChatContent(content));
      forceUpdate();
    },
    [chat, forceUpdate]
  );

  const followUp = useCallback(
    (content: string | SendMessageContent) => {
      if (!chat) return;
      chat.followUp(toChatContent(content));
      forceUpdate();
    },
    [chat, forceUpdate]
  );

  const clearMessages = useCallback(() => {
    chat?.clearMessages();
    messagesRef.current = [];
    setMessages([]);
    setQueuedMessages({ steer: [], followUp: [] });
  }, [chat]);

  const addToolApprovalResponse = useCallback(
    async (options: {
      id: string;
      approved: boolean;
      reason?: string;
      isLast?: boolean;
      toolCallId?: string;
      toolName?: string;
    }) => {
      await chat?.respondToToolApproval(options.id, options.approved, options.reason);
      forceUpdate();
    },
    [chat, forceUpdate]
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
      agent?.setClientToolWaiting(active);
      forceUpdate();
    },
    [agent, forceUpdate]
  );

  const addToolOutput = useCallback(
    async (options: { tool: string; toolCallId: string; output: Record<string, unknown> }) => {
      await chat?.addToolResult(options.toolCallId, options.output);
      forceUpdate();
    },
    [chat, forceUpdate]
  );

  return {
    messages,
    sendMessage,
    steer,
    followUp,
    queuedMessages,
    allPendingApproval,
    allPendingAskUser,
    addToolOutput,
    setClientToolWaiting,
    status,
    isLoading,
    isReady: !initLoading && chat !== null,
    stop,
    clearMessages,
    setMessages: (next) => {
      chat?.setMessages(next);
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
