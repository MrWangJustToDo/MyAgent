import { streamText, tool as vercelTool, isStepCount } from "ai";

import { generateId } from "../utils.js";

import { Base } from "./Base.js";
import { RunOrchestrator } from "./run-orchestrator.js";
import { isNaturalEnd, isStalled } from "./stop-conditions.js";
import { AgentConfigSchema } from "./types.js";

import type { AgentConfig, ToolSet } from "./types.js";
import type { Context } from "@ai-sdk/provider-utils";
import type {
  Agent as VercelAgent,
  AgentStreamParameters,
  AgentCallParameters,
  StreamTextResult,
  GenerateTextResult,
  PrepareStepFunction,
} from "ai";

type StreamParams = AgentStreamParameters<never, ToolSet, Context> & {
  prepareStep?: PrepareStepFunction<ToolSet, Context>;
};

type TextParams = AgentCallParameters<never, ToolSet, Context>;

// ============================================================================
// Agent Class
// ============================================================================

export class Agent extends Base implements VercelAgent<never, ToolSet, Context, never> {
  /**
   * Agent interface version for Vercel AI SDK compatibility
   */
  readonly version = "agent-v1" as const;

  readonly id: string;

  readonly symbol = Symbol.for("agent");

  // Configuration
  private config: AgentConfig;

  private readonly runOrchestrator = new RunOrchestrator(this);

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

  // ============================================================================
  // System Prompt (Cache-Stable)
  // ============================================================================

  /**
   * Frozen system prompt — built once per session from static sections only.
   * Dynamic content (relevant memories, todo nag) is injected via prepareStep
   * messages to preserve prefix cache stability across turns.
   */
  private frozenSystemPrompt: string | undefined = undefined;
  private systemPromptFrozen = false;

  /**
   * Build the cache-stable system prompt from session-static sections only.
   *
   * Sections included (byte-stable within a session):
   * 1. Base system prompt (from config)
   * 2. Agent documentation (AGENTS.md / CLAUDE.md)
   * 3. Available skills index (names + descriptions)
   * 4. Memory index (persistent cross-session knowledge)
   *
   * Dynamic per-turn content (relevant memories, todo nag reminders) is NOT
   * included here — it rides the message tail via prepareStep to keep the
   * system prompt prefix stable for DeepSeek's automatic prefix cache.
   */
  private buildSystemPrompt(): string | undefined {
    if (this.systemPromptFrozen) return this.frozenSystemPrompt;

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

    if (parts.length === 0) {
      this.frozenSystemPrompt = undefined;
    } else {
      this.frozenSystemPrompt = parts.join("\n\n");
    }

    this.systemPromptFrozen = true;
    this.systemPrompt = this.frozenSystemPrompt ?? "";

    return this.frozenSystemPrompt;
  }

  /**
   * Build per-turn dynamic context to inject into messages (not system prompt).
   * Returns undefined if no dynamic context needs injection.
   */
  getDynamicTurnContext(): string | undefined {
    const parts: string[] = [];

    if (this.relevantMemoryContent) {
      parts.push(this.relevantMemoryContent);
    }

    if (this.todoManager?.shouldNag()) {
      const reminder = this.todoManager.getNagReminder();
      this.log?.todo("Injecting nag reminder via turn context", {
        roundsSinceUpdate: this.todoManager.getRoundsSinceUpdate(),
      });
      parts.push(reminder);
    }

    return parts.length > 0 ? parts.join("\n\n") : undefined;
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
  async stream(options: StreamParams): Promise<StreamTextResult<ToolSet, Context, never>> {
    if (!this.model) {
      throw new Error("Model not set. Call setModel() first.");
    }

    const {
      prompt,
      messages,
      abortSignal,
      onStepEnd,
      onEnd,
      prepareStep,
      onToolExecutionStart,
      onToolExecutionEnd,
      ...rest
    } = options;

    const finalMessages = this.prepareMessages({ prompt, messages });

    this.setupAbortController(abortSignal);
    this.resetReactiveCompactRetries();

    this.runOrchestrator.beginRun();
    if (this.streamStartedAt === 0) this.streamStartedAt = Date.now();

    await this.prefetchRelevantMemories(finalMessages);

    const tools = this.getTools();
    const systemPrompt = this.buildSystemPrompt();

    this.log?.agent("Starting stream (Agent interface)", {
      systemPrompt,
      finalMessages,
      toolCount: Object.keys(tools).length,
    });

    this.emitEvent("prompt:submit", {
      prompt: typeof prompt === "string" ? prompt : "(structured)",
    });

    const streamHandlers = this.runOrchestrator.createStreamHandlers({
      onToolExecutionStart,
      onToolExecutionEnd,
    });

    return streamText({
      model: this.model,
      messages: finalMessages,
      tools,
      instructions: systemPrompt,
      maxOutputTokens: this.resolveMaxOutputTokens(),
      temperature: this.config.temperature,
      abortSignal: this.currentAbortController!.signal,
      stopWhen: [isStepCount(this.config.maxIterations ?? 10), isNaturalEnd(), isStalled()],
      onStepEnd: this.createOnStepFinish(onStepEnd),
      prepareStep: this.createPrepareStep(prepareStep),
      onEnd: this.createOnFinish(onEnd),
      ...streamHandlers,
      ...rest,
    });
  }

  /**
   * Generates output from the agent (non-streaming, Vercel AI SDK Agent interface).
   *
   * Delegates to stream() internally for consistent behavior
   * (status changes, tool approval, lifecycle events).
   * StreamTextResult is thenable — awaiting gives GenerateTextResult.
   */
  async generate(options: TextParams): Promise<GenerateTextResult<ToolSet, Context, never>> {
    if (!this.model) {
      throw new Error("Model not set. Call setModel() first.");
    }

    const runGenerate = async (): Promise<GenerateTextResult<ToolSet, Context, never>> => {
      const streamResult = await this.stream(options);
      return {
        text: await streamResult.text,
        content: await streamResult.content,
        reasoning: await streamResult.reasoning,
        reasoningText: await streamResult.reasoningText,
        files: await streamResult.files,
        sources: await streamResult.sources,
        toolCalls: await streamResult.toolCalls,
        staticToolCalls: await streamResult.staticToolCalls,
        dynamicToolCalls: await streamResult.dynamicToolCalls,
        toolResults: await streamResult.toolResults,
        staticToolResults: await streamResult.staticToolResults,
        dynamicToolResults: await streamResult.dynamicToolResults,
        finishReason: await streamResult.finishReason,
        rawFinishReason: await streamResult.rawFinishReason,
        usage: await streamResult.usage,
        totalUsage: await streamResult.totalUsage,
        warnings: await streamResult.warnings,
        request: await streamResult.request,
        response: await streamResult.response,
        responseMessages: await streamResult.responseMessages,
        output: await streamResult.output,
        providerMetadata: await streamResult.providerMetadata,
        steps: await streamResult.steps,
        finalStep: await streamResult.finalStep,
      };
    };

    try {
      return await runGenerate();
    } catch (err) {
      if (this.isAbortError(err)) {
        this.setStatus("aborted");
        this.log?.agent("Generate aborted");
        throw err;
      }

      this.resetReactiveCompactRetries();
      const compacted = await this.handleReactiveCompact(err);
      if (compacted) {
        this.log?.info("agent", "Reactive compact succeeded, retrying generate via stream()");
        try {
          return await runGenerate();
        } catch (retryErr) {
          const retryError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
          this.error = retryError.message;
          this.setStatus("error");
          this.log?.error("agent", "Generate error after reactive compact retry", retryError);
          throw retryErr;
        }
      }

      const error = err instanceof Error ? err : new Error(String(err));
      this.error = error.message;
      this.setStatus("error");
      this.log?.error("agent", "Generate error", error);
      throw err;
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Reset agent state including frozen system prompt cache.
   */
  override reset(): void {
    this.systemPromptFrozen = false;
    this.frozenSystemPrompt = undefined;
    super.reset();
  }
}

// ============================================================================
// Exports
// ============================================================================

export { vercelTool as tool };

export type { AgentStatus, AgentRunOptions } from "./types.js";
