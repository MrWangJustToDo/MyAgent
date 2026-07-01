import { extractTokenUsage } from "../agent-context/types.js";
import { applyCompactionResult, autoCompact } from "../compaction";
import { microCompact } from "../compaction/micro-compact.js";
import { isPromptTooLongError, reactiveCompact } from "../compaction/reactive-compact.js";
import { estimateTokens } from "../compaction/token-estimator.js";
import { cleanupOrphanedToolCache, createTodoTool } from "../tools";

import { SessionHandler } from "./session-handler.js";

import type { AgentEvent } from "../../managers/agent-event-bus.js";
import type { ModelInfo } from "../../models/types.js";
import type { AgentContext } from "../agent-context";
import type { AgentLog } from "../agent-log";
import type { CompactionConfig } from "../compaction/types.js";
import type { HookRegistry } from "../hooks/hook-registry.js";
import type { McpManager } from "../mcp/manager.js";
import type { SkillRegistry } from "../skills";
import type { TodoManager } from "../todo-manager";
import type { AgentStatus } from "./types.js";
import type {
  LanguageModel,
  ToolSet,
  ModelMessage,
  GenerateTextOnStepEndCallback,
  GenerateTextOnEndCallback,
  PrepareStepFunction,
} from "ai";

// ============================================================================
// Base Class
// ============================================================================

export class Base extends SessionHandler {
  // State
  status: AgentStatus = "idle";
  error = "";

  // Run timing (all execution goes through stream())
  streamStartedAt = 0;
  lastStreamDurationMs = 0;

  // Resources
  systemPrompt = "";
  mcpManager: McpManager | null = null;
  skillRegister: SkillRegistry | null = null;
  compactionConfig: CompactionConfig | null = null;
  customTools: ToolSet = {};
  builtInTools: ToolSet = {};

  // Hook system
  hookRegistry: HookRegistry | null = null;

  /** Unified event dispatch callback — set by AgentManager to route events to listeners + hooks */
  dispatchEvent?: (event: AgentEvent) => void;

  // Model metadata from the registry (context window, pricing, capabilities, etc.)
  modelInfo: ModelInfo | null = null;

  // Reactive compact retry counter (reset per run)
  private reactiveCompactRetries = 0;
  private static readonly MAX_REACTIVE_RETRIES = 1;

  // Session-level cache hit tracking (accumulated across all API calls)
  private sessionCacheHitTokens = 0;
  private sessionCacheMissTokens = 0;

  // Abort controller for current run
  currentAbortController: AbortController | null = null;
  cancelAbortController: () => void = () => {};
  pendingAbortControllers: AbortController[] = [];

  // ============================================================================
  // Resource Management
  // ============================================================================

  /** Set the Vercel AI SDK LanguageModel */
  setModel(model: LanguageModel): void {
    this.log?.debug("agent", "Setting model", { hadPreviousModel: !!this.model });
    this.model = model;
  }

  /** Get the current model */
  getModel(): LanguageModel | null {
    return this.model;
  }

  /**
   * Set model metadata from the registry.
   * Used for context-window-aware compaction, default maxTokens, cost tracking, etc.
   */
  setModelInfo(info: ModelInfo): void {
    this.log?.debug("agent", "Setting model info", {
      id: info.id,
      provider: info.provider,
      contextWindow: info.contextWindow,
    });
    this.modelInfo = info;
  }

  getModelInfo(): ModelInfo | null {
    return this.modelInfo;
  }

  setTools(tools: ToolSet): void {
    this.builtInTools = tools;
  }

  addTools(tools: ToolSet): void {
    this.customTools = { ...this.customTools, ...tools };
  }

  getTools(): ToolSet {
    return { ...this.builtInTools, ...this.customTools };
  }

  setLog(c: AgentLog): void {
    this.log = c;
  }

  getLog(): AgentLog | null {
    return this.log;
  }

  setContext(c: AgentContext): void {
    this.context = c;
    if (this.compactionConfig) {
      c.setTokenLimit(this.compactionConfig.tokenThreshold);
    }
  }

  getContext(): AgentContext | null {
    return this.context;
  }

  setTodoManager(t: TodoManager): void {
    if (this.todoManager) return;
    this.todoManager = t;
    this.addTools({ todo: createTodoTool({ todoManager: t }) });
  }

  getTodoManager(): TodoManager | null {
    return this.todoManager;
  }

  /**
   * Override point for subclasses to provide dynamic per-turn context.
   * Injected into messages (not system prompt) to preserve cache stability.
   */
  getDynamicTurnContext?(): string | undefined;

  // Agent documentation content (loaded from AGENTS.md / CLAUDE.md)
  agentDocContent: string = "";
  agentDocSource: string = "";

  setAgentDocContent(content: string, source?: string): void {
    this.agentDocContent = content;
    this.agentDocSource = source ?? "";
    this.log?.info("system", `Agent doc content set`, { source: source ?? "(none)", length: content.length });
  }

  getAgentDocContent(): string {
    return this.agentDocContent;
  }

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

  setMcpManager(m: McpManager) {
    if (this.mcpManager) return;
    this.mcpManager = m;
  }

  getMcpManager() {
    return this.mcpManager;
  }

  setCompactionConfig(config: CompactionConfig): void {
    this.log?.debug("agent", "Setting compaction config", {
      tokenThreshold: config.tokenThreshold,
      keepRecentToolResults: config.keepRecentToolResults,
    });
    this.compactionConfig = config;
    this.context?.setTokenLimit(config.tokenThreshold);
  }

  getCompactionConfig(): CompactionConfig | null {
    return this.compactionConfig;
  }

  // ============================================================================
  // Message Preparation & Token Helpers
  // ============================================================================

  prepareMessages(options: { prompt?: string | ModelMessage[]; messages?: ModelMessage[] }): ModelMessage[] {
    const { prompt, messages } = options;
    const finalMessages: ModelMessage[] = [];
    if (messages) finalMessages.push(...messages);
    if (prompt) {
      if (typeof prompt === "string") {
        finalMessages.push({ role: "user" as const, content: prompt });
      } else {
        finalMessages.push(...prompt);
      }
    }
    return finalMessages;
  }

  shouldAutoCompact(messages?: ModelMessage[]): boolean {
    const tokenThreshold = this.compactionConfig?.tokenThreshold ?? 100000;
    const compactAtPercent = this.compactionConfig?.compactAtPercent ?? 80;
    const triggerAt = Math.floor(tokenThreshold * (compactAtPercent / 100));

    if (this.context) {
      const usage = this.context.getUsage();
      if (usage.inputTokens > 0) return usage.inputTokens >= triggerAt;
    }
    if (messages) return estimateTokens(messages) >= triggerAt;
    return false;
  }

  hasIncompleteTodos(): boolean {
    return this.todoManager?.hasIncompleteTodos() ?? false;
  }

  getCurrentTokens(messages?: ModelMessage[]): number {
    if (this.context) {
      const usage = this.context.getUsage();
      if (usage.inputTokens > 0) return usage.inputTokens;
    }
    if (messages) return estimateTokens(messages);
    return 0;
  }

  getEstimatedTokens(messages: ModelMessage[]): number {
    return estimateTokens(messages);
  }

  // ============================================================================
  // Abort Handling
  // ============================================================================

  setupAbortController(abortSignal?: AbortSignal): void {
    this.cancelAbortController();
    this.currentAbortController = new AbortController();

    const abortListener = (reason: Event) => {
      this.status = "aborted";
      this.log?.agent("current flow is aborted", { reason });
    };
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
        const listener = (reason: Event) => {
          let item = this.pendingAbortControllers.pop();
          while (item) {
            item.abort(reason);
            item = this.pendingAbortControllers.pop();
          }
          setTimeout(() => this.currentAbortController?.abort(reason));
        };
        abortSignal.addEventListener("abort", listener);
      }
    }
  }

  addPendingAbortController(abortController: AbortController): void {
    this.pendingAbortControllers.push(abortController);
  }

  removePendingAbortController(abortController: AbortController): void {
    this.pendingAbortControllers = this.pendingAbortControllers.filter((ac) => ac !== abortController);
  }

  abort(reason?: string): void {
    this.log?.info("agent", "Aborting agent", { reason: reason ?? "(no reason)" });
    if (this.currentAbortController) this.currentAbortController.abort(reason);
  }

  isAbortError(err: unknown): boolean {
    if (err instanceof Error) return err.name === "AbortError" || err.message.includes("aborted");
    return false;
  }

  isToolNeedsApproval(toolName: string): boolean {
    const tools = this.getTools();
    const tool = tools[toolName];
    return tool ? tool.needsApproval === true : false;
  }

  resetReactiveCompactRetries(): void {
    this.reactiveCompactRetries = 0;
  }

  // ============================================================================
  // Lifecycle Callbacks
  // ============================================================================

  createOnStepFinish(userCallback?: GenerateTextOnStepEndCallback<ToolSet>): GenerateTextOnStepEndCallback<ToolSet> {
    return (event) => {
      const { stepNumber, toolCalls, toolResults, finishReason, usage } = event;

      this.log?.agent(`Step ${stepNumber} finished`, {
        finishReason,
        toolCallCount: toolCalls?.length ?? 0,
        toolResultCount: toolResults?.length ?? 0,
      });

      // After first step succeeds, confirm surfaced memories so they won't be re-selected
      if (stepNumber === 1) {
        this.commitSurfacedMemories();
      }

      if (usage && this.context) {
        const tokenUsage = extractTokenUsage(usage);
        this.context.updateUsage(tokenUsage);
        this.emitCacheHitNotification(tokenUsage);
      }

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

  createOnFinish(userCallback?: GenerateTextOnEndCallback<ToolSet>): GenerateTextOnEndCallback<ToolSet> {
    return (event) => {
      // Preserve terminal states (aborted / error / waiting) instead of
      // briefly flashing "completed" before overwriting with "error".
      if (this.status === "aborted" || this.status === "error" || this.status === "waiting") {
        // keep current terminal status
      } else if (this.error) {
        this.status = "error";
      } else {
        this.status = "completed";
      }

      if (this.status === "completed") {
        this.lastStreamDurationMs = Date.now() - this.streamStartedAt;
        this.streamStartedAt = 0;
      }

      this.log?.agent("Agent response finished", {
        finishReason: event.finishReason,
        totalSteps: event.steps?.length ?? 0,
        usage: event.usage,
      });

      this.context?.updateFinal?.(event);
      this.context?.clearEvents();
      this.saveSession();
      this.relevantMemoryContent = "";

      this.dispatchEvent?.({
        type: "agent:stop",
        agentId: this.agentId,
        data: { session_id: this.sessionData?.id ?? "", reason: event.finishReason ?? "unknown" },
      });

      this.runMemoryExtraction();

      userCallback?.(event);
    };
  }

  // ============================================================================
  // Prefix Cache Optimization — Reasoning Content Stripping
  // ============================================================================

  /**
   * Strip reasoning parts from historical assistant messages to reduce prompt
   * token count and improve prefix cache efficiency.
   *
   * DeepSeek bills reasoning_content as prompt tokens when replayed in history.
   * We keep reasoning only on assistant turns that carry tool calls (DeepSeek API
   * requires reasoning + tool_calls to be sent together), and strip it from all
   * other historical turns.
   *
   * Only applies when the current model is identified as a DeepSeek model.
   */
  private stripReasoningFromHistory(messages: ModelMessage[]): void {
    if (!this.modelInfo || this.modelInfo.provider !== "deepseek") return;

    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const content = msg.content;
      if (!Array.isArray(content)) continue;

      const hasToolCall = content.some(
        (p) => p && typeof p === "object" && (p as Record<string, unknown>).type === "tool-call"
      );

      // Keep reasoning on turns with tool calls (DeepSeek requires it)
      if (hasToolCall) continue;

      // Strip reasoning parts from pure-text assistant turns
      const filtered = content.filter(
        (p) => !(p && typeof p === "object" && (p as Record<string, unknown>).type === "reasoning")
      );

      if (filtered.length < content.length) {
        msg.content = filtered;
      }
    }
  }

  // ============================================================================
  // Prefix Cache Monitoring
  // ============================================================================

  /**
   * Emit a notification with cache hit statistics after each LLM step.
   * Tracks cumulative session-level cache hit ratio for observability.
   */
  private emitCacheHitNotification(tokenUsage: { inputTokens: number; cacheReadTokens?: number }): void {
    const cacheRead = tokenUsage.cacheReadTokens ?? 0;
    const inputTokens = tokenUsage.inputTokens;

    if (inputTokens <= 0) return;

    // Accumulate session-level stats
    this.sessionCacheHitTokens += cacheRead;
    this.sessionCacheMissTokens += inputTokens - cacheRead;

    const stepHitRatio = cacheRead / inputTokens;
    const sessionTotal = this.sessionCacheHitTokens + this.sessionCacheMissTokens;
    const sessionHitRatio = sessionTotal > 0 ? this.sessionCacheHitTokens / sessionTotal : 0;

    // Only notify when cache data is meaningful (provider actually reports it)
    if (cacheRead > 0 || this.sessionCacheHitTokens > 0) {
      this.log?.notify(
        "system",
        "info",
        `Cache hit: ${(stepHitRatio * 100).toFixed(0)}% (session: ${(sessionHitRatio * 100).toFixed(0)}%)`,
        {
          stepCacheRead: cacheRead,
          stepInputTokens: inputTokens,
          stepHitRatio,
          sessionCacheHitTokens: this.sessionCacheHitTokens,
          sessionCacheMissTokens: this.sessionCacheMissTokens,
          sessionHitRatio,
        }
      );
    }
  }

  /**
   * Get the session-level cache hit ratio (0-1).
   * Returns 0 if no cache data has been reported.
   */
  getCacheHitRatio(): number {
    const total = this.sessionCacheHitTokens + this.sessionCacheMissTokens;
    return total > 0 ? this.sessionCacheHitTokens / total : 0;
  }

  // ============================================================================
  // Compaction Orchestration
  // ============================================================================

  createPrepareStep(userCallback?: PrepareStepFunction<ToolSet>) {
    return (async (options) => {
      const res = userCallback ? await userCallback(options) : options;
      const finalMessages = res?.messages || [];

      microCompact(finalMessages, this.compactionConfig || {});
      this.stripReasoningFromHistory(finalMessages);
      this.context?.setMessages(finalMessages);
      let llmMessages = this.context?.getMessagesForLLM() || [];

      if (this.shouldAutoCompact(llmMessages) && this.model && this.context) {
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
          const result = await autoCompact(llmMessages, this.compactionConfig ?? {}, this.agentId, {
            todos: todos.length > 0 ? todos : undefined,
            actualTokens: actualTokens || undefined,
          });

          const beforeLength = llmMessages.length;

          if (
            applyCompactionResult(this.context, result, {
              onCacheCleanupError: (err) => {
                this.log?.warn("agent", "Failed to cleanup tool cache", { error: err.message });
              },
            })
          ) {
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

      // Inject dynamic per-turn context (relevant memories, todo nag) right
      // before the last user message so the conversation prefix stays
      // byte-stable for provider prefix cache.
      const dynamicContext = this.getDynamicTurnContext?.();
      if (dynamicContext) {
        const contextMessages = [
          { role: "user" as const, content: `<turn_context>\n${dynamicContext}\n</turn_context>` },
          { role: "assistant" as const, content: "Understood. I'll keep this context in mind." },
        ];
        const lastUserIdx = (() => {
          for (let i = llmMessages.length - 1; i >= 0; i--) {
            if (llmMessages[i].role === "user") return i;
          }
          return -1;
        })();
        if (lastUserIdx >= 0) {
          llmMessages = [...llmMessages.slice(0, lastUserIdx), ...contextMessages, ...llmMessages.slice(lastUserIdx)];
        } else {
          llmMessages = [...contextMessages, ...llmMessages];
        }
      }

      return { ...res, messages: llmMessages };
    }) as PrepareStepFunction<ToolSet>;
  }

  // ============================================================================
  // Reactive Compaction
  // ============================================================================

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

      const summaryMsg = compactedMessages[0];
      if (summaryMsg) {
        this.context.setSummaryMessage(summaryMsg);
        const oldCompactIndex = this.context.getCompactIndex();
        const newCompactIndex = this.context.getMessages().length;
        this.context.setCompactIndex(newCompactIndex);

        if (newCompactIndex > oldCompactIndex) {
          const allMessages = this.context.getMessages();
          cleanupOrphanedToolCache(allMessages, newCompactIndex).catch((err) => {
            const e = err instanceof Error ? err : new Error(String(err));
            this.log?.warn("agent", "Failed to cleanup tool cache after reactive compact", { error: e.message });
          });
        }

        const tailMessages = compactedMessages.slice(1);
        if (tailMessages.length > 0) {
          const allMessages = [...this.context.getMessages(), ...tailMessages];
          this.context.setMessages(allMessages);
          this.context.setCompactIndex(allMessages.length - tailMessages.length);
        }
      }
      this.context.resetUsage();
      this.context.clearTools();

      this.log?.info("agent", "Reactive compact completed", {
        originalMessages: llmMessages.length,
        compactedMessages: compactedMessages.length,
      });

      // Compaction succeeded — the caller (onError / generate retry) is
      // expected to retry, so restore "running" to reflect that intent.
      this.status = "running";
      return true;
    } catch (err) {
      const compactError = err instanceof Error ? err : new Error(String(err));
      this.log?.error("agent", "Reactive compact failed", compactError);
      // Do NOT clobber the caller's status here. The caller (onError) will
      // set "error" after we return false; setting "running" in finally
      // would briefly mask the error and mislead the UI.
      return false;
    }
  }

  // ============================================================================
  // Reset
  // ============================================================================

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
    this.sessionCacheHitTokens = 0;
    this.sessionCacheMissTokens = 0;
    this.resetMemoryState();
    this.log?.clear();
    this.context?.reset();
    this.todoManager?.reset();
  }
}
