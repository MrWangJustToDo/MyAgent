import { streamText, generateText, tool as vercelTool, stepCountIs } from "ai";
import { z } from "zod";

import { generateId } from "../../base/utils.js";

import { Base } from "./base.js";

import type {
  TextStreamPart,
  ToolSet as VercelToolSet,
  Agent as VercelAgent,
  AgentCallParameters,
  AgentStreamParameters,
  StreamTextResult,
  GenerateTextResult,
  GenerateTextOnStepFinishCallback,
} from "ai";

// ============================================================================
// Types & Schemas
// ============================================================================

export const AgentConfigSchema = z.object({
  model: z.string().min(1).describe("Model name to use"),
  baseURL: z.string().optional().describe("Base URL for the model API"),
  systemPrompt: z.string().optional().describe("System prompt for the agent"),
  maxIterations: z.number().int().min(1).max(100).optional().default(10).describe("Maximum agentic loop iterations"),
  maxTokens: z.number().int().min(1).optional().describe("Maximum tokens per response"),
  temperature: z.number().min(0).max(2).optional().describe("Sampling temperature"),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** Tool set type - Record of Vercel AI tools */
export type ToolSet = VercelToolSet;

/** Stream part type from Vercel AI SDK */
export type StreamPart = TextStreamPart<ToolSet>;

/** Vercel AI SDK usage type (used by context.updateUsage) */
export interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
}

// ============================================================================
// Agent Class
// ============================================================================

export class Agent extends Base implements VercelAgent<never, ToolSet, never> {
  /**
   * Agent interface version for Vercel AI SDK compatibility
   */
  readonly version = "agent-v1" as const;

  readonly id: string;

  readonly symbol = Symbol.for("agent");

  // Configuration
  private config: AgentConfig;

  constructor(config: AgentConfig, { id, setUp }: { id?: string; setUp?: (t: Agent) => Agent } = {}) {
    super();

    this.id = id ?? generateId("agent");
    this.agentId = this.id; // Set base class agentId for compaction
    this.config = AgentConfigSchema.parse(config);

    if (setUp) {
      return setUp(this);
    }
  }

  /**
   * Tools getter for Vercel AI SDK Agent interface
   */
  get tools(): ToolSet {
    return this.getTools();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

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

  // ============================================================================
  // System Prompt
  // ============================================================================

  /**
   * Build the final system prompt by appending dynamic sections (e.g. available skills).
   */
  private buildSystemPrompt(): string | undefined {
    const base = this.config.systemPrompt;
    if (!this.skillRegister || this.skillRegister.size === 0) {
      return base;
    }

    const skillSection = [
      "",
      "## Available Skills",
      "Use `load_skill` to load any of these skills when relevant to the user's task:",
      this.skillRegister.getDescriptions(),
    ].join("\n");

    return base ? base + "\n" + skillSection : skillSection;
  }

  // ============================================================================
  // Vercel AI SDK Agent Interface Methods
  // ============================================================================

  /**
   * Streams output from the agent (Vercel AI SDK Agent interface).
   * This is the primary method for DirectChatTransport integration.
   *
   * Returns the StreamTextResult directly, allowing the caller to use
   * `result.fullStream`, `result.toUIMessageStream()`, etc.
   */
  async stream(options: AgentStreamParameters<never, ToolSet>): Promise<StreamTextResult<ToolSet, never>> {
    if (!this.model) {
      throw new Error("Model not set. Call setModel() first.");
    }

    const {
      prompt,
      messages,
      abortSignal,
      onStepFinish,
      onFinish,
      experimental_onToolCallStart,
      experimental_onToolCallFinish,
      ...rest
    } = options;

    // Use async preparation with auto-compaction support
    const { messages: finalMessages, compactionResult } = await this.prepareMessagesAsync({ prompt, messages });
    this.setupAbortController(abortSignal);

    if (compactionResult?.compacted) {
      this.log?.info("agent", "Using compacted messages for stream", {
        tokensBefore: compactionResult.tokensBefore,
        tokensAfter: compactionResult.tokensAfter,
      });
    }

    this.status = "running";
    this.error = "";

    const tools = this.getTools();

    this.log?.agent("Starting stream (Agent interface)", {
      prompt,
      messages,
      finalMessages,
      finalMessagesCount: finalMessages.length,
      toolCount: Object.keys(tools).length,
    });

    const toolChunk: StreamPart[] = [];
    const reasonChunk: StreamPart[] = [];
    const textChunk: StreamPart[] = [];
    const otherChunk: StreamPart[] = [];

    this.log?.chunk("all", { toolChunk, reasonChunk, textChunk, otherChunk });

    // Use Vercel AI SDK streamText and return the result directly
    // The caller (DirectChatTransport) will call result.toUIMessageStream()
    const result = streamText({
      model: this.model,
      messages: finalMessages,
      tools,
      system: this.buildSystemPrompt(),
      maxOutputTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      abortSignal: this.currentAbortController!.signal,
      stopWhen: stepCountIs(this.config.maxIterations ?? 10),
      onStepFinish: this.createOnStepFinish(onStepFinish),
      onFinish: this.createOnFinish(onFinish),
      onChunk: ({ chunk }) => {
        if (chunk.type.includes("text")) {
          textChunk.push(chunk);
        } else if (chunk.type.includes("tool")) {
          toolChunk.push(chunk);
        } else if (chunk.type.includes("reasoning")) {
          reasonChunk.push(chunk);
        } else {
          otherChunk.push(chunk);
        }
        this.context?.emit(chunk);
        if (chunk.type === "tool-call" && this.isToolNeedsApproval(chunk.toolName)) {
          this.status = "waiting";
        }
      },
      experimental_onToolCallStart: (event) => {
        const { toolCall } = event;
        this.log?.tool("tool-call-start", {
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          input: toolCall.input,
        });
        this.context?.addTool(toolCall);
        experimental_onToolCallStart?.(event);
      },
      onAbort: () => {
        this.status = "aborted";
        this.log?.agent("stream aborted");
      },
      onError: (event) => {
        this.status = "error";
        this.error = (event.error as Error)?.message;
        this.log?.error("agent", "Generate error", event.error as Error);
      },
      experimental_onToolCallFinish: (event) => {
        const { toolCall, durationMs } = event;
        const output = "output" in event ? event.output : undefined;
        const error = "error" in event ? event.error : undefined;

        this.log?.tool("tool-call-end", {
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output,
          error: error instanceof Error ? error.message : error,
          durationMs,
        });
        experimental_onToolCallFinish?.(event);
      },
      ...rest,
    });

    return result;
  }

  /**
   * Generates output from the agent (non-streaming, Vercel AI SDK Agent interface).
   *
   * Uses generateText internally and waits for completion.
   */
  async generate(options: AgentCallParameters<never, ToolSet>): Promise<GenerateTextResult<ToolSet, never>> {
    if (!this.model) {
      throw new Error("Model not set. Call setModel() first.");
    }

    const {
      prompt,
      messages,
      abortSignal,
      onStepFinish,
      onFinish,
      experimental_onToolCallStart,
      experimental_onToolCallFinish,
      ...rest
    } = options;

    // Use async preparation with auto-compaction support
    const { messages: finalMessages, compactionResult } = await this.prepareMessagesAsync({ prompt, messages });

    this.setupAbortController(abortSignal);

    if (compactionResult?.compacted) {
      this.log?.info("agent", "Using compacted messages for generate", {
        tokensBefore: compactionResult.tokensBefore,
        tokensAfter: compactionResult.tokensAfter,
      });
    }

    this.status = "running";
    this.error = "";

    const tools = this.getTools();

    this.log?.agent("Starting generate (Agent interface)", {
      prompt,
      messages,
      finalMessages,
      finalMessagesCount: finalMessages.length,
      toolCount: Object.keys(tools).length,
    });

    try {
      const result = await generateText({
        model: this.model,
        messages: finalMessages,
        tools,
        system: this.buildSystemPrompt(),
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        abortSignal: this.currentAbortController!.signal,
        stopWhen: stepCountIs(this.config.maxIterations ?? 10),
        onStepFinish: this.createOnStepFinish(onStepFinish) as GenerateTextOnStepFinishCallback<NoInfer<ToolSet>>,
        onFinish: this.createOnFinish(onFinish),
        experimental_onToolCallStart: (event) => {
          const { toolCall } = event;
          this.log?.tool("tool-call-start", {
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            input: toolCall.input,
          });
          this.context?.addTool(toolCall);
          experimental_onToolCallStart?.(event);
        },
        experimental_onToolCallFinish: (event) => {
          const { toolCall, durationMs } = event;
          const output = "output" in event ? event.output : undefined;
          const error = "error" in event ? event.error : undefined;

          this.log?.tool("tool-call-end", {
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output,
            error: error instanceof Error ? error.message : error,
            durationMs,
          });
          experimental_onToolCallFinish?.(event);
        },
        ...rest,
      });

      return result;
    } catch (err) {
      if (this.isAbortError(err)) {
        this.status = "aborted";
        this.log?.agent("Generate aborted");
      } else {
        const error = err instanceof Error ? err : new Error(String(err));
        this.error = error.message;
        this.status = "error";
        this.log?.error("agent", "Generate error", error);
      }
      throw err;
    } finally {
      this.currentAbortController = null;
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export { vercelTool as tool };

export type { AgentStatus, AgentRunOptions } from "./base.js";
