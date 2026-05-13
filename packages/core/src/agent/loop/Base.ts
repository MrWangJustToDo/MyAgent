import { generateText } from "ai";

import { autoCompact } from "../compaction/auto-compact.js";
import { microCompact } from "../compaction/micro-compact.js";
import { estimateTokens } from "../compaction/token-estimator.js";
import { createTodoTool } from "../tools";

import type { Sandbox } from "../../environment";
import type { AgentContext } from "../agent-context";
import type { AgentLog } from "../agent-log";
import type { CompactionConfig } from "../compaction/types.js";
import type { McpManager } from "../mcp/manager.js";
import type { SessionStore } from "../session/session-store.js";
import type { SessionData } from "../session/types.js";
import type { SkillRegistry } from "../skills";
import type { TodoManager } from "../todo-manager";
import type {
  ToolSet,
  LanguageModel,
  ModelMessage,
  UIMessage,
  StreamTextOnStepFinishCallback,
  GenerateTextOnStepFinishCallback,
  StreamTextOnFinishCallback,
  GenerateTextOnFinishCallback,
  PrepareStepFunction,
} from "ai";

export type AgentStatus = "idle" | "running" | "completed" | "error" | "aborted" | "waiting" | "compacting";

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
  // Identity - subclasses should set this
  protected agentId: string = "";

  // State
  status: AgentStatus = "idle";
  error = "";

  // Resources
  log: AgentLog | null = null;
  context: AgentContext | null = null;
  sandbox: Sandbox | null = null;
  todoManager: TodoManager | null = null;
  mcpManager: McpManager | null = null;
  skillRegister: SkillRegistry | null = null;
  compactionConfig: CompactionConfig | null = null;
  sessionStore: SessionStore | null = null;
  sessionData: SessionData | null = null;
  private sessionConfig: { provider: string; model: string } | null = null;
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
    if (this.compactionConfig) {
      c.setTokenLimit(this.compactionConfig.tokenThreshold);
    }
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

  setMcpManager(m: McpManager) {
    if (this.mcpManager) return;

    this.mcpManager = m;
  }

  getMcpManager() {
    return this.mcpManager;
  }

  setSessionStore(store: SessionStore, config: { provider: string; model: string }): void {
    this.sessionStore = store;
    this.sessionConfig = config;
  }

  getSessionStore(): SessionStore | null {
    return this.sessionStore;
  }

  setSessionData(data: SessionData): void {
    this.sessionData = data;
  }

  getSessionData(): SessionData | null {
    return this.sessionData;
  }

  /**
   * Lazily create a session on first use (when user sends first message).
   */
  private async ensureSession(): Promise<void> {
    if (this.sessionData || !this.sessionStore || !this.sessionConfig) return;
    const session = await this.sessionStore.create({
      provider: this.sessionConfig.provider,
      model: this.sessionConfig.model,
    });
    this.sessionData = session;
  }

  /**
   * Generate a concise session title from the first user message using LLM.
   */
  private async generateSessionTitle(userMessage: string): Promise<string> {
    if (!this.model) return userMessage.slice(0, 50);
    try {
      const { text } = await generateText({
        model: this.model,
        maxOutputTokens: 30,
        system:
          "Generate a concise title (3-8 words) for a conversation that starts with the following message. Return ONLY the title, no quotes or punctuation.",
        prompt: userMessage.slice(0, 500),
      });
      return text.trim().slice(0, 80) || userMessage.slice(0, 50);
    } catch {
      return userMessage.slice(0, 50);
    }
  }

  /**
   * Update stored UIMessages from the client.
   * Called by CLI/extension after each interaction to persist the authoritative UI state.
   */
  updateSessionUIMessages(uiMessages: UIMessage[]): void {
    if (!this.sessionStore) return;
    if (!this.sessionData) {
      this.ensureSession().then(() => this.updateSessionUIMessages(uiMessages));
      return;
    }
    this.sessionData.uiMessages = uiMessages;
    this.sessionStore.save(this.sessionData).catch((err) => {
      this.log?.warn("agent", "Failed to save session UIMessages", err);
    });
  }

  /**
   * Set compaction configuration
   */
  setCompactionConfig(config: CompactionConfig): void {
    this.log?.debug("agent", "Setting compaction config", {
      tokenThreshold: config.tokenThreshold,
      keepRecentToolResults: config.keepRecentToolResults,
    });
    this.compactionConfig = config;
    this.context?.setTokenLimit(config.tokenThreshold);
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
    const finalMessages: ModelMessage[] = [];

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

    // Inject nag reminder following Claude Code's pattern:
    // - If last message is a tool message, append reminder into its content array
    //   (same-turn delivery, keeps history immutable, doesn't break tool flow)
    // - Otherwise, add as a standalone user message
    if (this.todoManager?.shouldNag()) {
      const reminder = this.todoManager.getNagReminder();
      this.log?.todo("Injecting nag reminder", {
        roundsSinceUpdate: this.todoManager.getRoundsSinceUpdate(),
      });

      const lastMsg = finalMessages[finalMessages.length - 1];
      if (lastMsg?.role === "tool" && Array.isArray(lastMsg.content)) {
        lastMsg.content.push({ type: "text", text: reminder } as never);
      } else if (lastMsg?.role !== "tool") {
        finalMessages.push({ role: "user" as const, content: reminder });
      }
    }

    return finalMessages;
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
    const tokenThreshold = this.compactionConfig?.tokenThreshold ?? 100000;
    const compactAtPercent = this.compactionConfig?.compactAtPercent ?? 85;
    const triggerAt = Math.floor(tokenThreshold * (compactAtPercent / 100));

    // Prefer actual usage from context (accumulated inputTokens)
    if (this.context) {
      const usage = this.context.getUsage();
      if (usage.inputTokens > 0) {
        return usage.inputTokens >= triggerAt;
      }
    }

    // Fall back to estimation if no context or no usage recorded yet
    if (messages) {
      const estimated = estimateTokens(messages);
      return estimated >= triggerAt;
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

  createPrepareStep(userCallback?: PrepareStepFunction) {
    return (async (options) => {
      const res = userCallback ? await userCallback(options) : options;

      const contextMessage = Array.from(this.context?.getMessages() || []);

      let finalMessages = res?.messages || [];

      const beforeLength = contextMessage.length;

      const afterLength = finalMessages.length;

      const pendingAppend = afterLength - beforeLength;

      // Apply micro compaction (Layer 1) if enabled
      const tokensBefore = estimateTokens(finalMessages);

      finalMessages = microCompact(finalMessages, this.compactionConfig || {});

      const tokensAfter = estimateTokens(finalMessages);

      if (tokensBefore !== tokensAfter) {
        this.log?.debug("agent", "Micro compaction applied", {
          tokensBefore,
          tokensAfter,
          reduction: tokensBefore - tokensAfter,
        });
      }

      this.context?.setMessages(finalMessages);

      // append latest message
      for (let i = 0; i < pendingAppend; i++) {
        this.context?.addCompactMessage(finalMessages[beforeLength + i]);
      }

      const fullMessages = this.context?.getMessages() || [];

      finalMessages = this.context?.getCompactMessages() || [];

      const finalMessagesLength = finalMessages.length;

      const fullMessagesLength = fullMessages.length;

      // align the compact message item, the modelMessage item may change after convert from ui;
      for (let i = 0; i < finalMessagesLength - 1; i++) {
        const compactMessageItem = finalMessages[finalMessagesLength - i - 1];
        const modelMessageItem = fullMessages[fullMessagesLength - i - 1];
        if (
          compactMessageItem.role !== modelMessageItem.role ||
          compactMessageItem.content.length !== modelMessageItem.content.length
        ) {
          this.context?.setCompactMessage(modelMessageItem, finalMessagesLength - i - 1);
        }
      }

      // this.context?.processCompactMessage();

      finalMessages = this.context?.getCompactMessages() || [];

      // Check if auto-compaction (Layer 2) is needed
      if (this.shouldAutoCompact(finalMessages)) {
        this.log?.info("agent", "Auto-compaction triggered", {
          usage: this.context?.getUsage(),
          estimatedTokens: tokensAfter,
          threshold: this.compactionConfig?.tokenThreshold ?? 100000,
          incompleteTodos: this.todoManager?.getIncompleteTodos().length,
        });

        // Need model and sandbox for auto-compaction
        if (this.model && this.sandbox) {
          try {
            this.status = "compacting";
            // Get incomplete todos to include in summary
            const incompleteTodos = this.todoManager?.getIncompleteTodos() ?? [];
            const todos = incompleteTodos.map((t) => ({
              content: t.content,
              status: t.status as "pending" | "in_progress" | "completed",
              priority: t.priority as "high" | "medium" | "low",
            }));

            const actualTokens = this.context?.getUsage().inputTokens ?? 0;
            const result = await autoCompact(finalMessages, this.compactionConfig ?? {}, this.agentId, this.sandbox, {
              todos: todos.length > 0 ? todos : undefined,
              actualTokens: actualTokens || undefined,
            });

            this.log?.info("agent", "Auto-compaction completed", {
              compacted: result.compacted,
              tokensBefore: result.tokensBefore,
              tokensAfter: result.tokensAfter,
              todosIncluded: todos.length,
            });

            if (result.compacted) {
              // Apply the compacted messages to context
              this.context?.setCompactMessages(result.messages);

              this.context?.resetUsage();
            }
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.log?.error("agent", "Auto-compaction failed, continuing with original messages", error);
            // Continue with original messages if compaction fails
          } finally {
            this.status = "running";
          }

          return { ...res, messages: this.context?.getCompactMessages() };
        } else {
          this.log?.warn(
            "agent",
            "Auto-compaction needed but model/sandbox not available",
            !this.model ? { missingModel: true } : { missingSandbox: true }
          );
        }
      } else {
        this.log?.agent("skip auto compaction because the tokens are not exceeded the threshold", {
          usage: this.context?.getUsage(),
          threshold: this.compactionConfig?.tokenThreshold ?? 100000,
          incompleteTodos: this.todoManager?.getIncompleteTodos().length,
        });
      }

      return { ...res, messages: this.context?.getCompactMessages() };
    }) as PrepareStepFunction;
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

      if (this.error) {
        this.status = "error";
      }

      // Log summary of finish event (not the full event which can be huge)
      this.log?.agent("Agent response finished", {
        finishReason: event.finishReason,
        totalSteps: event.steps?.length ?? 0,
        usage: event.usage,
      });

      this.context?.updateFinal?.(event);

      // Auto-save session after each interaction
      this.saveSession();

      userCallback?.(event);
    };
  }

  /**
   * Persist the current session state to disk (server-side data only).
   * UIMessages are stored separately when pushed from the client.
   */
  private saveSession(): void {
    if (!this.sessionStore || !this.context) return;
    if (!this.sessionData) {
      this.ensureSession().then(() => this.saveSession());
      return;
    }

    const messages = this.context.getMessages();
    const compactMessages = this.context.getCompactMessages();

    this.sessionData.compactMessages = compactMessages;
    this.sessionData.usage = this.context.getUsage();
    this.sessionData.messageLength = messages.length;

    if (this.todoManager) {
      this.sessionData.todos = this.todoManager.getItems();
    }

    // Auto-generate session title from first user message
    if (this.sessionData.name === "New Session") {
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser) {
        const text =
          typeof firstUser.content === "string"
            ? firstUser.content
            : Array.isArray(firstUser.content)
              ? firstUser.content.find((p) => p.type === "text")?.text || ""
              : "";
        if (typeof text === "string" && text.length > 0) {
          this.generateSessionTitle(text as string).then((title) => {
            if (this.sessionData && this.sessionStore) {
              this.sessionData.name = title;
              this.sessionStore.save(this.sessionData).catch(() => {});
            }
          });
        }
      }
    }

    // Fire and forget — don't block the agent on session save
    this.sessionStore.save(this.sessionData).catch((err) => {
      this.log?.warn("agent", "Failed to save session", err);
    });
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
