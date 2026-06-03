import { generateText } from "ai";

import { autoCompact, createCompactedMessages } from "../compaction/auto-compact.js";
import { microCompact } from "../compaction/micro-compact.js";
import { isPromptTooLongError, reactiveCompact } from "../compaction/reactive-compact.js";
import { estimateTokens } from "../compaction/token-estimator.js";
import { extractMemories, consolidateMemories } from "../memory/memory-extractor.js";
import { cleanupOrphanedToolCache, createTodoTool } from "../tools";

import type { Sandbox } from "../../environment";
import type { AgentContext } from "../agent-context";
import type { AgentLog } from "../agent-log";
import type { CompactionConfig } from "../compaction/types.js";
import type { McpManager } from "../mcp/manager.js";
import type { MemoryManager } from "../memory/memory-manager.js";
import type { SessionStore } from "../session/session-store.js";
import type { SessionData } from "../session/types.js";
import type { SkillRegistry } from "../skills";
import type { TodoManager } from "../todo-manager";
import type { AgentStatus } from "./types.js";
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

export type { AgentStatus, AgentRunOptions } from "./types.js";

export class Base {
  // Identity - subclasses should set this
  protected agentId: string = "";

  // State
  status: AgentStatus = "idle";
  error = "";

  // Resources
  systemPrompt = "";
  log: AgentLog | null = null;
  context: AgentContext | null = null;
  sandbox: Sandbox | null = null;
  todoManager: TodoManager | null = null;
  mcpManager: McpManager | null = null;
  skillRegister: SkillRegistry | null = null;
  compactionConfig: CompactionConfig | null = null;
  sessionStore: SessionStore | null = null;
  sessionData: SessionData | null = null;
  sessionConfig: { provider: string; model: string } | null = null;
  customTools: ToolSet = {};
  builtInTools: ToolSet = {};

  // Model (Vercel AI SDK LanguageModel)
  model: LanguageModel | null = null;

  // Reactive compact retry counter (reset per run)
  private reactiveCompactRetries = 0;
  private static readonly MAX_REACTIVE_RETRIES = 1;

  // Abort controller for current run
  currentAbortController: AbortController | null = null;

  cancelAbortController: () => void = () => {};

  pendingAbortControllers: AbortController[] = [];

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

  // Agent documentation content (loaded from AGENTS.md / CLAUDE.md)
  agentDocContent: string = "";
  agentDocSource: string = "";

  /** Set agent documentation content (loaded from AGENTS.md / CLAUDE.md). */
  setAgentDocContent(content: string, source?: string): void {
    this.agentDocContent = content;
    this.agentDocSource = source ?? "";
    this.log?.info("system", `Agent doc content set`, { source: source ?? "(none)", length: content.length });
  }

  /**
   * Get agent documentation content
   */
  getAgentDocContent(): string {
    return this.agentDocContent;
  }

  /**
   * Get agent documentation source filename
   */
  getAgentDocSource(): string {
    return this.agentDocSource;
  }

  setSkillRegister(t: SkillRegistry) {
    if (this.skillRegister) return;

    this.skillRegister = t;
  }

  getSkillRegister() {
    return this.skillRegister;
  }

  // Memory system
  memoryManager: MemoryManager | null = null;
  memoryContent: string = "";

  setMemoryManager(m: MemoryManager): void {
    this.memoryManager = m;
  }

  getMemoryManager(): MemoryManager | null {
    return this.memoryManager;
  }

  /**
   * Set cached memory index content (for synchronous access in buildSystemPrompt).
   */
  setMemoryContent(content: string): void {
    this.memoryContent = content;
  }

  /**
   * Get cached memory index content.
   */
  getMemoryContent(): string {
    return this.memoryContent;
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

  /** Lazily create a session on first use. */
  private ensureSession(): void {
    if (this.sessionData || !this.sessionStore || !this.sessionConfig) return;
    const session = this.sessionStore.create({
      provider: this.sessionConfig.provider,
      model: this.sessionConfig.model,
    });
    this.sessionData = session;
  }

  /** Generate a concise session title from the first user message using LLM. */
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

  /** Update stored UIMessages from the client. */
  updateSessionUIMessages(uiMessages: UIMessage[]): void {
    if (!this.sessionStore) return;
    if (!this.sessionData) {
      this.ensureSession();
      this.updateSessionUIMessages(uiMessages);
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
   * Prepare messages from prompt/messages parameters.
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

    return finalMessages;
  }

  /**
   * Check if auto compaction should be triggered.
   * Uses actual token usage from AgentContext if available, falls back to estimation.
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

  /** Check if there are incomplete todos. */
  hasIncompleteTodos(): boolean {
    return this.todoManager?.hasIncompleteTodos() ?? false;
  }

  /** Get current token usage (actual from context, or estimated from messages). */
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

  /** Get estimated token count for messages. */
  getEstimatedTokens(messages: ModelMessage[]): number {
    return estimateTokens(messages);
  }

  /** Set up abort controller and forward external abort signal. */
  setupAbortController(abortSignal?: AbortSignal): void {
    this.cancelAbortController();

    this.currentAbortController = new AbortController();

    const abortListener = (reason: Event) => {
      this.status = "aborted";
      this.log?.agent("current flow is aborted", { reason });
    };

    // sync status to agent instance
    this.currentAbortController.signal.addEventListener("abort", abortListener, { once: true });

    this.cancelAbortController = () => this.currentAbortController?.signal.removeEventListener("abort", abortListener);

    if (abortSignal) {
      if (abortSignal.aborted) {
        let item = this.pendingAbortControllers.pop();
        while (item) {
          item.abort(abortSignal.reason);
          item = this.pendingAbortControllers.pop();
        }
        setTimeout(() => this.currentAbortController?.abort(abortSignal.reason));
      } else {
        const abortListener = (reason: Event) => {
          let item = this.pendingAbortControllers.pop();
          while (item) {
            item.abort(reason);
            item = this.pendingAbortControllers.pop();
          }
          setTimeout(() => this.currentAbortController?.abort(reason));
        };
        abortSignal.addEventListener("abort", abortListener);
      }
    }
  }

  createPrepareStep(userCallback?: PrepareStepFunction) {
    return (async (options) => {
      const res = userCallback ? await userCallback(options) : options;

      const finalMessages = res?.messages || [];

      // Apply micro compaction (Layer 1) — mutates in place
      microCompact(finalMessages, this.compactionConfig || {});

      this.context?.setMessages(finalMessages);

      let llmMessages = this.context?.getMessagesForLLM() || [];

      // Auto-compaction: when threshold is exceeded, run compaction directly
      // and update summaryMessage + compactIndex
      if (this.shouldAutoCompact(llmMessages) && this.model && this.sandbox && this.context) {
        try {
          this.status = "compacting";
          this.log?.notify("system", "info", "Auto-compacting context...");

          const incompleteTodos = this.todoManager?.getIncompleteTodos() ?? [];
          const todos = incompleteTodos.map((t) => ({
            content: t.content,
            status: t.status as "pending" | "in_progress" | "completed",
            priority: t.priority as "high" | "medium" | "low",
          }));

          const actualTokens = this.context.getUsage().inputTokens ?? 0;
          const result = await autoCompact(llmMessages, this.compactionConfig ?? {}, this.agentId, this.sandbox, {
            todos: todos.length > 0 ? todos : undefined,
            actualTokens: actualTokens || undefined,
          });

          const beforeLength = llmMessages.length;

          if (result.compacted && result.summary && result.cutIndex != null) {
            const summaryMsg = createCompactedMessages(result.summary)[0];
            this.context.setSummaryMessage(summaryMsg);
            const absoluteCut = this.context.getCompactIndex() + result.cutIndex;
            this.context.setCompactIndex(absoluteCut);
            this.context.resetUsage();

            this.context.clearTools();

            // Clean up cached tool output files for orphaned messages
            if (this.sandbox) {
              const allMessages = this.context.getMessages();
              cleanupOrphanedToolCache(this.sandbox, allMessages, absoluteCut).catch((err) => {
                this.log?.warn("agent", "Failed to cleanup tool cache", err);
              });
            }

            llmMessages = this.context.getMessagesForLLM();
          }

          this.log?.info("agent", "Auto-compaction completed", {
            compacted: result.compacted,
            summary: result.summary,
            tokensBefore: result.tokensBefore,
            tokensAfter: result.tokensAfter,
            cutIndex: result.cutIndex,
            beforeMessageCount: beforeLength,
            messageCount: llmMessages.length,
          });

          if (result.compacted) {
            this.log?.notify("system", "success", "Context compacted", {
              tokensBefore: result.tokensBefore,
              tokensAfter: result.tokensAfter,
            });
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.log?.error("agent", "Auto-compaction failed, continuing with original messages", error);
          this.log?.notify("system", "warning", `Compaction failed: ${error.message}`);
        } finally {
          this.status = "running";
        }
      }

      return { ...res, messages: llmMessages };
    }) as PrepareStepFunction;
  }

  addPendingAbortController(abortController: AbortController): void {
    this.pendingAbortControllers.push(abortController);
  }

  removePendingAbortController(abortController: AbortController): void {
    this.pendingAbortControllers = this.pendingAbortControllers.filter((ac) => ac !== abortController);
  }

  /** Create onStepFinish callback that logs and updates context usage. */
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

      // Release stream events accumulated during this turn (consumed in real-time by listeners)
      this.context?.clearEvents();

      // Auto-save session after each interaction
      this.saveSession();

      // Background memory extraction (fire-and-forget)
      this.runMemoryExtraction();

      userCallback?.(event);
    };
  }

  /** Persist the current session state to disk (server-side data only). */
  private saveSession(): void {
    if (!this.sessionStore || !this.context) return;
    if (!this.sessionData) {
      this.ensureSession();
      this.saveSession();
      return;
    }

    const messages = this.context.getMessages();

    this.sessionData.summaryMessage = this.context.getSummaryMessage();
    this.sessionData.compactIndex = this.context.getCompactIndex();
    this.sessionData.usage = this.context.getUsage();

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
   * Run background memory extraction after each turn.
   * Fire-and-forget: errors are logged but never block the agent.
   */
  private runMemoryExtraction(): void {
    if (!this.memoryManager || !this.context) return;

    const messages = this.context.getMessages();
    if (messages.length < 15) return;

    const manager = this.memoryManager;
    const agentId = this.agentId;
    const log = this.log;

    this.log?.notify("memory", "info", "Extracting memories...");

    (async () => {
      try {
        const count = await extractMemories(messages, manager, agentId);
        if (count > 0) {
          log?.info("memory", `Extracted ${count} new memories`);
          this.memoryContent = manager.getIndexContent();
          this.log?.notify("memory", "success", `Extracted ${count} new memories`, { count });
        }

        // Check if consolidation is needed
        const memoryCount = await manager.getMemoryCount();
        if (memoryCount >= manager.getConsolidateThreshold()) {
          this.log?.notify("memory", "info", "Consolidating memories...");
          const after = await consolidateMemories(manager, agentId);
          if (after > 0) {
            log?.info("memory", `Consolidated memories: ${memoryCount} → ${after}`);
            this.memoryContent = manager.getIndexContent();
            this.log?.notify("memory", "success", `Consolidated memories: ${memoryCount} → ${after}`, {
              before: memoryCount,
              after,
            });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log?.warn("memory", "Memory extraction failed", { error: errorMsg });
        this.log?.notify("memory", "warning", `Memory extraction failed: ${errorMsg}`);
      }
    })();
  }

  /**
   * Handle prompt_too_long errors by running emergency reactive compaction.
   * Returns true if compaction succeeded and caller should retry.
   */
  async handleReactiveCompact(error: unknown): Promise<boolean> {
    if (!isPromptTooLongError(error)) return false;
    if (this.reactiveCompactRetries >= Base.MAX_REACTIVE_RETRIES) {
      this.log?.error("agent", "Reactive compact: max retries exceeded, giving up");
      return false;
    }
    if (!this.context) return false;

    this.reactiveCompactRetries++;
    this.log?.info("agent", "Reactive compact triggered", {
      retry: this.reactiveCompactRetries,
      maxRetries: Base.MAX_REACTIVE_RETRIES,
    });

    try {
      this.status = "compacting";

      const llmMessages = this.context.getMessagesForLLM();
      const compactedMessages = await reactiveCompact(llmMessages, this.agentId);

      // The first message is the summary, rest are tail messages.
      // Update context: set summary as first message, reset compact index to
      // cover all original messages, and replace with compacted result.
      const summaryMsg = compactedMessages[0];
      if (summaryMsg) {
        this.context.setSummaryMessage(summaryMsg);
        const oldCompactIndex = this.context.getCompactIndex();
        const newCompactIndex = this.context.getMessages().length;
        this.context.setCompactIndex(newCompactIndex);

        // Clean up cached tool output files for orphaned messages
        if (this.sandbox && newCompactIndex > oldCompactIndex) {
          const allMessages = this.context.getMessages();
          cleanupOrphanedToolCache(this.sandbox, allMessages, newCompactIndex).catch((err) => {
            this.log?.warn("agent", "Failed to cleanup tool cache after reactive compact", err);
          });
        }
        // Append tail messages (everything after summary) as new messages
        const tailMessages = compactedMessages.slice(1);
        if (tailMessages.length > 0) {
          const allMessages = [...this.context.getMessages(), ...tailMessages];
          this.context.setMessages(allMessages);
          // Adjust compact index so tail messages are visible
          this.context.setCompactIndex(allMessages.length - tailMessages.length);
        }
      }
      this.context.resetUsage();
      this.context.clearTools();

      this.log?.info("agent", "Reactive compact completed", {
        originalMessages: llmMessages.length,
        compactedMessages: compactedMessages.length,
      });

      return true;
    } catch (err) {
      const compactError = err instanceof Error ? err : new Error(String(err));
      this.log?.error("agent", "Reactive compact failed", compactError);
      return false;
    } finally {
      this.status = "running";
    }
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

  /** Reset the reactive compact retry counter. */
  resetReactiveCompactRetries(): void {
    this.reactiveCompactRetries = 0;
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
    this.reactiveCompactRetries = 0;
    this.log?.clear();
    this.context?.reset();
    this.todoManager?.reset();
  }
}
