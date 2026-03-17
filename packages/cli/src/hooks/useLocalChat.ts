/**
 * useLocalChat - A hook that provides chat functionality with a local Agent.
 *
 * This manages chat state using @ai-sdk/react's useChat hook with DirectChatTransport
 * to interface directly with the Agent class.
 */

import { Chat, useChat as useAiSdkChat } from "@ai-sdk/react";
import { agentManager, createOllamaModel } from "@my-agent/core";
import { DirectChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useEffect, useCallback, useState, useRef } from "react";
import { reactive, toRaw } from "reactivity-store";

import { useAgent } from "./useAgent.js";
import { useAgentContext } from "./useAgentContext.js";
import { useAgentLog } from "./useAgentLog.js";
import { useAgentSandbox } from "./useAgentSandbox.js";

import type { Agent, AgentContext } from "@my-agent/core";
import type { ChatTransport, UIMessage } from "ai";

// ============================================================================
// Types
// ============================================================================

export interface UseLocalChatConfig {
  /** Model name (e.g., "llama3", "qwen2.5-coder:7b") */
  model: string;
  /** Ollama API URL */
  url: string;
  /** Working directory for sandbox */
  rootPath: string;
  /** System prompt */
  systemPrompt?: string;
  /** Max iterations for agentic loop */
  maxIterations?: number;
}

/**
 * Chat status from AI SDK
 */
export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

export interface UseLocalChatReturn {
  /** Current chat messages */
  messages: UIMessage[];
  /** Send a message */
  sendMessage: (content: string) => Promise<void>;
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
  addToolApprovalResponse: (options: { id: string; approved: boolean; reason?: string }) => void;
}

// ============================================================================
// Helper: Generate unique ID
// ============================================================================

const generateId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `msg_${timestamp}_${random}`;
};

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
 *     if (part.type === "tool-invocation") return <ToolView part={part} />;
 *   })
 * ))
 * ```
 */
export function useLocalChat(config: UseLocalChatConfig): UseLocalChatReturn {
  const { model, url, rootPath, systemPrompt, maxIterations = 10 } = config;

  // Connection state
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<Error | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);

  const [_, setNum] = useState(0);

  // Chat instance ref - created once when connection is ready
  const chatRef = useRef<Chat<UIMessage> | null>(null);

  // Initialize connection and create Chat instance
  useEffect(() => {
    const init = async () => {
      setInitLoading(true);

      setInitError(null);

      try {
        const languageModel = createOllamaModel(model, url, { reasoning: true });

        const agent = await agentManager.createManagedAgent({
          languageModel,
          model,
          rootPath,
          name: "local-chat",
          systemPrompt:
            systemPrompt ||
            "You are a helpful coding assistant. You can read, write, and modify files, run commands in bash, and help with programming tasks.",
          maxIterations,
          setUp: (instance: (Agent | AgentContext) & { ["$$symbol"]?: symbol }) => {
            if (instance["$$symbol"]) return instance;
            instance["$$symbol"] = Symbol.for("patch");
            const pInstance = reactive(instance);
            return new Proxy(pInstance, {
              get(target, p, receiver) {
                const key = p.toString()?.toLowerCase?.() || "";
                if (key.includes("tool") || key.includes("config")) {
                  return toRaw(Reflect.get(target, p, receiver));
                }
                return Reflect.get(target, p, receiver);
              },
            }) as Agent | AgentContext;
          },
        });

        // Set up global agent state
        useAgent.getActions().setAgent(agent);
        useAgentLog.getActions().setLog(agent.getLog());
        useAgentContext.getActions().setContext(agent.getContext());
        useAgentSandbox.getActions().setSandbox(agent.getSandbox());

        // Create DirectChatTransport with the agent
        // Note: Using type assertion due to complex SDK generic constraints
        const transport = new DirectChatTransport({
          agent,
        }) as ChatTransport<UIMessage>;

        // Create Chat instance with the transport
        chatRef.current = new Chat<UIMessage>({
          id: generateId(),
          transport: transport,
          messages: [],
          sendAutomaticallyWhen(options) {
            toRaw(agent.getLog())?.tool(`call 'sendAutomaticallyWhen'`, options);
            return lastAssistantMessageIsCompleteWithApprovalResponses(options);
          },
        });

        setAgent(agent);
      } catch (e) {
        setInitError(e as Error);
      }

      setInitLoading(false);
    };

    init();
  }, [model, url, rootPath, systemPrompt, maxIterations]);

  // Use @ai-sdk/react's useChat hook with our Chat instance
  const chatHelpers = useAiSdkChat<UIMessage>(
    chatRef.current
      ? {
          chat: chatRef.current,
          experimental_throttle: 50,
        }
      : {}
  );

  // 强制刷新 更新 status，当前 @my-react 实现瑕疵
  // TODO！message更新后 status的排在了effect之后，
  useEffect(() => {
    const id = setTimeout(() => {
      setNum((l) => l + 1);
    }, 500);

    return () => clearTimeout(id);
  }, [chatHelpers.messages]);

  // Wrap sendMessage to handle string input (useChat expects object)
  const sendMessage = useCallback(
    async (content: string) => {
      if (!agent || !chatRef.current) {
        return;
      }

      await chatHelpers.sendMessage({ text: content });
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
    (options: { id: string; approved: boolean; reason?: string }) => {
      // Use the SDK's built-in method for handling tool approvals
      chatHelpers.addToolApprovalResponse({
        id: options.id,
        approved: options.approved,
        reason: options.reason,
      });
    },
    [chatHelpers]
  );

  const status = chatHelpers.status;

  return {
    messages: chatHelpers.messages,
    sendMessage,
    status,
    isLoading: status === "streaming" || status === "submitted",
    isReady: agent !== null && !initLoading && chatRef.current !== null,
    stop: chatHelpers.stop,
    clearMessages,
    setMessages: chatHelpers.setMessages,
    error: chatHelpers.error ?? null,
    initLoading,
    initError,
    addToolApprovalResponse,
  };
}
