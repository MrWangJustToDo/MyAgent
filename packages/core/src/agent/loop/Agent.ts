import { chat } from "@tanstack/ai";
import { z } from "zod";

import { AgentContext, generateContextId } from "../agentContext";
import { createTools, type Tools } from "../tools";

import type { Sandbox } from "../../environment";
import type { Message, ToolCall, TokenUsage, StreamEvent } from "../agentContext";
import type { ChatMiddleware, StreamChunk, AnyTextAdapter, ToolDefinition } from "@tanstack/ai";

// ============================================================================
// Types & Schemas
// ============================================================================

export type AgentStatus = "idle" | "running" | "completed" | "error" | "aborted";

export const AgentConfigSchema = z.object({
  model: z.string().min(1).describe("Model name to use"),
  baseURL: z.string().optional().describe("Base URL for the model API"),
  systemPrompt: z.string().optional().describe("System prompt for the agent"),
  maxIterations: z.number().int().min(1).max(100).optional().default(10).describe("Maximum agentic loop iterations"),
  maxTokens: z.number().int().min(1).optional().describe("Maximum tokens per response"),
  temperature: z.number().min(0).max(2).optional().describe("Sampling temperature"),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** Tool set type - array of TanStack AI tool definitions */
export type ToolSet = ToolDefinition[];

/** Callbacks for streaming events */
export interface AgentCallbacks {
  onChunk?: (chunk: StreamChunk) => void;
  onTextDelta?: (text: string) => void;
  onReasoningDelta?: (text: string) => void;
  onToolCallStart?: (toolCall: ToolCall) => void;
  onToolCallEnd?: (toolCall: ToolCall, result: unknown, isError: boolean) => void;
  onUsage?: (usage: TokenUsage) => void;
  onFinish?: (info: { finishReason?: string; content?: string; usage?: TokenUsage }) => void;
  onError?: (error: Error) => void;
  onAbort?: (reason?: string) => void;
}

/** Run options */
export interface AgentRunOptions extends AgentCallbacks {
  prompt?: string;
  messages?: Message[];
  abortSignal?: AbortSignal;
  /** Additional middleware to apply */
  middleware?: ChatMiddleware[];
}

/** Stream result info */
export interface AgentStreamResult {
  content: string;
  finishReason?: string;
  usage: TokenUsage;
  iterations: number;
}

// ============================================================================
// Agent Class
// ============================================================================

/**
 * Agent - AI agent powered by TanStack AI.
 *
 * Uses TanStack AI's `chat()` function for:
 * - Streaming responses (AG-UI Protocol)
 * - Automatic agentic cycle (tool calls -> results -> continue)
 * - Middleware support (logging, caching, etc.)
 * - Provider-agnostic adapters
 *
 * Design principles:
 * - Returns async iterable stream for flexible consumption
 * - Message-centric state management via AgentContext
 * - Pluggable adapter for different AI providers
 *
 * @example
 * ```typescript
 * const agent = new Agent({
 *   model: "gpt-4",
 *   systemPrompt: "You are a helpful assistant.",
 * });
 *
 * // Set adapter and sandbox
 * agent.setAdapter(openaiText("gpt-4"));
 * agent.setSandbox(sandbox);
 *
 * // Stream responses
 * for await (const chunk of agent.run({ prompt: "Hello!" })) {
 *   if (chunk.type === "TEXT_MESSAGE_CONTENT") {
 *     process.stdout.write(chunk.delta);
 *   }
 * }
 *
 * // Or use callbacks
 * await agent.runWithCallbacks({
 *   prompt: "Hello!",
 *   onTextDelta: (text) => process.stdout.write(text),
 * });
 * ```
 */
export class Agent {
  readonly id: string;

  // State
  status: AgentStatus = "idle";
  error = "";

  // Context
  readonly context: AgentContext;

  // Configuration
  private config: AgentConfig;

  // Resources
  private sandbox: Sandbox | null = null;
  private customTools: ToolSet = [];
  private builtInTools: Tools | null = null;

  // Adapter (TanStack AI)
  private adapter: AnyTextAdapter | null = null;

  // Abort controller for current run
  private currentAbortController: AbortController | null = null;

  constructor(
    config: AgentConfig,
    { id, setUp }: { id?: CreateAgentOptions["id"]; setUp: CreateAgentOptions["setUp"] }
  ) {
    this.id = id ?? generateContextId().replace("ctx_", "agent_");
    this.config = AgentConfigSchema.parse(config);
    this.context = new AgentContext({ setUp });

    // Add system prompt if provided
    if (this.config.systemPrompt) {
      this.context.addSystemMessage(this.config.systemPrompt);
    }

    if (setUp) {
      return setUp(this);
    }
  }

  // ============================================================================
  // Resource Management
  // ============================================================================

  /**
   * Set the TanStack AI adapter (e.g., openaiText, anthropicText, ollamaText)
   */
  setAdapter(adapter: AnyTextAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Get the current adapter
   */
  getAdapter(): AnyTextAdapter | null {
    return this.adapter;
  }

  /**
   * Set sandbox and create built-in tools
   */
  setSandbox(sandbox: Sandbox): void {
    this.sandbox = sandbox;
    this.builtInTools = createTools({ sandbox });
  }

  /**
   * Get sandbox
   */
  getSandbox(): Sandbox | null {
    return this.sandbox;
  }

  /**
   * Add custom tools (TanStack AI ToolDefinition)
   */
  addTools(tools: ToolSet): void {
    this.customTools = [...this.customTools, ...tools];
  }

  /**
   * Get all tools as array for TanStack AI chat()
   */
  getTools(): ToolSet {
    const tools: ToolSet = [];

    // Add built-in tools
    if (this.builtInTools) {
      for (const tool of Object.values(this.builtInTools)) {
        tools.push(tool as ToolDefinition);
      }
    }

    // Add custom tools
    tools.push(...this.customTools);

    return tools;
  }

  // ============================================================================
  // Run (Streaming)
  // ============================================================================

  /**
   * Run the agent and return an async iterable stream.
   * This is the primary method for consuming agent responses.
   */
  async *run(options: AgentRunOptions = {}): AsyncIterable<StreamChunk> {
    if (!this.adapter) {
      throw new Error("Adapter not set. Call setAdapter() first.");
    }

    const { prompt, messages, abortSignal, middleware = [] } = options;

    // Add messages to context
    if (messages?.length) {
      this.context.addMessages(messages);
    }
    if (prompt) {
      this.context.addUserMessage(prompt);
    }

    // Create abort controller
    this.currentAbortController = new AbortController();

    // If external abort signal provided, forward abort to our controller
    if (abortSignal) {
      if (abortSignal.aborted) {
        this.currentAbortController.abort(abortSignal.reason);
      } else {
        abortSignal.addEventListener(
          "abort",
          () => {
            this.currentAbortController?.abort(abortSignal.reason);
          },
          { once: true }
        );
      }
    }

    // Update state
    this.status = "running";
    this.error = "";

    // Build middleware stack
    const allMiddleware: ChatMiddleware[] = [
      // Context sync middleware
      this.createContextSyncMiddleware(options),
      // Custom middleware
      ...middleware,
    ];

    // Convert context messages to model format
    const modelMessages = this.context.toModelMessages();

    try {
      // Create chat stream with TanStack AI
      const stream = chat({
        adapter: this.adapter,
        messages: modelMessages,
        tools: this.getTools(),
        systemPrompts: this.config.systemPrompt ? [this.config.systemPrompt] : undefined,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        middleware: allMiddleware,
        abortController: this.currentAbortController,
      });

      let iterations = 0;
      let accumulatedContent = "";
      let lastUsage: TokenUsage | undefined;

      // Yield chunks from the stream
      for await (const chunk of stream) {
        // Track iterations (each RUN_STARTED after the first is a new iteration)
        if (chunk.type === "RUN_STARTED") {
          iterations++;
          if (iterations > this.config.maxIterations!) {
            this.currentAbortController.abort("Max iterations reached");
            break;
          }
        }

        // Track content
        if (chunk.type === "TEXT_MESSAGE_CONTENT") {
          accumulatedContent += chunk.delta;
        }

        // Track usage
        if (chunk.type === "RUN_FINISHED" && chunk.usage) {
          lastUsage = {
            inputTokens: chunk.usage.promptTokens ?? 0,
            outputTokens: chunk.usage.completionTokens ?? 0,
            totalTokens: chunk.usage.totalTokens ?? 0,
          };
        }

        yield chunk;
      }

      // Update final state
      this.status = "completed";

      // Update context with accumulated content
      if (accumulatedContent) {
        this.context.addAssistantMessage(accumulatedContent);
      }
      if (lastUsage) {
        this.context.usage.inputTokens += lastUsage.inputTokens;
        this.context.usage.outputTokens += lastUsage.outputTokens;
        this.context.usage.totalTokens += lastUsage.totalTokens;
      }
    } catch (err) {
      if (this.isAbortError(err)) {
        this.status = "aborted";
        options.onAbort?.("Run was aborted");
      } else {
        const error = err instanceof Error ? err : new Error(String(err));
        this.error = error.message;
        this.status = "error";
        options.onError?.(error);
        throw error;
      }
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Run the agent with callbacks (convenience method).
   * Consumes the stream internally and calls callbacks.
   */
  async runWithCallbacks(options: AgentRunOptions = {}): Promise<AgentStreamResult> {
    const { onChunk, onTextDelta, onReasoningDelta, onToolCallStart, onToolCallEnd, onUsage, onFinish, ...rest } =
      options;

    let content = "";
    let finishReason: string | undefined;
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let iterations = 0;

    // Track tool calls in progress
    const toolCallsInProgress: Map<string, ToolCall> = new Map();

    for await (const chunk of this.run(rest)) {
      onChunk?.(chunk);

      switch (chunk.type) {
        case "RUN_STARTED":
          iterations++;
          break;

        case "TEXT_MESSAGE_CONTENT":
          content += chunk.delta;
          onTextDelta?.(chunk.delta);
          break;

        case "STEP_FINISHED":
          // Thinking/reasoning content
          if (chunk.delta) {
            onReasoningDelta?.(chunk.delta);
          }
          break;

        case "TOOL_CALL_START":
          if (chunk.toolCallId && chunk.toolName) {
            const toolCall: ToolCall = {
              id: chunk.toolCallId,
              name: chunk.toolName,
              input: {},
            };
            toolCallsInProgress.set(chunk.toolCallId, toolCall);
            onToolCallStart?.(toolCall);
          }
          break;

        case "TOOL_CALL_END":
          if (chunk.toolCallId) {
            const toolCall = toolCallsInProgress.get(chunk.toolCallId);
            if (toolCall && chunk.input) {
              toolCall.input = chunk.input;
              onToolCallEnd?.(toolCall, chunk.input, false);
            }
            toolCallsInProgress.delete(chunk.toolCallId);
          }
          break;

        case "RUN_FINISHED":
          finishReason = chunk.finishReason ?? undefined;
          if (chunk.usage) {
            usage = {
              inputTokens: chunk.usage.promptTokens ?? 0,
              outputTokens: chunk.usage.completionTokens ?? 0,
              totalTokens: chunk.usage.totalTokens ?? 0,
            };
            onUsage?.(usage);
          }
          break;
      }
    }

    const result: AgentStreamResult = {
      content,
      finishReason,
      usage,
      iterations,
    };

    onFinish?.({ finishReason, content, usage });

    return result;
  }

  // ============================================================================
  // Abort
  // ============================================================================

  /**
   * Abort the current run
   */
  abort(reason?: string): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort(reason);
    }
  }

  /**
   * Check if an error is an abort error
   */
  private isAbortError(err: unknown): boolean {
    if (err instanceof Error) {
      return err.name === "AbortError" || err.message.includes("aborted");
    }
    return false;
  }

  // ============================================================================
  // Middleware
  // ============================================================================

  /**
   * Create middleware to sync events with context and callbacks
   */
  private createContextSyncMiddleware(options: AgentCallbacks): ChatMiddleware {
    return {
      name: "context-sync",
      onChunk: (_ctx, chunk) => {
        // Emit events to context
        this.context.emit(this.chunkToStreamEvent(chunk));
        return chunk;
      },
      onUsage: (_ctx, usage) => {
        options.onUsage?.({
          inputTokens: usage.promptTokens ?? 0,
          outputTokens: usage.completionTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
        });
      },
      onFinish: (_ctx, info) => {
        this.context.emit({
          type: "finish",
          usage: info.usage
            ? {
                inputTokens: info.usage.promptTokens ?? 0,
                outputTokens: info.usage.completionTokens ?? 0,
                totalTokens: info.usage.totalTokens ?? 0,
              }
            : undefined,
          finishReason: info.finishReason ?? undefined,
        });
      },
      onError: (_ctx, info) => {
        this.context.emit({ type: "error", error: info.error as Error });
        options.onError?.(info.error as Error);
      },
      onAbort: (_ctx, info) => {
        this.context.emit({ type: "error", error: new Error(info.reason ?? "Aborted") });
        options.onAbort?.(info.reason);
      },
    };
  }

  /**
   * Convert TanStack AI chunk to our StreamEvent format
   */
  private chunkToStreamEvent(chunk: StreamChunk): StreamEvent {
    switch (chunk.type) {
      case "RUN_STARTED":
        return { type: "start" };
      case "TEXT_MESSAGE_CONTENT":
        return { type: "text-delta", text: chunk.delta };
      case "STEP_FINISHED":
        return { type: "reasoning-delta", reasoning: chunk.delta ?? chunk.content };
      case "TOOL_CALL_START":
        return {
          type: "tool-call-start",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
        };
      case "TOOL_CALL_ARGS":
        return {
          type: "tool-call-delta",
          toolCallId: chunk.toolCallId,
          toolInputDelta: chunk.delta,
        };
      case "TOOL_CALL_END":
        return {
          type: "tool-call-end",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
        };
      case "RUN_FINISHED":
        return {
          type: "finish",
          usage: chunk.usage
            ? {
                inputTokens: chunk.usage.promptTokens ?? 0,
                outputTokens: chunk.usage.completionTokens ?? 0,
                totalTokens: chunk.usage.totalTokens ?? 0,
              }
            : undefined,
          finishReason: chunk.finishReason ?? undefined,
        };
      case "RUN_ERROR":
        return { type: "error", error: new Error(chunk.error?.message ?? "Unknown error") };
      default:
        return { type: "start" }; // Fallback for unknown chunk types
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Reset agent state
   */
  reset(): void {
    this.abort("Reset");
    this.status = "idle";
    this.error = "";
    this.context.reset();

    // Re-add system prompt
    if (this.config.systemPrompt) {
      this.context.addSystemMessage(this.config.systemPrompt);
    }
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<AgentConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration (partial)
   */
  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = AgentConfigSchema.parse({ ...this.config, ...updates });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export interface CreateAgentOptions extends AgentConfig {
  id?: string;
  sandbox?: Sandbox;
  tools?: ToolSet;
  adapter?: AnyTextAdapter;
  setUp?: <T>(instance: T) => T;
}

/**
 * Create a new agent instance
 */
export function createAgent(options: CreateAgentOptions): Agent {
  const { id, sandbox, tools, adapter, setUp, ...config } = options;
  const agent = new Agent(config, { id, setUp });

  if (adapter) {
    agent.setAdapter(adapter);
  }
  if (sandbox) {
    agent.setSandbox(sandbox);
  }
  if (tools) {
    agent.addTools(tools);
  }

  return agent;
}
