import { Chat, useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  getToolName,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useServerConfig } from "./useServerConfig";

import type { FileUIPart, UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai";

export interface UseAgentChatReturn {
  messages: UIMessage[];
  sendMessage: (text: string, files?: FileUIPart[]) => void;
  status: "ready" | "submitted" | "streaming" | "error";
  isLoading: boolean;
  stop: () => void;
  error: Error | undefined;
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
  addToolApprovalResponse: (options: { id: string; approved: boolean; reason?: string }) => void;
  allPendingApproval: Array<{ id: string; toolName: string; toolCallId: string }>;
  allPendingAskUser: Array<{
    toolCallId: string;
    question: string;
    options?: string[];
    multiSelect?: boolean;
  }>;
  addToolOutput: (options: { tool: string; toolCallId: string; output: Record<string, unknown> }) => void;
}

export function useAgentChat(): UseAgentChatReturn {
  const url = useServerConfig((s) => s.url);

  const chatRef = useRef<Chat<UIMessage> | null>(null);

  if (!chatRef.current) {
    const transport = new DefaultChatTransport({ api: `${url}/api/chat` });
    chatRef.current = new Chat<UIMessage>({
      transport,
      messages: [],
      sendAutomaticallyWhen(options) {
        return (
          lastAssistantMessageIsCompleteWithApprovalResponses(options) ||
          lastAssistantMessageIsCompleteWithToolCalls(options)
        );
      },
    });
  }

  const chatHelpers = useChat<UIMessage>(
    chatRef.current
      ? {
          chat: chatRef.current,
          // Lower throttle so streamed tokens render more frequently in the UI.
          experimental_throttle: 50,
        }
      : {}
  );

  const allPendingApproval = useMemo(() => {
    const all: UseAgentChatReturn["allPendingApproval"] = [];
    for (let i = chatHelpers.messages.length - 1; i >= 0; i--) {
      const msg = chatHelpers.messages[i] as UIMessage;
      if (msg.role === "assistant") {
        for (const part of msg.parts) {
          if (isToolUIPart(part) && part.state === "approval-requested" && part.approval) {
            all.push({
              id: part.approval.id,
              toolName: getToolName(part),
              toolCallId: part.toolCallId,
            });
          }
        }
      }
    }
    return all;
  }, [chatHelpers.messages]);

  const allPendingAskUser = useMemo(() => {
    const all: UseAgentChatReturn["allPendingAskUser"] = [];
    for (let i = chatHelpers.messages.length - 1; i >= 0; i--) {
      const msg = chatHelpers.messages[i] as UIMessage;
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
  }, [chatHelpers.messages]);

  const prevStatusRef = useRef(chatHelpers.status);
  const messagesRef = useRef(chatHelpers.messages);
  messagesRef.current = chatHelpers.messages;
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = chatHelpers.status;
    if ((prev === "streaming" || prev === "submitted") && chatHelpers.status === "ready") {
      if (messagesRef.current.length > 0) {
        fetch(`${url}/api/sessions/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: messagesRef.current }),
        }).catch(() => {});
      }
    }
  }, [chatHelpers.status, url]);

  const sendMessage = (text: string, files?: FileUIPart[]) => {
    if (!text.trim() && (!files || files.length === 0)) return;
    if (!text.trim() && files && files.length > 0) {
      chatHelpers.sendMessage({ files });
    } else {
      chatHelpers.sendMessage({ text, files });
    }
  };

  const addToolApprovalResponse = useCallback(
    (options: { id: string; approved: boolean; reason?: string }) => {
      if (options.approved) {
        chatHelpers.addToolApprovalResponse({
          id: options.id,
          approved: true,
          reason: options.reason,
        });
        return;
      }

      const errorText = options.reason ?? "Tool execution denied by user.";
      const updatePart = (part: UIMessagePart<UIDataTypes, UITools>): UIMessagePart<UIDataTypes, UITools> =>
        isToolUIPart(part) && part.state === "approval-requested" && part.approval?.id === options.id
          ? {
              ...part,
              state: "output-denied",
              approval: { id: options.id, approved: false, reason: errorText },
            }
          : part;

      chatHelpers.setMessages((message) =>
        message.map((i) =>
          i.role === "assistant"
            ? {
                ...i,
                parts: i.parts.map(updatePart),
              }
            : i
        )
      );
      chatHelpers.sendMessage();
    },
    [chatHelpers]
  );

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
    messages: chatHelpers.messages,
    sendMessage,
    status: chatHelpers.status,
    isLoading: chatHelpers.status === "streaming" || chatHelpers.status === "submitted",
    stop: chatHelpers.stop,
    error: chatHelpers.error,
    setMessages: chatHelpers.setMessages,
    addToolApprovalResponse,
    allPendingApproval,
    allPendingAskUser,
    addToolOutput,
  };
}
