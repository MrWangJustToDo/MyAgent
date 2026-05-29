import { streamText, generateText, tool as vercelTool, stepCountIs } from "ai";
import { z } from "zod";

import { generateId } from "../../base/utils.js";
import { setActiveContext } from "../active-agent.js";

import { Base } from "./Base.js";

import type {
  TextStreamPart,
  ToolSet as VercelToolSet,
  Agent as VercelAgent,
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

type StreamParams = Omit<Parameters<typeof streamText>[0], "model">;

type TextParams = Omit<Parameters<typeof generateText>[0], "model">;

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
   * Build the final system prompt by appending dynamic sections:
   * 1. Agent documentation (AGENTS.md / CLAUDE.md)
   * 2. Available skills (two-layer injection pattern)
   *
   * The agent documentation is loaded from the project root on startup
   * and follows the cross-tool AGENTS.md standard.
   */
  private buildSystemPrompt(): string | undefined {
    const parts: string[] = [];

    // 1. Base system prompt (from config or default)
    if (this.config.systemPrompt) {
      parts.push(this.config.systemPrompt);
    }

    // 2. Agent documentation (AGENTS.md / CLAUDE.md content)
    // This is loaded during agent creation via agent-doc-loader.ts
    if (this.agentDocContent) {
      parts.push(`\n## Project Instructions\n\n${this.agentDocContent}`);
    }

    // 3. Available skills (two-layer injection)
    if (this.skillRegister && this.skillRegister.size > 0) {
      const skillSection = [
        "## Available Skills",
        "Use `load_skill` to load any of these skills when relevant to the user's task:",
        this.skillRegister.getDescriptions(),
      ].join("\n");
      parts.push(skillSection);
    }

    // 4. Nag reminder for todo updates (injected in system prompt to avoid
    // breaking ModelMessage type constraints — ToolContent doesn't accept TextPart)
    if (this.todoManager?.shouldNag()) {
      const reminder = this.todoManager.getNagReminder();
      this.log?.todo("Injecting nag reminder into system prompt", {
        roundsSinceUpdate: this.todoManager.getRoundsSinceUpdate(),
      });
      parts.push(reminder);
    }

    if (parts.length === 0) return undefined;

    const str = parts.join("\n\n");

    this.systemPrompt = str;

    return str;
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
  async stream(options: StreamParams): Promise<StreamTextResult<ToolSet, never>> {
    if (!this.model) {
      throw new Error("Model not set. Call setModel() first.");
    }

    const {
      prompt,
      messages,
      abortSignal,
      onStepFinish,
      onFinish,
      prepareStep,
      experimental_onToolCallStart,
      experimental_onToolCallFinish,
      ...rest
    } = options;

    // Use async preparation with auto-compaction support
    const finalMessages = this.prepareMessages({ prompt, messages });

    this.setupAbortController(abortSignal);

    this.status = "running";
    this.error = "";
    setActiveContext(this.context);

    const tools = this.getTools();

    const systemPrompt = this.buildSystemPrompt();

    this.log?.agent("Starting stream (Agent interface)", {
      systemPrompt,
      finalMessages,
      toolCount: Object.keys(tools).length,
    });

    // Use Vercel AI SDK streamText and return the result directly
    // The caller (DirectChatTransport) will call result.toUIMessageStream()
    const result = streamText({
      model: this.model,
      messages: finalMessages,
      tools,
      system: systemPrompt,
      maxOutputTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      abortSignal: this.currentAbortController!.signal,
      stopWhen: stepCountIs(this.config.maxIterations ?? 10),
      onStepFinish: this.createOnStepFinish(onStepFinish),
      prepareStep: this.createPrepareStep(prepareStep),
      onFinish: this.createOnFinish(onFinish),
      onChunk: ({ chunk }) => {
        this.context?.emit(chunk);
        if (chunk.type === "tool-call" && this.isToolNeedsApproval(chunk.toolName)) {
          this.status = "waiting";
        }
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
  }

  /**
   * Generates output from the agent (non-streaming, Vercel AI SDK Agent interface).
   *
   * Uses generateText internally and waits for completion.
   */
  async generate(options: TextParams): Promise<GenerateTextResult<ToolSet, never>> {
    if (!this.model) {
      throw new Error("Model not set. Call setModel() first.");
    }

    const {
      prompt,
      messages,
      abortSignal,
      onStepFinish,
      onFinish,
      prepareStep,
      experimental_onToolCallStart,
      experimental_onToolCallFinish,
      ...rest
    } = options;

    // Use async preparation with auto-compaction support
    const finalMessages = this.prepareMessages({ prompt, messages });

    this.setupAbortController(abortSignal);

    this.status = "running";
    this.error = "";
    setActiveContext(this.context);

    const tools = this.getTools();

    const systemPrompt = this.buildSystemPrompt();

    this.log?.agent("Starting generate (Agent interface)", {
      systemPrompt,
      finalMessages,
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
        prepareStep: this.createPrepareStep(prepareStep),
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

export type { AgentStatus, AgentRunOptions } from "./Base.js";
