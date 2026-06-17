import { streamText, generateText, tool as vercelTool, stepCountIs } from "ai";

import { emitHook } from "../hooks/hook-runner.js";
import { generateId } from "../utils.js";

import { Base } from "./Base.js";
import { AgentConfigSchema } from "./types.js";

import type { AgentConfig, ToolSet } from "./types.js";
import type { PostToolUseInput, PostToolUseFailureInput } from "../hooks/types.js";
import type { Agent as VercelAgent, StreamTextResult, GenerateTextResult, GenerateTextOnStepFinishCallback } from "ai";

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

  /**
   * Resolve the effective maxOutputTokens: explicit config > modelInfo default > undefined (SDK default).
   */
  private resolveMaxOutputTokens(): number | undefined {
    return this.config.maxTokens ?? this.modelInfo?.defaultMaxTokens ?? undefined;
  }

  private getHookSessionId(): string {
    return this.sessionData?.id ?? this.id;
  }

  // ============================================================================
  // System Prompt
  // ============================================================================

  /**
   * Build the final system prompt by appending dynamic sections.
   *
   * Each section is wrapped in XML tags (`<project_instructions>`, `<skills>`,
   * `<memory_index>`, `<relevant_memories>`, `<reminder>`) to provide
   * unambiguous structural boundaries. The markdown content inside each section
   * (which may contain its own `##` headings, `---` separators, code fences,
   * etc.) is preserved as-is — the XML envelope prevents the LLM from
   * confusing inter-section structure with intra-section markdown.
   */

  private buildSystemPrompt(): string | undefined {
    const parts: string[] = [];

    // 1. Base system prompt (from config or default) — no wrapper needed
    if (this.config.systemPrompt) {
      parts.push(this.config.systemPrompt);
    }

    // 2. Agent documentation (AGENTS.md / CLAUDE.md content)
    if (this.agentDocContent) {
      parts.push(
        [
          "<project_instructions>",
          "Below are the project-specific instructions loaded from the repository.",
          "Follow these conventions, rules, and guidelines when working in this codebase.",
          "",
          this.agentDocContent,
          "</project_instructions>",
        ].join("\n")
      );
    }

    // 3. Available skills (two-layer injection)
    if (this.skillRegister && this.skillRegister.size > 0) {
      parts.push(
        [
          "<skills>",
          "Use `load_skill` to load any of these skills when relevant to the user's task:",
          "",
          this.skillRegister.getDescriptions(),
          "</skills>",
        ].join("\n")
      );
    }

    // 4. Memory index (persistent cross-session knowledge)
    if (this.memoryContent) {
      parts.push(
        [
          "<memory_index>",
          "These are memories from previous sessions. Respect user preferences from memory.",
          "When the user says 'remember' or expresses a clear preference, it will be automatically extracted.",
          "",
          this.memoryContent,
          "</memory_index>",
        ].join("\n")
      );
    }

    // 5. Relevant memory content (full body of memories selected for this turn)
    if (this.relevantMemoryContent) {
      parts.push(this.relevantMemoryContent);
    }

    // 6. Nag reminder for todo updates
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
    this.resetReactiveCompactRetries();

    this.status = "running";
    if (this.streamStartedAt === 0) this.streamStartedAt = Date.now();
    this.error = "";

    // Prefetch relevant memories before building system prompt
    await this.prefetchRelevantMemories(finalMessages);

    const tools = this.getTools();

    const systemPrompt = this.buildSystemPrompt();

    this.log?.agent("Starting stream (Agent interface)", {
      systemPrompt,
      finalMessages,
      toolCount: Object.keys(tools).length,
    });

    emitHook(
      this.hookRegistry,
      "UserPromptSubmit",
      {
        hook_event_name: "UserPromptSubmit",
        session_id: this.getHookSessionId(),
        prompt: typeof prompt === "string" ? prompt : "(structured)",
      },
      { logger: this.log ?? undefined }
    );

    const runStream = (msgs: typeof finalMessages): StreamTextResult<ToolSet, never> => {
      return streamText({
        model: this.model!,
        messages: msgs,
        tools,
        system: systemPrompt,
        maxOutputTokens: this.resolveMaxOutputTokens(),
        temperature: this.config.temperature,
        abortSignal: this.currentAbortController!.signal,
        stopWhen: stepCountIs(this.config.maxIterations ?? 10),
        onStepFinish: this.createOnStepFinish(onStepFinish),
        prepareStep: this.createPrepareStep(prepareStep),
        onFinish: this.createOnFinish(true, onFinish),
        onChunk: ({ chunk }) => {
          this.context?.emit(chunk);
          if (chunk.type === "tool-call" && this.isToolNeedsApproval(chunk.toolName)) {
            this.status = "waiting";
            emitHook(
              this.hookRegistry,
              "Notification",
              {
                hook_event_name: "Notification",
                session_id: this.getHookSessionId(),
                message: `Tool ${chunk.toolName} requires approval`,
              },
              { logger: this.log ?? undefined }
            );
            return;
          }
          if (chunk.type === "reasoning-delta") {
            this.status = "thinking";
            return;
          }
          if (this.status === "running" || this.status === "thinking") {
            this.status = "responding";
          }
        },
        onAbort: () => {
          this.status = "aborted";
          this.log?.agent("stream aborted");
        },
        onError: async (event) => {
          const err = event.error;
          // Attempt reactive compaction on prompt_too_long errors
          const compacted = await this.handleReactiveCompact(err);
          if (compacted) {
            this.log?.info(
              "agent",
              "Reactive compact succeeded, but stream cannot auto-retry. Next user message will use compacted context."
            );
          }

          this.status = "error";
          this.error = (err as Error)?.message;
          this.log?.error("agent", "Stream error", err as Error);
        },
        experimental_onToolCallStart: (event) => {
          const { toolCall } = event;
          this.status = "running";
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

          if (error) {
            emitHook(
              this.hookRegistry,
              "PostToolUseFailure",
              {
                hook_event_name: "PostToolUseFailure",
                session_id: this.getHookSessionId(),
                tool_name: toolCall.toolName,
                tool_input: toolCall.input,
                error: error instanceof Error ? error.message : String(error),
              } satisfies PostToolUseFailureInput,
              { matchValue: toolCall.toolName, logger: this.log ?? undefined }
            );
          } else {
            emitHook(
              this.hookRegistry,
              "PostToolUse",
              {
                hook_event_name: "PostToolUse",
                session_id: this.getHookSessionId(),
                tool_name: toolCall.toolName,
                tool_input: toolCall.input,
                tool_output: output,
                duration_ms: durationMs ?? 0,
              } satisfies PostToolUseInput,
              { matchValue: toolCall.toolName, logger: this.log ?? undefined }
            );
          }

          experimental_onToolCallFinish?.(event);
        },
        ...rest,
      });
    };

    return runStream(finalMessages);
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
    let finalMessages = this.prepareMessages({ prompt, messages });

    this.setupAbortController(abortSignal);
    this.resetReactiveCompactRetries();

    this.status = "running";
    if (this.generateStartedAt === 0) this.generateStartedAt = Date.now();
    this.error = "";

    // Prefetch relevant memories before building system prompt
    await this.prefetchRelevantMemories(finalMessages);

    const tools = this.getTools();

    const systemPrompt = this.buildSystemPrompt();

    this.log?.agent("Starting generate (Agent interface)", {
      systemPrompt,
      finalMessages,
      toolCount: Object.keys(tools).length,
    });

    emitHook(
      this.hookRegistry,
      "UserPromptSubmit",
      {
        hook_event_name: "UserPromptSubmit",
        session_id: this.getHookSessionId(),
        prompt: typeof prompt === "string" ? prompt : "(structured)",
      },
      { logger: this.log ?? undefined }
    );

    const runGenerate = async (msgs: typeof finalMessages): Promise<GenerateTextResult<ToolSet, never>> => {
      return generateText({
        model: this.model!,
        messages: msgs,
        tools,
        system: systemPrompt,
        maxOutputTokens: this.resolveMaxOutputTokens(),
        temperature: this.config.temperature,
        abortSignal: this.currentAbortController!.signal,
        stopWhen: stepCountIs(this.config.maxIterations ?? 10),
        onStepFinish: this.createOnStepFinish(onStepFinish) as GenerateTextOnStepFinishCallback<NoInfer<ToolSet>>,
        prepareStep: this.createPrepareStep(prepareStep),
        onFinish: this.createOnFinish(false, onFinish),
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

          if (error) {
            emitHook(
              this.hookRegistry,
              "PostToolUseFailure",
              {
                hook_event_name: "PostToolUseFailure",
                session_id: this.getHookSessionId(),
                tool_name: toolCall.toolName,
                tool_input: toolCall.input,
                error: error instanceof Error ? error.message : String(error),
              } satisfies PostToolUseFailureInput,
              { matchValue: toolCall.toolName, logger: this.log ?? undefined }
            );
          } else {
            emitHook(
              this.hookRegistry,
              "PostToolUse",
              {
                hook_event_name: "PostToolUse",
                session_id: this.getHookSessionId(),
                tool_name: toolCall.toolName,
                tool_input: toolCall.input,
                tool_output: output,
                duration_ms: durationMs ?? 0,
              } satisfies PostToolUseInput,
              { matchValue: toolCall.toolName, logger: this.log ?? undefined }
            );
          }

          experimental_onToolCallFinish?.(event);
        },
        ...rest,
      });
    };

    try {
      const result = await runGenerate(finalMessages);
      return result;
    } catch (err) {
      if (this.isAbortError(err)) {
        this.status = "aborted";
        this.log?.agent("Generate aborted");
        throw err;
      }

      // Attempt reactive compaction on prompt_too_long errors
      const compacted = await this.handleReactiveCompact(err);
      if (compacted) {
        this.log?.info("agent", "Reactive compact succeeded, retrying generate");
        try {
          finalMessages = this.context?.getMessagesForLLM() ?? finalMessages;
          return await runGenerate(finalMessages);
        } catch (retryErr) {
          const retryError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
          this.error = retryError.message;
          this.status = "error";
          this.log?.error("agent", "Generate error after reactive compact retry", retryError);
          throw retryErr;
        }
      }

      const error = err instanceof Error ? err : new Error(String(err));
      this.error = error.message;
      this.status = "error";
      this.log?.error("agent", "Generate error", error);
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

export type { AgentStatus, AgentRunOptions } from "./types.js";
