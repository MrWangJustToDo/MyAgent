import { microCompact } from "../compaction/micro-compact.js";
import { estimateTokens } from "../compaction/token-estimator.js";
import { createTodoTool } from "../tools";

import type { Sandbox } from "../../environment";
import type { AgentContext } from "../agent-context";
import type { AgentLog } from "../agent-log";
import type { CompactionConfig } from "../compaction/types.js";
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
      this.log?.info("todo", "Injecting nag reminder", {
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
      this.context?.setCompactStart(finalMessages.length - 2 > 0 ? finalMessages.length - 2 : 0);
    }

    this.context?.setCompactMessages(currentSummary.concat(finalMessages.slice(this.context.getCompactStart())));

    return this.context?.getCompactMessages() || [];
  }

  /**
   * Check if auto compaction should be triggered.
   *
   * Uses actual token usage from AgentContext if available (more accurate),
   * otherwise falls back to character-based estimation.
   *
   * **Important**: Will NOT trigger if there are incomplete todos, as we need
   * to preserve that context for task completion.
   *
   * @param messages - Optional messages to estimate if context not available
   * @returns True if tokens exceed the configured threshold and no incomplete todos
   */
  shouldAutoCompact(messages?: ModelMessage[]): boolean {
    if (!this.compactionConfig?.enabled) {
      return false;
    }

    // Don't auto-compact if there are incomplete todos
    // We need to preserve context for task completion
    if (this.todoManager?.hasIncompleteTodos()) {
      this.log?.debug("agent", "Skipping auto-compact: incomplete todos exist", {
        incompleteTodos: this.todoManager.getIncompleteTodos().length,
      });
      return false;
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
   * Check if compaction is blocked due to incomplete todos.
   */
  isCompactionBlocked(): boolean {
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
          this.log?.debug("todo", "Todo tool used, reset round counter");
        } else {
          this.todoManager.incrementRound();
          this.log?.debug("todo", `Todo not used, round ${this.todoManager.getRoundsSinceUpdate()}`);
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

      this.log?.agent(`agent response finish`, event);

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
    this.abort("Reset");
    this.status = "idle";
    this.error = "";
    this.log?.clear();
    this.context?.reset();
    this.todoManager?.reset();
  }
}
