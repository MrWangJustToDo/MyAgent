import { autoCompact } from "../compaction/auto-compact.js";
import { microCompact } from "../compaction/micro-compact.js";
import { estimateTokens } from "../compaction/token-estimator.js";
import { createTodoTool } from "../tools";

import type { Sandbox } from "../../environment";
import type { AgentContext } from "../agent-context";
import type { AgentLog } from "../agent-log";
import type { CompactionConfig, CompactionResult } from "../compaction/types.js";
import type { SkillRegistry } from "../skills";
import type { TodoManager } from "../todo-manager";
import type {
  ToolSet,
  LanguageModel,
  ModelMessage,
  StreamTextOnStepFinishCallback,
  GenerateTextOnStepFinishCallback,
  StreamTextOnFinishCallback,
  GenerateTextOnFinishCallback,
} from "ai";

export type AgentStatus = "idle" | "running" | "completed" | "error" | "aborted" | "waiting";

/** Run options */
export interface AgentRunOptions {
  /** User prompt (creates a user message) */
  prompt?: string;
  /** Messages array */
  messages?: ModelMessage[];
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Override model for this run */
  model?: LanguageModel;
}

export class Base {
  // State
  status: AgentStatus = "idle";
  error = "";

  // Resources
  log: AgentLog | null = null;
  context: AgentContext | null = null;
  sandbox: Sandbox | null = null;
  todoManager: TodoManager | null = null;
  skillRegister: SkillRegistry | null = null;
  compactionConfig: CompactionConfig | null = null;
  customTools: ToolSet = {};
  builtInTools: ToolSet = {};

  // Model (Vercel AI SDK LanguageModel)
  model: LanguageModel | null = null;

  // Abort controller for current run
  currentAbortController: AbortController | null = null;

  // ============================================================================
  // Resource Management
  // ============================================================================

  /**
   * Set the Vercel AI SDK LanguageModel
   */
  setModel(model: LanguageModel): void {
    this.log?.debug("agent", "Setting model", {
      hadPreviousModel: !!this.model,
    });
    this.model = model;
  }

  /**
   * Get the current model
   */
  getModel(): LanguageModel | null {
    return this.model;
  }

  /**
   * Set sandbox for tool execution
   */
  setSandbox(sandbox: Sandbox): void {
    this.log?.debug("agent", "Setting sandbox", {
      sandboxId: sandbox.sandboxId,
      provider: sandbox.provider,
    });
    this.sandbox = sandbox;
  }

  /**
   * Get sandbox
   */
  getSandbox(): Sandbox | null {
    return this.sandbox;
  }

  /**
   * Set built-in tools (from createTools)
   */
  setTools(tools: ToolSet): void {
    this.builtInTools = tools;
  }

  /**
   * Add custom tools
   */
  addTools(tools: ToolSet): void {
    this.customTools = { ...this.customTools, ...tools };
  }

  /**
   * Get all tools as Record for Vercel AI SDK
   */
  getTools(): ToolSet {
    return {
      ...this.builtInTools,
      ...this.customTools,
    };
  }

  /**
   * Set logger
   */
  setLog(c: AgentLog): void {
    this.log = c;
  }

  /**
   * Get logger
   */
  getLog(): AgentLog | null {
    return this.log;
  }

  /**
   * Set context
   */
  setContext(c: AgentContext): void {
    this.context = c;
  }

  /**
   * Get context
   */
  getContext(): AgentContext | null {
    return this.context;
  }

  /**
   * Set todo manager for task tracking
   */
  setTodoManager(t: TodoManager): void {
    if (this.todoManager) return;

    this.todoManager = t;

    this.addTools({ todo: createTodoTool({ todoManager: t }) });
  }

  /**
   * Get todo manager
   */
  getTodoManager(): TodoManager | null {
    return this.todoManager;
  }

  setSkillRegister(t: SkillRegistry) {
    if (this.skillRegister) return;

    this.skillRegister = t;
  }

  getSkillRegister() {
    return this.skillRegister;
  }

  /**
   * Set compaction configuration
   */
  setCompactionConfig(config: CompactionConfig): void {
    this.log?.debug("agent", "Setting compaction config", {
      enabled: config.enabled,
      tokenThreshold: config.tokenThreshold,
      keepRecentToolResults: config.keepRecentToolResults,
    });
    this.compactionConfig = config;
  }

  /**
   * Get compaction configuration
   */
  getCompactionConfig(): CompactionConfig | null {
    return this.compactionConfig;
  }

  /**
   * Prepare messages from AgentCallParameters format.
   * Handles both `prompt` (string or ModelMessage[]) and `messages` parameters.
   * Also applies micro compaction and injects nag reminder if needed.
   *
   * NOTE: This is a synchronous method. For auto-compaction (Layer 2),
   * call prepareMessagesAsync() instead which can run the LLM summarization.
   */
  prepareMessages(options: { prompt?: string | ModelMessage[]; messages?: ModelMessage[] }): ModelMessage[] {
    const { prompt, messages } = options;
    let finalMessages: ModelMessage[] = [];

    if (messages) {
      finalMessages.push(...messages);
    }

    if (prompt) {
      if (typeof prompt === "string") {
        finalMessages.push({ role: "user" as const, content: prompt });
      } else {
        finalMessages.push(...prompt);
      }
    }

    // Apply micro compaction (Layer 1) if enabled
    if (this.compactionConfig?.enabled) {
      const tokensBefore = estimateTokens(finalMessages);
      finalMessages = microCompact(finalMessages, this.compactionConfig);
      const tokensAfter = estimateTokens(finalMessages);

      if (tokensBefore !== tokensAfter) {
        this.log?.debug("agent", "Micro compaction applied", {
          tokensBefore,
          tokensAfter,
          reduction: tokensBefore - tokensAfter,
        });
      }
    }

    // Inject nag reminder if todo manager says we should
    if (this.todoManager?.shouldNag()) {
      const reminder = this.todoManager.getNagReminder();
      this.log?.todo("Injecting nag reminder", {
        roundsSinceUpdate: this.todoManager.getRoundsSinceUpdate(),
      });

      // Add reminder as a system message at the end
      finalMessages.push({
        role: "user" as const,
        content: reminder,
      });
    }

    // has compact
    const hasCompact = this.context?.getCompactStart() === -1;

    this.context?.setMessages(finalMessages);

    const currentSummary = this.context?.getCompactMessages().slice(0, this.context.getCompactSource()) || [];

    if (hasCompact) {
      this.context?.resetUsage();
      this.context?.setCompactStart(finalMessages.length - 2 > 0 ? finalMessages.length - 2 : 0);
    }

    this.context?.setCompactMessages(currentSummary.concat(finalMessages.slice(this.context.getCompactStart())));

    return this.context?.getCompactMessages() || [];
  }

  /**
   * Prepare messages with async auto-compaction support (Layer 2).
   *
   * This method should be used instead of prepareMessages() when the caller
   * can handle async operations. It will:
   * 1. Apply micro compaction (Layer 1)
   * 2. Check if auto-compaction is needed based on token threshold
   * 3. If needed, run LLM summarization and replace messages
   *
   * @param options - Prompt and messages options
   * @returns Prepared messages (possibly compacted)
   */
  async prepareMessagesAsync(options: {
    prompt?: string | ModelMessage[];
    messages?: ModelMessage[];
  }): Promise<{ messages: ModelMessage[]; compactionResult?: CompactionResult }> {
    // First apply sync preparation (micro compaction + nag reminder)
    let finalMessages = this.prepareMessages(options);

    // Check if auto-compaction (Layer 2) is needed
    if (this.shouldAutoCompact(finalMessages)) {
      this.log?.info("agent", "Auto-compaction triggered", {
        estimatedTokens: this.getCurrentTokens(finalMessages),
        threshold: this.compactionConfig?.tokenThreshold ?? 100000,
      });

      // Need model and sandbox for auto-compaction
      if (this.model && this.sandbox) {
        try {
          // Get incomplete todos to include in summary
          const incompleteTodos = this.todoManager?.getIncompleteTodos() ?? [];
          const todos = incompleteTodos.map((t) => ({
            content: t.content,
            status: t.status as "pending" | "in_progress" | "completed",
            priority: t.priority as "high" | "medium" | "low",
          }));

          const result = await autoCompact(finalMessages, this.compactionConfig ?? {}, this.model, this.sandbox, {
            todos: todos.length > 0 ? todos : undefined,
          });

          this.log?.info("agent", "Auto-compaction completed", {
            tokensBefore: result.tokensBefore,
            tokensAfter: result.tokensAfter,
            transcriptPath: result.transcriptPath,
            todosIncluded: todos.length,
          });

          // Update context with compacted messages
          finalMessages = result.messages;
          // make next loop to reset
          this.context?.setCompactStart(-1);
          // Apply the compacted messages to context
          this.context?.setCompactMessages(finalMessages);

          return { messages: finalMessages, compactionResult: result };
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.log?.error("agent", "Auto-compaction failed, continuing with original messages", error);
          // Continue with original messages if compaction fails
        }
      } else {
        this.log?.warn(
          "agent",
          "Auto-compaction needed but model/sandbox not available",
          !this.model ? { missingModel: true } : { missingSandbox: true }
        );
      }
    }

    return { messages: finalMessages };
  }

  /**
   * Check if auto compaction should be triggered.
   *
   * Uses actual token usage from AgentContext if available (more accurate),
   * otherwise falls back to character-based estimation.
   *
   * Note: Compaction now includes incomplete todos in the summary, so the agent
   * can restore them after compaction. No longer blocks on incomplete todos.
   *
   * @param messages - Optional messages to estimate if context not available
   * @returns True if tokens exceed the configured threshold
   */
  shouldAutoCompact(messages?: ModelMessage[]): boolean {
    if (!this.compactionConfig?.enabled) {
      return false;
    }

    // Log if we have incomplete todos (they'll be included in the summary)
    if (this.todoManager?.hasIncompleteTodos()) {
      this.log?.debug("agent", "Auto-compact with incomplete todos - will include in summary", {
        incompleteTodos: this.todoManager.getIncompleteTodos().length,
      });
    }

    const threshold = this.compactionConfig.tokenThreshold ?? 100000;

    // Prefer actual usage from context (accumulated inputTokens)
    if (this.context) {
      const usage = this.context.getUsage();
      // Use inputTokens as the metric - this represents the context window usage
      if (usage.inputTokens > 0) {
        return usage.inputTokens >= threshold;
      }
    }

    // Fall back to estimation if no context or no usage recorded yet
    if (messages) {
      const estimated = estimateTokens(messages);
      return estimated >= threshold;
    }

    return false;
  }

  /**
   * Check if there are incomplete todos.
   * Note: This no longer blocks compaction - todos are included in the summary.
   */
  hasIncompleteTodos(): boolean {
    return this.todoManager?.hasIncompleteTodos() ?? false;
  }

  /**
   * Get current token usage.
   *
   * Returns actual usage from context if available, otherwise estimates from messages.
   *
   * @param messages - Optional messages to estimate if context not available
   * @returns Token count (actual or estimated)
   */
  getCurrentTokens(messages?: ModelMessage[]): number {
    // Prefer actual usage from context
    if (this.context) {
      const usage = this.context.getUsage();
      if (usage.inputTokens > 0) {
        return usage.inputTokens;
      }
    }

    // Fall back to estimation
    if (messages) {
      return estimateTokens(messages);
    }

    return 0;
  }

  /**
   * Get estimated token count for messages (character-based approximation).
   */
  getEstimatedTokens(messages: ModelMessage[]): number {
    return estimateTokens(messages);
  }

  /**
   * Set up abort controller and forward external abort signal.
   */
  setupAbortController(abortSignal?: AbortSignal): void {
    this.currentAbortController = new AbortController();

    // sync status to agent instance
    this.currentAbortController.signal.addEventListener(
      "abort",
      (reason) => {
        this.status = "aborted";
        this.log?.agent("current flow is aborted", { reason });
      },
      { once: true }
    );

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
  }

  /**
   * Create onStepFinish callback that logs and updates context usage.
   * Also handles todo tracking for nag reminders.
   */
  createOnStepFinish(
    userCallback?: StreamTextOnStepFinishCallback<ToolSet> | GenerateTextOnStepFinishCallback<NoInfer<ToolSet>>
  ): StreamTextOnStepFinishCallback<ToolSet> | GenerateTextOnStepFinishCallback<NoInfer<ToolSet>> {
    return (event) => {
      const { stepNumber, toolCalls, toolResults, finishReason, usage } = event;

      this.log?.agent(`Step ${stepNumber} finished`, {
        finishReason,
        toolCallCount: toolCalls?.length ?? 0,
        toolResultCount: toolResults?.length ?? 0,
      });

      if (usage && this.context) {
        this.context.updateUsage({
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
        });
      }

      // Track todo tool usage for nag reminder
      if (this.todoManager) {
        const usedTodo = toolCalls?.some((tc) => tc.toolName === "todo") ?? false;
        if (usedTodo) {
          this.todoManager.resetRoundCounter();
          this.log?.todo("Todo tool used, reset round counter");
        } else {
          this.todoManager.incrementRound();
          this.log?.todo(`Todo not used, round ${this.todoManager.getRoundsSinceUpdate()}`);
        }
      }

      userCallback?.(event);
    };
  }

  createOnFinish(
    userCallback?: StreamTextOnFinishCallback<ToolSet> | GenerateTextOnFinishCallback<NoInfer<ToolSet>>
  ): StreamTextOnFinishCallback<ToolSet> | GenerateTextOnFinishCallback<NoInfer<ToolSet>> {
    return (event) => {
      if (this.status !== "waiting") {
        this.status = "completed";
      }

      // Log summary of finish event (not the full event which can be huge)
      this.log?.agent("Agent response finished", {
        finishReason: event.finishReason,
        totalSteps: event.steps?.length ?? 0,
        usage: event.usage,
      });

      this.context?.updateFinal?.(event);

      userCallback?.(event);
    };
  }

  /**
   * Check if an error is an abort error
   */
  isAbortError(err: unknown): boolean {
    if (err instanceof Error) {
      return err.name === "AbortError" || err.message.includes("aborted");
    }
    return false;
  }

  /**
   * Abort the current run
   */
  abort(reason?: string): void {
    this.log?.info("agent", "Aborting agent", { reason: reason ?? "(no reason)" });
    if (this.currentAbortController) {
      this.currentAbortController.abort(reason);
    }
  }

  /**
   * Check if a tool needs approval
   */
  isToolNeedsApproval(toolName: string): boolean {
    const tools = this.getTools();
    const tool = tools[toolName];

    return tool ? tool.needsApproval === true : false;
  }

  /**
   * Reset agent state
   */
  reset(): void {
    const prevStatus = this.status;
    this.log?.info("agent", "Resetting agent", {
      previousStatus: prevStatus,
      hadTodos: this.todoManager?.hasTodos() ?? false,
    });
    this.abort("Reset");
    this.status = "idle";
    this.error = "";
    this.log?.clear();
    this.context?.reset();
    this.todoManager?.reset();
  }
}
