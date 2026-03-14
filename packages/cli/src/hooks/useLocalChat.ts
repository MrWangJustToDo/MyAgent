/**
 * useLocalChat - A hook that wraps useChat with a local connection adapter.
 *
 * This provides the same API as useChat but runs locally without HTTP.
 */

import { createLocalConnection, createOllamaAdapter } from "@my-agent/core";
import { useChat } from "@tanstack/ai-react";
import { useEffect, useMemo, useCallback } from "react";

import { useAgent } from "./useAgent";
import { useAgentContext } from "./useAgentContext";
import { useSandbox } from "./useSandbox";

import type { ConnectionAdapter } from "@my-agent/core";
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

export interface UseLocalChatReturn extends Omit<UseChatReturn, "sendMessage"> {
  /** Send a message */
  sendMessage: (content: string) => Promise<void>;

  initLoading: boolean;

  initError: Error | null | undefined;
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

  const { sandbox, loading, error } = useSandbox((s) => ({ sandbox: s.state, loading: s.loading, error: s.error }));

  useEffect(() => {
    useSandbox.getActions().getSandbox(rootPath);
  }, [rootPath]);

  // Create connection adapter when sandbox is ready
  const connection = useMemo<ConnectionAdapter | null>(() => {
    if (!sandbox) return null;

    const adapter = createOllamaAdapter(model, url);

    const connector = createLocalConnection({
      model,
      adapter,
      sandbox,
      systemPrompt,
      maxIterations,
    });

    useAgent.getActions().setAgent(connector.agent);

    useAgentContext.getActions().setContext(connector.context);

    return connector;
  }, [sandbox, model, url, systemPrompt, maxIterations]);

  // Create a placeholder connection for when sandbox isn't ready
  const placeholderConnection = useMemo<ConnectionAdapter>(
    () => ({
      async *connect() {
        // Yield nothing - this shouldn't be called before ready
      },
    }),
    []
  );

  // Use the chat hook with our connection
  const chatResult = useChat({
    connection: connection ?? placeholderConnection,
  });

  // Wrap sendMessage to prevent sending before ready
  const sendMessage = useCallback(
    async (content: string) => {
      if (!connection) {
        console.warn("Cannot send message: chat not ready");
        return;
      }
      await chatResult.sendMessage(content);
    },
    [connection, chatResult.sendMessage]
  );

  return {
    ...chatResult,
    sendMessage,
    initLoading: loading,
    initError: error,
  };
}
