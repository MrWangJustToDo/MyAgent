/* eslint-disable @typescript-eslint/ban-ts-comment */
/**
 * useLocalChat - A hook that provides chat functionality with a local Agent.
 *
 * This manages chat state using @ai-sdk/react's useChat hook with DirectChatTransport
 * to interface directly with the Agent class.
 */

import { Chat, useChat as useAiSdkChat } from "@ai-sdk/react";
import { generateId } from "@my-agent/core";
import {
  getToolName,
  isToolUIPart,
  DirectChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import ansiEscapes from "ansi-escapes";
import { useEffect, useCallback, useState, useRef, useMemo } from "react";

import { createAgent } from "../utils/create.js";

import { useAgent } from "./use-agent.js";
import { useForceUpdate } from "./use-force-update.js";
import { useLocalChatStatus } from "./use-local-chat-status.js";

import type { Agent } from "@my-agent/core";
import type { ChatTransport, FileUIPart, UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai";

// ============================================================================
// Types
// ============================================================================

export interface UseLocalChatConfig {
  /** Model name (e.g., "llama3", "qwen2.5-coder:7b", "anthropic/claude-3.5-sonnet") */
  model: string;
  /** Ollama API URL (used when provider is "ollama") */
  url: string;
  /** Working directory for sandbox */
  rootPath: string;
  /** System prompt */
  systemPrompt?: string;
  /** Max iterations for agentic loop */
  maxIterations?: number;
  /** LLM provider */
  provider?: "ollama" | "openRouter" | "openaiCompatible" | "deepseek";
  /** API key for OpenRouter */
  apiKey?: string;
  /** Path to MCP config file (relative to rootPath) */
  mcpConfigPath?: string;
  /** Resume the most recent session */
  continueSession?: boolean;
  /** Resume a specific session by ID or name */
  resumeSession?: string;
}

/**
 * Chat status from AI SDK
 */
export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

export interface SendMessageContent {
  text: string;
  files?: FileUIPart[];
}

export interface UseLocalChatReturn {
  /** Current chat messages */
  messages: UIMessage[];
  /** Send a message (string or text+files) */
  sendMessage: (content: string | SendMessageContent) => Promise<void>;
  /** Current status */
  status: ChatStatus;
  /** Whether the chat is streaming */
  isLoading: boolean;
  /** Whether the connection is ready */
  isReady: boolean;
  /** Stop the current stream */
  stop: () => void;
  /** Clear all messages */
  clearMessages: () => void;
  /** Set messages directly */
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
  /** Error if any */
  error: Error | null;
  /** Initialization loading state */
  initLoading: boolean;
  /** Initialization error */
  initError: Error | null | undefined;
  /** Add tool approval response */
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
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook that provides chat functionality with a local Agent connection.
 * Uses @ai-sdk/react's useChat hook with DirectChatTransport from AI SDK.
 *
 * @example
 * ```typescript
 * const {
 *   messages,
 *   sendMessage,
 *   isLoading,
 *   isReady,
 *   addToolApprovalResponse,
 * } = useLocalChat({
 *   model: "llama3",
 *   url: "http://localhost:11434",
 *   rootPath: process.cwd(),
 *   systemPrompt: "You are a helpful assistant.",
 * });
 *
 * // Wait for ready
 * if (!isReady) return <Text>Initializing...</Text>;
 *
 * // Send a message
 * sendMessage("Hello!");
 *
 * // Render messages
 * messages.map(msg => (
 *   msg.parts.map(part => {
 *     if (part.type === "text") return <Text>{part.text}</Text>;
 *     // Tool parts have type "tool-{name}" (static) or "dynamic-tool" (dynamic)
 *     if (isToolUIPart(part)) return <ToolView part={part} />;
 *   })
 * ))
 * ```
 */
export function useLocalChat(config: UseLocalChatConfig): UseLocalChatReturn {
  const {
    model,
    url,
    rootPath,
    systemPrompt,
    maxIterations = 10,
    provider = "ollama",
    apiKey,
    mcpConfigPath,
    continueSession,
    resumeSession,
  } = config;

  // Connection state
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<Error | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);

  // @ts-ignore
  const agentError = useAgent((s) => (s.agent as Agent)?.error || "");

  const forceUpdate = useForceUpdate({ time: 600 });

  // Chat instance ref - created once when connection is ready
  const chatRef = useRef<Chat<UIMessage> | null>(null);

  // Initialize connection and create Chat instance
  useEffect(() => {
    const init = async () => {
      setInitLoading(true);

      setInitError(null);

      try {
        const { agent, initialMessages } = await createAgent({
          model,
          url,
          rootPath,
          systemPrompt,
          maxIterations,
          provider,
          apiKey,
          mcpConfigPath,
          continueSession,
          resumeSession,
        });

        // Create PatchedDirectChatTransport with the agent
        // This patched version fixes the tool approval denial bug in AI SDK v6
        // See: https://github.com/vercel/ai/issues/10980
        const transport = new DirectChatTransport({
          agent,
        }) as ChatTransport<UIMessage>;

        // Create Chat instance with the transport
        chatRef.current = new Chat<UIMessage>({
          id: generateId("chat"),
          transport: transport,
          messages: initialMessages ?? [],
          sendAutomaticallyWhen(options) {
            return lastAssistantMessageIsCompleteWithApprovalResponses(options);
          },
        });

        setAgent(agent);
      } catch (e) {
        setInitError(e as Error);
      }

      setTimeout(() => {
        // Clear the terminal to remove the initialization spinner
        // and provide a clean slate for the chat UI
        process.stdout.write(ansiEscapes.clearScreen + ansiEscapes.cursorTo(0, 0));
        setInitLoading(false);
      }, 500);
    };

    init();
  }, [model, url, rootPath, systemPrompt, maxIterations, provider, apiKey]);

  // Use @ai-sdk/react's useChat hook with our Chat instance
  // Note: Using 100ms throttle to reduce UI flickering/corruption in terminal
  // Lower values (e.g., 50ms) can cause visual artifacts due to rapid re-renders
  const chatHelpers = useAiSdkChat<UIMessage>(
    chatRef.current
      ? {
          chat: chatRef.current,
          experimental_throttle: 100,
        }
      : {}
  );

  // 强制刷新 更新 status，当前 @my-react 实现瑕疵
  // TODO！message更新后 status更新的排在了effect之后
  useEffect(() => {
    forceUpdate();
  }, [chatHelpers.messages, agentError]);

  // Persist UIMessages to session store after each completed interaction
  const prevStatusRef = useRef(chatHelpers.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = chatHelpers.status;
    if ((prev === "streaming" || prev === "submitted") && chatHelpers.status === "ready") {
      if (agent && chatHelpers.messages.length > 0) {
        agent.updateSessionUIMessages(chatHelpers.messages as UIMessage[]);
      }
    }
  }, [chatHelpers.status, chatHelpers.messages, agent]);

  const stop = () => {
    chatHelpers.stop();

    forceUpdate();
  };

  // Wrap sendMessage to handle string or multimodal input
  const sendMessage = useCallback(
    async (content: string | SendMessageContent) => {
      if (!agent || !chatRef.current) {
        return;
      }

      if (typeof content === "string") {
        await chatHelpers.sendMessage({ text: content });
      } else if (content.files && content.files.length > 0) {
        await chatHelpers.sendMessage({ text: content.text, files: content.files });
      } else {
        await chatHelpers.sendMessage({ text: content.text });
      }
    },
    [agent, chatHelpers]
  );

  // Clear messages
  const clearMessages = useCallback(() => {
    chatHelpers.setMessages([]);
    chatHelpers.clearError();
  }, [chatHelpers]);

  // Add tool approval response
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
        // For approvals, use the SDK's built-in method
        chatHelpers.addToolApprovalResponse({
          id: options.id,
          approved: true,
          reason: options.reason,
        });
      } else {
        const errorText = options.reason ?? "Tool execution denied by user.";

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

        chatHelpers.sendMessage();

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
    useLocalChatStatus.getActions().setStatus(chatHelpers.status);
    useLocalChatStatus.getActions().setError(chatHelpers.error ?? null);
  }, [chatHelpers.status, chatHelpers.error]);

  const messages = chatHelpers.messages;

  const allPendingApproval = useMemo(() => {
    const all: UseLocalChatReturn["allPendingApproval"] = [];
    // Look through messages for tool calls awaiting approval
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

  return {
    messages,
    sendMessage,
    allPendingApproval,
    status,
    isLoading: status === "streaming" || status === "submitted",
    isReady: agent !== null && !initLoading && chatRef.current !== null,
    stop,
    clearMessages,
    setMessages: chatHelpers.setMessages,
    error: chatHelpers.error ?? null,
    initLoading,
    initError,
    addToolApprovalResponse,
  };
}
