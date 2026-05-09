import { Chat, useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  getToolName,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useEffect, useMemo, useRef } from "react";

import { useServerConfig } from "./useServerConfig";

import type { FileUIPart, UIMessage } from "ai";

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
        return lastAssistantMessageIsCompleteWithApprovalResponses(options);
      },
    });
  }

  const chatHelpers = useChat<UIMessage>(
    chatRef.current
      ? {
          chat: chatRef.current,
          experimental_throttle: 80,
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

  // Persist UIMessages to server after each completed interaction
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

  const addToolApprovalResponse = (options: { id: string; approved: boolean; reason?: string }) => {
    chatRef.current?.addToolApprovalResponse({
      id: options.id,
      approved: options.approved,
      reason: options.reason,
    });
  };

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
  };
}
