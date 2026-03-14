/**
 * Local Connection Adapter
 *
 * Creates a ConnectionAdapter that uses our Agent class for the full agent loop.
 * This provides context management, tool execution, and message history - not just
 * a simple chat() wrapper.
 */

import { createAgent } from "./agent/loop/Agent.js";

import type { AgentContext } from "./agent";
import type { Agent, CreateAgentOptions } from "./agent/loop/Agent.js";
import type { Sandbox } from "./environment";
import type { AnyTextAdapter, ChatMiddleware, ToolDefinition, UIMessage, ModelMessage } from "@tanstack/ai";
import type { ConnectionAdapter } from "@tanstack/ai-client";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for creating a local connection
 */
export interface LocalConnectionConfig {
  /** TanStack AI adapter (e.g., ollamaText, openaiText) */
  adapter: AnyTextAdapter;
  /** Sandbox for tool execution */
  sandbox: Sandbox;
  /** Optional system prompt */
  systemPrompt?: string;
  /** Optional custom tools to add */
  tools?: ToolDefinition[];
  /** Optional middleware */
  middleware?: ChatMiddleware[];
  /** Optional max tokens */
  maxTokens?: number;
  /** Optional temperature */
  temperature?: number;
  /** Optional max iterations for agentic loop */
  maxIterations?: number;
  /** Model name (for display/logging) */
  model?: string;

  setUp?: <T>(instance: T) => T;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract the last user message content from a list of messages
 */
function extractLastUserContent(messages: UIMessage[] | ModelMessage[]): string {
  let lastUserContent = "";

  for (const msg of messages) {
    if ("parts" in msg) {
      // It's a UIMessage
      const uiMsg = msg as UIMessage;
      if (uiMsg.role === "user") {
        // Extract text content from parts
        for (const part of uiMsg.parts) {
          if (part.type === "text") {
            lastUserContent = part.content;
          }
        }
      }
    } else {
      // It's a ModelMessage
      const modelMsg = msg as ModelMessage;
      if (modelMsg.role === "user" && typeof modelMsg.content === "string") {
        lastUserContent = modelMsg.content;
      }
    }
  }

  return lastUserContent;
}

/**
 * Create a local connection with a shared agent instance.
 *
 * This allows you to manage the agent lifecycle yourself and share
 * the same agent across multiple connections.
 *
 * @example
 * ```typescript
 * const agent = createAgent({ ... });
 * agent.setAdapter(adapter);
 * agent.setSandbox(sandbox);
 *
 * const connection = createConnectionFromAgent(agent);
 * ```
 */
export function createConnectionFromAgent(agent: Agent): ConnectionAdapter {
  return {
    async *connect(messages, _data, abortSignal) {
      const lastUserContent = extractLastUserContent(messages);

      if (lastUserContent) {
        yield* agent.run({
          prompt: lastUserContent,
          abortSignal,
        });
      }
    },
  };
}

// ============================================================================
// Local Connection Factory
// ============================================================================

/**
 * Create a local connection adapter that uses our Agent class.
 *
 * This adapter runs the full agent loop locally with:
 * - Context management (message history)
 * - Tool execution via sandbox
 * - Agentic cycle (tool calls -> results -> continue)
 * - Abort support
 *
 * @example
 * ```typescript
 * import { createLocalConnection, createOllamaAdapter, localEnvironment } from '@my-agent/core';
 * import { useChat } from '@tanstack/ai-react';
 *
 * // Create sandbox
 * const sandbox = await localEnvironment.createSandbox({ rootPath: process.cwd() });
 *
 * // Create connection
 * const connection = createLocalConnection({
 *   adapter: createOllamaAdapter('llama3'),
 *   sandbox,
 *   systemPrompt: 'You are a helpful assistant.',
 * });
 *
 * // Use with useChat hook
 * const { messages, sendMessage } = useChat({ connection });
 * ```
 */
export function createLocalConnection(
  config: LocalConnectionConfig
): ConnectionAdapter & { agent: Agent; context: AgentContext } {
  const {
    adapter,
    sandbox,
    systemPrompt,
    tools: customTools = [],
    middleware = [],
    maxTokens,
    temperature,
    maxIterations = 10,
    model = "unknown",
  } = config;

  // Create the agent once
  const agentOptions: CreateAgentOptions = {
    model,
    systemPrompt,
    maxIterations,
    maxTokens,
    temperature,
    adapter,
    sandbox,
    tools: customTools,
  };

  const agent = createAgent(agentOptions);

  const context = agent.context;

  return {
    async *connect(messages, _data, abortSignal) {
      const lastUserContent = extractLastUserContent(messages);

      // Run the agent with the last user message as prompt
      if (lastUserContent) {
        yield* agent.run({
          prompt: lastUserContent,
          abortSignal,
          middleware,
        });
      }
    },

    agent,

    context,
  };
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

// Re-export stream helper from ai-client for custom adapters
export { stream } from "@tanstack/ai-client";

export type { ConnectionAdapter } from "@tanstack/ai-client";
