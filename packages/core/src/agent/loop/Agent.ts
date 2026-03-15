import { chat } from "@tanstack/ai";
import { z } from "zod";

import { generateContextId } from "../agentContext";
import { type Tools } from "../tools";

import type { Sandbox } from "../../environment";
import type { AgentContext } from "../agentContext";
import type { AgentLog } from "../agentLog";
import type { ChatMiddleware, StreamChunk, AnyTextAdapter, Tool, SchemaInput, AGUIEvent } from "@tanstack/ai";
import type { TextActivityOptions } from "@tanstack/ai/adapters";
import type { OllamaTextAdapter } from "@tanstack/ai-ollama";

// ============================================================================
// Types & Schemas
// ============================================================================

export type AgentStatus = "idle" | "running" | "completed" | "error" | "aborted" | "waiting";

export const AgentConfigSchema = z.object({
  model: z.string().min(1).describe("Model name to use"),
  baseURL: z.string().optional().describe("Base URL for the model API"),
  systemPrompt: z.string().optional().describe("System prompt for the agent"),
  maxIterations: z.number().int().min(1).max(100).optional().default(10).describe("Maximum agentic loop iterations"),
  maxTokens: z.number().int().min(1).optional().describe("Maximum tokens per response"),
  temperature: z.number().min(0).max(2).optional().describe("Sampling temperature"),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** Tool set type - array of TanStack AI tools (ServerTool, ClientTool, or ToolDefinition) */
export type ToolSet = Tool[];

/** Run options */
export interface AgentRunOptions
  extends
    Omit<ChatMiddleware, "name">,
    Omit<TextActivityOptions<OllamaTextAdapter<string>, SchemaInput, true>, "stream"> {
  prompt?: string;
  abortSignal?: AbortSignal;
  /** Additional middleware to apply */
  middleware?: ChatMiddleware[];
}

// ============================================================================
// Agent Class
// ============================================================================

export class Agent {
  readonly id: string;

  readonly symbol = Symbol.for("agent");

  // State
  status: AgentStatus = "idle";
  error = "";

  // Configuration
  private config: AgentConfig;

  // Resources
  private log: AgentLog | null = null;
  private context: AgentContext | null = null;
  private sandbox: Sandbox | null = null;
  private customTools: ToolSet = [];
  private builtInTools: Tools | null = null;

  // Adapter (TanStack AI)
  private adapter: AnyTextAdapter | null = null;

  // Abort controller for current run
  private currentAbortController: AbortController | null = null;

  private contextSyntaxMiddleware: ChatMiddleware = {
    name: "context-sync",
    onChunk: (_ctx, chunk) => {
      // Emit events to context
      this.context?.emit?.(chunk);
    },
    onUsage: (_ctx, usage) => {
      const c = {
        inputTokens: usage.promptTokens ?? 0,
        outputTokens: usage.completionTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      };

      this.context?.updateUsage?.(c);
    },
    onFinish: (_ctx, info) => {
      this.context?.updateFinal?.(info);
    },
  };

  private logSyntaxMiddleware: ChatMiddleware = {
    name: "log-sync",
    onBeforeToolCall: (ctx, hookCtx) => {
      this.log?.info?.("tool", "tool-call-start", { ctx, hookCtx });
    },
    onAfterToolCall: (ctx, hookCtx) => {
      this.log?.info?.("tool", "tool-call-end", { ctx, hookCtx });
    },
  };

  constructor(config: AgentConfig, { id, setUp }: { id?: string; setUp?: (t: Agent) => Agent }) {
    this.id = id ?? generateContextId().replace("ctx_", "agent_");
    this.config = AgentConfigSchema.parse(config);

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
  }

  /**
   * Get sandbox
   */
  getSandbox(): Sandbox | null {
    return this.sandbox;
  }

  setTools(tools: Tools) {
    this.builtInTools = tools;
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
        tools.push(tool as Tool);
      }
    }

    // Add custom tools
    tools.push(...this.customTools);

    return tools;
  }

  setLog(c: AgentLog) {
    this.log = c;
  }

  getLog() {
    return this.log;
  }

  setContext(c: AgentContext) {
    this.context = c;
  }

  getContext() {
    return this.context;
  }

  // ============================================================================
  // Run (Streaming)
  // ============================================================================

  /**
   * Run the agent and return an async iterable stream.
   * This is the primary method for consuming agent responses.
   *
   */
  async *run(options: AgentRunOptions): AsyncIterable<StreamChunk> {
    if (!this.adapter) {
      throw new Error("Adapter not set. Call setAdapter() first.");
    }

    const { prompt, messages, abortSignal, middleware = [], adapter, ...rest } = options;

    const finalMessage = messages || [];

    if (prompt) {
      finalMessage.push({ role: "user", content: prompt });
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
      this.logSyntaxMiddleware,
      this.contextSyntaxMiddleware,
      // Context sync middleware
      this.createOptionMiddleware(options),
      // Custom middleware
      ...middleware,
    ];

    try {
      // Create chat stream with TanStack AI
      // Pass messages directly - chat() handles UIMessage -> ModelMessage conversion
      // and extracts approval state from UIMessage parts before conversion
      // Note: We cast to 'any' because chat() internally handles both UIMessage[] and ModelMessage[]
      // via convertMessagesToModelMessages(), but the type signature is strict
      const tools = this.getTools();
      this.log?.agent("Starting chat", {
        messageCount: finalMessage.length,
        toolCount: tools.length,
        tools: tools.map((t) => ({ name: t.name, needsApproval: (t as any).needsApproval })),
      });
      const stream = chat<OllamaTextAdapter<string>, AgentRunOptions["outputSchema"], true>({
        adapter: adapter || (this.adapter as OllamaTextAdapter<string>),
        messages: finalMessage,
        tools,
        systemPrompts: this.config.systemPrompt ? [this.config.systemPrompt] : undefined,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        middleware: allMiddleware,
        abortController: this.currentAbortController,
        ...rest,
      }) as AsyncIterable<AGUIEvent>;

      let iterations = 0;

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

        if (chunk.type === "CUSTOM") {
          const value = chunk.value as {
            toolCallId: string;
            toolCallName: string;
            input: unknown;
          };
          if (value.input && value.toolCallId) {
            this.status = "waiting";
          }
        }

        yield chunk;
      }

      if (this.status !== "waiting") {
        // Update final state
        this.status = "completed";
      }
    } catch (err) {
      if (this.isAbortError(err)) {
        this.status = "aborted";
      } else {
        const error = err instanceof Error ? err : new Error(String(err));
        this.error = error.message;
        this.status = "error";
        throw error;
      }
    } finally {
      this.currentAbortController = null;
    }
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

  private createOptionMiddleware(options: AgentRunOptions): ChatMiddleware {
    return {
      name: "options-listener",
      ...options,
    };
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
    this.log?.clear();
    this.context?.reset();
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
