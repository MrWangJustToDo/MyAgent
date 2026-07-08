import { agentManager, formatAgentStreamError, localConnect } from "@my-agent/core";
import { useChat } from "@tanstack/ai-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAdapter } from "../context/adapter-context.js";
import { isToolCallPart, parseToolInput } from "../utils/tool-part.js";

import { useAgent } from "./use-agent.js";
import { useChatStatus } from "./use-chat-status.js";
import { useForceUpdate } from "./use-force-update.js";

import type { ChatStatus } from "./use-chat-status.js";
import type { AppConfig } from "../adapter/types.js";
import type { Attachment } from "../types/attachment.js";
import type { ManagedAgent } from "@my-agent/core";
import type { ContentPart, UIMessage } from "@tanstack/ai";

// ============================================================================
// Types
// ============================================================================

export type { ChatStatus };

export interface SendMessageContent {
  text: string;
  files?: Attachment[];
}

export interface UseAgentChatReturn {
  messages: UIMessage[];
  sendMessage: (content: string | SendMessageContent) => Promise<void>;
  status: ChatStatus;
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
}

function attachmentToContentPart(attachment: Attachment): ContentPart {
  if (attachment.type === "image") {
    return {
      type: "image",
      source: { type: "url", value: attachment.dataUrl },
      metadata: { mediaType: attachment.mediaType, filename: attachment.filename },
    };
  }
  return {
    type: "text",
    content: `[Attached file: ${attachment.filename}]`,
  };
}

const noopConnection = {
  connect: () =>
    (async function* () {
      /* empty until agent is ready */
    })(),
};

// ============================================================================
// Hook
// ============================================================================

export function useAgentChat(config: AppConfig): UseAgentChatReturn {
  const adapter = useAdapter();

  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<Error | null>(null);
  const [agent, setAgent] = useState<ManagedAgent | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

  const agentError = useAgent((s) => (s.agent as ManagedAgent)?.error || "");

  const forceUpdate = useForceUpdate({ time: 100 });
  const initIdRef = useRef(0);

  useEffect(() => {
    const currentInitId = ++initIdRef.current;

    const init = async () => {
      setInitLoading(true);
      setInitError(null);

      try {
        await adapter.destroy();
        if (currentInitId !== initIdRef.current) return;

        const result = await adapter.initialize(config);
        if (currentInitId !== initIdRef.current) return;

        setAgent(result.agent);
        setAgentId(result.agent?.id ?? null);
        setInitialMessages((result.initialMessages as UIMessage[] | undefined) ?? []);
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
      }, 500);
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

  const connection = useMemo(() => (agentId ? localConnect(agentId) : noopConnection), [agentId]);

  // useChat constructs ChatClient once per `id` and does not hot-swap `connection`.
  // Recreate the client when agentId becomes available so sends use localConnect, not noopConnection.
  const chat = useChat({
    id: agentId ?? "pending",
    connection,
    initialMessages,
  });

  useEffect(() => {
    forceUpdate();
  }, [chat.messages, agentError, forceUpdate]);

  const prevStatusRef = useRef(chat.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = chat.status;
    if ((prev === "streaming" || prev === "submitted") && chat.status === "ready") {
      if (chat.messages.length > 0 && agent) {
        agent.updateSessionUIMessages(chat.messages);
      }
    }
  }, [chat.status, chat.messages, agent]);

  const stop = () => {
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
    chat.stop();
    forceUpdate();
  };

  const sendMessage = useCallback(
    async (content: string | SendMessageContent) => {
      if (!agentId) return;

      if (typeof content === "string") {
        await chat.sendMessage(content);
      } else if (content.files?.length) {
        const parts: ContentPart[] = [{ type: "text", content: content.text }];
        for (const file of content.files) {
          parts.push(attachmentToContentPart(file));
        }
        await chat.sendMessage({ content: parts });
      } else {
        await chat.sendMessage(content.text);
      }
      forceUpdate();
    },
    [agentId, chat, forceUpdate]
  );

  const clearMessages = useCallback(() => {
    chat.clear();
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
      await chat.addToolApprovalResponse({
        id: options.id,
        approved: options.approved,
      });

      forceUpdate();
    },
    [chat, forceUpdate]
  );

  const status = chat.status as ChatStatus;

  const messages = chat.messages;

  const allPendingApproval = useMemo(() => {
    const all: UseAgentChatReturn["allPendingApproval"] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (!isToolCallPart(part)) continue;
        if (part.approval?.needsApproval && part.approval.approved === undefined) {
          all.push({
            id: part.approval.id,
            toolName: part.name,
            toolCallId: part.id,
          });
        }
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

  useEffect(() => {
    useChatStatus.getActions().setStatus(status);
    useChatStatus.getActions().setError(chat.error ? formatAgentStreamError(chat.error) : null);
    useChatStatus.getActions().setPendingApprovalCount(allPendingApproval.length);
  }, [status, chat.error, allPendingApproval.length]);

  useEffect(() => {
    useChatStatus.getActions().setPendingAskUserCount(allPendingAskUser.length);
  }, [allPendingAskUser]);

  const addToolOutput = useCallback(
    async (options: { tool: string; toolCallId: string; output: Record<string, unknown> }) => {
      await chat.addToolResult({
        tool: options.tool,
        toolCallId: options.toolCallId,
        output: options.output,
      });
    },
    [chat]
  );

  return {
    messages,
    sendMessage,
    allPendingApproval,
    allPendingAskUser,
    addToolOutput,
    status,
    isLoading: chat.isLoading,
    isReady: !initLoading && agentId !== null,
    stop,
    clearMessages,
    setMessages: chat.setMessages,
    error: chat.error ?? null,
    initLoading,
    initError,
    addToolApprovalResponse,
  };
}
