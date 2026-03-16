/**
 * useLocalChat - A hook that wraps useChat with a local connection adapter.
 *
 * This provides the same API as useChat but runs locally without HTTP.
 */

import { createLocalConnection, createOllamaAdapter } from "@my-agent/core";
import { useChat } from "@tanstack/ai-react";
import { useEffect, useMemo, useCallback, useState } from "react";
import { toRaw, reactive } from "reactivity-store";

import { useAgent } from "./useAgent";
import { useAgentContext } from "./useAgentContext";
import { useAgentLog } from "./useAgentLog";
import { useAgentSandbox } from "./useAgentSandbox";

import type { Agent, AgentContext, AgentLog, ConnectionAdapter } from "@my-agent/core";
import type { UseChatReturn } from "@tanstack/ai-react";

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
 * Stores tool input from approval-requested events.
 * This is needed because TanStack AI's StreamProcessor doesn't populate
 * the tool-call part's `arguments` field when updating approval state.
 */
export type ApprovalInputsMap = Map<string, unknown>;

export interface UseLocalChatReturn extends Omit<UseChatReturn, "sendMessage"> {
  /** Send a message */
  sendMessage: (content: string) => Promise<void>;

  initLoading: boolean;

  initError: Error | null | undefined;

  /**
   * Map of toolCallId -> input for pending approvals.
   * Used to display tool arguments in approval prompts since the
   * StreamProcessor doesn't populate arguments when setting approval state.
   */
  approvalInputs: ApprovalInputsMap;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook that provides useChat functionality with a local connection.
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
 *     if (part.type === "text") return <Text>{part.content}</Text>;
 *     if (part.type === "tool-call") return <ToolView part={part} />;
 *   })
 * ))
 * ```
 */
export function useLocalChat(config: UseLocalChatConfig): UseLocalChatReturn {
  const { model, url, rootPath, systemPrompt, maxIterations = 10 } = config;

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<Error | null>(null);

  const [connection, setConnection] = useState<ConnectionAdapter>(() => ({
    // eslint-disable-next-line require-yield
    async *connect() {
      console.log("[useLocalChat] placeholder connect called - this should not happen!");
      // Yield nothing - this shouldn't be called before ready
    },
  }));

  // Store tool inputs from approval-requested events
  // We use a ref to avoid re-renders, and useState for the Map to trigger re-renders when needed
  const [approvalInputs, setApprovalInputs] = useState<ApprovalInputsMap>(() => new Map());

  // Generate a unique ID that changes when connection changes
  // This forces useChat to recreate its ChatClient when connection is ready
  const chatId = useMemo(() => {
    if (!connection) return "placeholder";
    return `chat-${Date.now()}`;
  }, [connection]);

  useEffect(() => {
    const init = async (config: UseLocalChatConfig) => {
      setLoading(true);

      const { model, url } = config;

      try {
        const adapter = createOllamaAdapter(model, url);

        const connector = await createLocalConnection({
          ...config,
          systemPrompt: `You are a helpful coding assistant at sandbox. You can read, write, and modify files, run commands in bash, and help with programming tasks.`,
          adapter,
          maxIterations: config.maxIterations || 10,
          name: "local-connector",
          // make the agent instance reactive
          setUp: (instance: Agent | AgentContext) => {
            // if ((instance as Agent).symbol === Symbol.for("agent")) {
            //   return reactive(instance) as Agent;
            // } else {
            //   return instance;
            // }
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            instance["$$symbol"] = Symbol.for("patch");
            return reactive(instance) as Agent | AgentContext;
          },
        });

        useAgent.getActions().setAgent(connector.agent);

        useAgentLog.getActions().setLog(connector.agent.getLog());

        useAgentContext.getActions().setContext(connector.agent.getContext());

        useAgentSandbox.getActions().setSandbox(connector.agent.getSandbox());

        setConnection(connector);
      } catch (e) {
        setError(e as Error);
      }

      setLoading(false);
    };

    init({ model, maxIterations, systemPrompt, rootPath, url });
  }, [model, url, maxIterations, systemPrompt, rootPath]);

  // Use the chat hook with our connection
  // The id changes when connection changes, forcing a new ChatClient
  const chatResult = useChat({
    id: chatId,
    connection: connection,
    onChunk: (chunk) => {
      if (chunk.type === "CUSTOM") {
        const value = chunk.value as {
          toolCallId: string;
          input: object;
          approval: {
            id: string;
          };
        };
        setApprovalInputs((prev) => {
          const next = new Map(prev);
          next.set(value.toolCallId, value.input);
          return next;
        });
      }
    },
  });

  // Wrap sendMessage to prevent sending before ready
  const sendMessage = useCallback(
    async (content: string) => {
      if (!connection) {
        return;
      }
      const agentLog = toRaw(useAgent.getReactiveState().agent?.getLog()) as AgentLog | null;
      agentLog?.chat(`user send message \`${content}\` start`);
      await chatResult.sendMessage(content);
      agentLog?.chat(`user send message \`${content}\` end`);
    },
    [connection, chatResult.sendMessage]
  );

  return {
    ...chatResult,
    sendMessage,
    initLoading: loading,
    initError: error,
    approvalInputs,
  };
}
