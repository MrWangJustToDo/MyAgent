import { z } from "zod";

import type { CreateAgentOptions } from "../loop";

// ============================================================================
// Message Types (TanStack AI compatible)
// ============================================================================

/** Message roles */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/** Tool call within assistant message */
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** Tool result */
export interface ToolResult {
  toolCallId: string;
  toolName: string;
  output: unknown;
  isError?: boolean;
}

/** System message */
export interface SystemMessage {
  role: "system";
  content: string;
}

/** User message */
export interface UserMessage {
  role: "user";
  content: string;
}

/** Assistant message */
export interface AssistantMessage {
  role: "assistant";
  content: string;
  toolCalls?: ToolCall[];
  reasoning?: string;
}

/** Tool message */
export interface ToolMessage {
  role: "tool";
  content: ToolResult[];
}

/** Union of all message types */
export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

// ============================================================================
// Token Usage
// ============================================================================

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// ============================================================================
// Stream Event Types (for UI rendering)
// ============================================================================

export type StreamEventType =
  | "start"
  | "text-delta"
  | "reasoning-delta"
  | "tool-call-start"
  | "tool-call-delta"
  | "tool-call-end"
  | "tool-result"
  | "finish"
  | "error";

export interface StreamEvent {
  type: StreamEventType;
  // Text streaming
  text?: string;
  // Reasoning streaming
  reasoning?: string;
  // Tool call
  toolCallId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolInputDelta?: string;
  // Tool result
  toolOutput?: unknown;
  isError?: boolean;
  // Finish
  usage?: TokenUsage;
  finishReason?: string;
  // Error
  error?: Error;
}

// ============================================================================
// AgentContext ID Generator
// ============================================================================

export const generateContextId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ctx_${timestamp}_${random}`;
};

// ============================================================================
// AgentContext Class
// ============================================================================

/**
 * AgentContext - Tracks messages from agent stream.
 *
 * Simplified context that focuses on:
 * 1. **messages** - The conversation history (Message[])
 * 2. **events** - Stream events for UI rendering (StreamEvent[])
 * 3. **usage** - Token usage statistics
 *
 * Design principles:
 * - Server/client separation: context is serializable for web transport
 * - Message-centric: all state derives from messages
 * - Event-driven: UI subscribes to events for real-time updates
 *
 * @example
 * ```typescript
 * const context = new AgentContext();
 *
 * // Add system prompt
 * context.addSystemMessage("You are a helpful assistant.");
 *
 * // Add user message
 * context.addUserMessage("Hello!");
 *
 * // Process stream events
 * context.onEvent((event) => {
 *   if (event.type === "text-delta") {
 *     process.stdout.write(event.text);
 *   }
 * });
 *
 * // Get messages for API call
 * const messages = context.getMessages();
 * ```
 */
export class AgentContext {
  readonly id: string;

  readonly symbol = Symbol.for("agent-context");

  /** Stream events (for UI rendering) */
  private events: StreamEvent[] = [];

  /** Token usage */
  usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  /** Event listeners */
  private eventListeners: Set<(event: StreamEvent) => void> = new Set();

  /** Streaming state */
  isStreaming = false;

  /** Timestamps */
  createdAt: number;
  updatedAt: number;

  constructor({
    id,
    setUp,
  }: {
    id?: CreateAgentOptions<AgentContext>["id"];
    setUp?: CreateAgentOptions<AgentContext>["setUp"];
  }) {
    this.id = id ?? generateContextId();
    this.createdAt = Date.now();
    this.updatedAt = Date.now();

    if (setUp) {
      return setUp(this);
    }
  }

  // ============================================================================
  // Stream Event Handling
  // ============================================================================

  /**
   * Emit a stream event
   */
  emit(event: StreamEvent): void {
    this.events.push(event);

    // Update streaming state
    if (event.type === "start") {
      this.isStreaming = true;
    } else if (event.type === "finish" || event.type === "error") {
      this.isStreaming = false;
      if (event.usage) {
        this.usage.inputTokens += event.usage.inputTokens;
        this.usage.outputTokens += event.usage.outputTokens;
        this.usage.totalTokens += event.usage.totalTokens;
        this.usage = Object.assign({}, this.usage);
      }
    }

    // Notify listeners
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }

    this.touch();
  }

  /**
   * Subscribe to stream events
   */
  onEvent(listener: (event: StreamEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Get all events (for replay/debugging)
   */
  getEvents(): StreamEvent[] {
    return [...this.events];
  }

  /**
   * Clear events (keep messages)
   */
  clearEvents(): void {
    this.events = [];
    this.touch();
  }

  // ============================================================================
  // Reset
  // ============================================================================

  /**
   * Clear everything
   */
  reset(): void {
    this.events = [];
    this.usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    this.isStreaming = false;
    this.touch();
  }

  /**
   * Start a new turn (clear events, keep messages)
   */
  startNewTurn(): void {
    this.events = [];
    this.isStreaming = false;
    this.touch();
  }

  // ============================================================================
  // Private
  // ============================================================================

  private touch(): void {
    this.updatedAt = Date.now();
  }
}

// ============================================================================
// Zod Schemas (for validation)
// ============================================================================

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});

export const toolResultSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  output: z.unknown(),
  isError: z.boolean().optional(),
});

export const systemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
});

export const userMessageSchema = z.object({
  role: z.literal("user"),
  content: z.string(),
});

export const assistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.string(),
  toolCalls: z.array(toolCallSchema).optional(),
  reasoning: z.string().optional(),
});

export const toolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.array(toolResultSchema),
});

export const messageSchema = z.discriminatedUnion("role", [
  systemMessageSchema,
  userMessageSchema,
  assistantMessageSchema,
  toolMessageSchema,
]);

export const tokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
});
