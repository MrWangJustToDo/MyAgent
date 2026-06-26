/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Chat, useChat as useAiSdkChat } from "@ai-sdk/react";
import { generateId } from "@my-agent/core";
import {
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useEffect, useCallback, useState, useRef, useMemo } from "react";

import { useAdapter } from "../context/adapter-context.js";

import { useAgent } from "./use-agent.js";
import { useChatStatus } from "./use-chat-status.js";
import { useForceUpdate } from "./use-force-update.js";

import type { AppConfig } from "../adapter/types.js";
import type { Agent } from "@my-agent/core";
import type { ChatTransport, FileUIPart, UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai";

// ============================================================================
// Types
// ============================================================================

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

export interface SendMessageContent {
  text: string;
  files?: FileUIPart[];
}

export interface UseAgentChatReturn {
  messages: UIMessage[];
  sendMessage: (content: string | SendMessageContent) => Promise<void>;
  status: ChatStatus;
  isLoading: boolean;
  isReady: boolean;
  stop: () => void;
  clearMessages: () => void;
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
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

// ============================================================================
// Hook
// ============================================================================

export function useAgentChat(config: AppConfig): UseAgentChatReturn {
  const adapter = useAdapter();

  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<Error | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);

  // @ts-ignore
  const agentError = useAgent((s) => (s.agent as Agent)?.error || "");

  const forceUpdate = useForceUpdate({ time: 100 });

  const chatRef = useRef<Chat<UIMessage> | null>(null);
  const pendingApprovalLengthRef = useRef(0);

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

        const transport = adapter.createTransport() as ChatTransport<UIMessage>;

        chatRef.current = new Chat<UIMessage>({
          id: generateId("chat"),
          transport,
          messages: result.initialMessages ?? [],
          sendAutomaticallyWhen(options) {
            return (
              lastAssistantMessageIsCompleteWithApprovalResponses(options) ||
              lastAssistantMessageIsCompleteWithToolCalls(options)
            );
          },
        });

        setAgent(result.agent);
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

    init();

    return () => {
      void adapter.destroy();
    };
  }, [
    config.model,
    config.url,
    config.systemPrompt,
    config.maxIterations,
    config.provider,
    config.apiKey,
    config.mcpConfigPath,
    adapter,
    config,
  ]);

  const chatHelpers = useAiSdkChat<UIMessage>(
    chatRef.current
      ? {
          chat: chatRef.current,
          experimental_throttle: 100,
        }
      : {}
  );

  useEffect(() => {
    forceUpdate();
  }, [chatHelpers.messages, agentError]);

  const prevStatusRef = useRef(chatHelpers.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = chatHelpers.status;
    if ((prev === "streaming" || prev === "submitted") && chatHelpers.status === "ready") {
      if (chatHelpers.messages.length > 0 && agent) {
        agent.updateSessionUIMessages(chatHelpers.messages as UIMessage[]);
      }
    }
  }, [chatHelpers.status, chatHelpers.messages, agent]);

  const stop = () => {
    chatHelpers.stop();
    forceUpdate();
  };

  const sendMessage = useCallback(
    async (content: string | SendMessageContent) => {
      if (!chatRef.current) return;

      if (typeof content === "string") {
        await chatHelpers.sendMessage({ text: content });
      } else if (content.files && content.files.length > 0) {
        await chatHelpers.sendMessage({ text: content.text, files: content.files });
      } else {
        await chatHelpers.sendMessage({ text: content.text });
      }
      forceUpdate();
    },
    [chatHelpers, forceUpdate]
  );

  const clearMessages = useCallback(() => {
    chatHelpers.setMessages([]);
    chatHelpers.clearError();
  }, [chatHelpers]);

  const addToolApprovalResponse = useCallback(
    (options: {
      id: string;
      approved: boolean;
      reason?: string;
      isLast?: boolean;
      toolCallId?: string;
      toolName?: string;
    }) => {
      if (options.approved) {
        chatHelpers.addToolApprovalResponse({
          id: options.id,
          approved: true,
          reason: options.reason,
        });
      } else {
        const errorText = "<error> Tool execution denied by user. </error>" + (options.reason ?? "");

        const updatePart = (part: UIMessagePart<UIDataTypes, UITools>): UIMessagePart<UIDataTypes, UITools> =>
          isToolUIPart(part) && part.state === "approval-requested" && part.approval.id === options.id
            ? {
                ...part,
                state: "output-denied",
                approval: { id: options.id, approved: false, reason: errorText },
              }
            : part;

        chatHelpers.setMessages((message) => {
          return message.map((i) => {
            if (i.role === "assistant") {
              return {
                ...i,
                parts: i.parts.map(updatePart),
              };
            } else {
              return i;
            }
          });
        });

        if (pendingApprovalLengthRef.current === 1) {
          chatHelpers.sendMessage();
        }

        // avoid call the original method
        // 默认拒绝方法只会将state修改为 approval-responded . SEE https://github.com/vercel/ai/blob/50c29b0dc2d23dff959bde8eea21594ba61c46c6/packages/ai/src/ui/chat.ts#L496C23-L496C41
        // 而在cover转换中，需要 output- 才会生成结果传给llm . SEE https://github.com/vercel/ai/blob/50c29b0dc2d23dff959bde8eea21594ba61c46c6/packages/ai/src/ui/convert-to-model-messages.ts#L310
        // chatHelpers.addToolApprovalResponse({
        //   id: options.id,
        //   approved: false,
        //   reason: errorText,
        // });
      }
    },
    [chatHelpers]
  );

  const status = chatHelpers.status;

  useEffect(() => {
    useChatStatus.getActions().setStatus(chatHelpers.status);
    useChatStatus.getActions().setError(chatHelpers.error ?? null);
  }, [chatHelpers.status, chatHelpers.error]);

  const messages = chatHelpers.messages;

  const allPendingApproval = useMemo(() => {
    const all: UseAgentChatReturn["allPendingApproval"] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as UIMessage;
      if (msg.role === "assistant") {
        for (const part of msg.parts) {
          if (isToolUIPart(part)) {
            const toolPart = part;
            if (toolPart.state === "approval-requested" && toolPart.approval) {
              all.push({
                id: toolPart.approval.id,
                toolName: getToolName(toolPart),
                toolCallId: toolPart.toolCallId,
              });
            }
          }
        }
      }
    }
    return all;
  }, [messages]);

  const allPendingAskUser = useMemo(() => {
    const all: UseAgentChatReturn["allPendingAskUser"] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as UIMessage;
      if (msg.role === "assistant") {
        for (const part of msg.parts) {
          if (isToolUIPart(part) && getToolName(part) === "ask_user" && part.state === "input-available") {
            const input = part.input as { question?: string; options?: string[]; multiSelect?: boolean } | undefined;
            all.push({
              toolCallId: part.toolCallId,
              question: input?.question ?? "",
              options: input?.options,
              multiSelect: input?.multiSelect,
            });
          }
        }
      }
    }
    return all;
  }, [messages]);

  pendingApprovalLengthRef.current = allPendingApproval.length;

  useEffect(() => {
    useChatStatus.getActions().setPendingAskUserCount(allPendingAskUser.length);
  }, [allPendingAskUser]);

  const addToolOutput = useCallback(
    (options: { tool: string; toolCallId: string; output: Record<string, unknown> }) => {
      chatHelpers.addToolOutput({
        tool: options.tool as never,
        toolCallId: options.toolCallId,
        output: options.output as never,
      });
    },
    [chatHelpers]
  );

  return {
    messages,
    sendMessage,
    allPendingApproval,
    allPendingAskUser,
    addToolOutput,
    status,
    isLoading: status === "streaming" || status === "submitted",
    isReady: !initLoading && chatRef.current !== null,
    stop,
    clearMessages,
    setMessages: chatHelpers.setMessages,
    error: chatHelpers.error ?? null,
    initLoading,
    initError,
    addToolApprovalResponse,
  };
}
