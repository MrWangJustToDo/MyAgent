/* eslint-disable @typescript-eslint/ban-ts-comment */
/**
 * Local Connection Adapter
 *
 * Creates a ConnectionAdapter that uses our Agent class for the full agent loop.
 * This provides context management, tool execution, and message history - not just
 * a simple chat() wrapper.
 */

import { createAgent } from "./agent/loop/Agent.js";

import type { AgentContext, AgentLog } from "./agent";
import type { Agent, CreateAgentOptions } from "./agent/loop/Agent.js";
import type { Sandbox } from "./environment";
import type { AnyTextAdapter, ChatMiddleware, Tool } from "@tanstack/ai";
import type { ConnectionAdapter } from "@tanstack/ai-client";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for creating a local connection
 */
export interface LocalConnectionConfig<T> {
  /** TanStack AI adapter (e.g., ollamaText, openaiText) */
  adapter: AnyTextAdapter;
  /** Sandbox for tool execution */
  sandbox: Sandbox;
  /** Optional system prompt */
  systemPrompt?: string;
  /** Optional custom tools to add */
  tools?: Tool[];
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

  setUp?: (instance: T) => T;
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
      yield* agent.run({
        // @ts-ignore
        messages,
        abortSignal,
      });
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

// Workaround for https://github.com/TanStack/ai/pull/372
// The SDK has a bug where continuation re-executions only emit TOOL_CALL_END,
// skipping TOOL_CALL_START and TOOL_CALL_ARGS, which causes tool-call parts
// to have empty arguments. We store the input from CUSTOM events and
// backfill them to the messages on each connect.

/** Map of toolCallId -> input for approved tool calls */
type ApprovalInputsMap = Map<string, unknown>;

/**
 * Backfill tool-call arguments from stored approval inputs.
 * This fixes the issue where StreamProcessor doesn't populate the arguments
 * field when updating approval state.
 *
 * @see https://github.com/TanStack/ai/pull/372
 */
function backfillToolCallArguments<T>(messages: T[], approvalInputs: ApprovalInputsMap): T[] {
  if (approvalInputs.size === 0) return messages;

  return messages.map((msg) => {
    const message = msg as { parts?: Array<{ type: string; id?: string; arguments?: string }> };
    if (!message.parts || !Array.isArray(message.parts)) return msg;

    const updatedParts = message.parts.map((part) => {
      if (part.type !== "tool-call" || !part.id) return part;

      const storedInput = approvalInputs.get(part.id);
      if (storedInput && (!part.arguments || part.arguments === "")) {
        // Backfill the arguments from stored input
        return {
          ...part,
          arguments: JSON.stringify(storedInput),
        };
      }
      return part;
    });

    return { ...message, parts: updatedParts } as T;
  });
}

export function createLocalConnection(
  config: LocalConnectionConfig<Agent | AgentContext>
): ConnectionAdapter & { agent: Agent; log: AgentLog; context: AgentContext } {
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
    setUp,
  } = config;

  // Create the agent once
  const agentOptions: CreateAgentOptions<Agent | AgentContext> = {
    model,
    systemPrompt,
    maxIterations,
    maxTokens,
    temperature,
    adapter,
    sandbox,
    setUp,
    tools: customTools,
  };

  const agent = createAgent(agentOptions);

  const log = agent.log;

  const context = agent.context;

  // Store tool inputs from approval-requested events
  // This is needed because TanStack AI's StreamProcessor doesn't populate
  // the tool-call part's arguments field when updating approval state.
  const approvalInputs: ApprovalInputsMap = new Map();

  return {
    async *connect(messages, _data, abortSignal) {
      // Backfill any missing tool-call arguments from previous approval events
      // @ts-ignore
      const patchedMessages = backfillToolCallArguments(messages, approvalInputs);

      agent.log.connection("connect called", { messageCount: patchedMessages.length, data: _data });

      agent.log.debug("connection", "UIMessages detail", { messages: patchedMessages });

      const otherChunk = [];

      const runChunk = [];

      const toolChunk = [];

      const customChunk = [];

      try {
        for await (const chunk of agent.run({
          // @ts-ignore - messages type mismatch with AgentRunOptions
          messages: patchedMessages,
          abortSignal,
          middleware,
          ..._data,
        })) {
          // Store input from CUSTOM approval-requested events
          if (chunk.type === "CUSTOM") {
            const customValue = (chunk as { value?: { toolCallId?: string; input?: unknown } }).value;
            if (customValue?.toolCallId && customValue?.input !== undefined) {
              approvalInputs.set(customValue.toolCallId, customValue.input);
            }
            customChunk.push(chunk);
          } else if (chunk.type.startsWith("TOOL")) {
            toolChunk.push(chunk);
          } else if (chunk.type.startsWith("RUN")) {
            runChunk.push(chunk);
          } else {
            otherChunk.push(chunk);
          }
          yield chunk;
        }
        agent.log.chunk("stream", { customChunk, toolChunk, runChunk, otherChunk });
        agent.log.connection("agent.run completed successfully");
      } catch (error) {
        agent.log.error("connection", "agent.run error", error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    },

    agent,

    log,

    context,
  };
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

// Re-export stream helper from ai-client for custom adapters
export { stream } from "@tanstack/ai-client";

export type { ConnectionAdapter } from "@tanstack/ai-client";
