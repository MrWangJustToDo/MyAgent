import { extractTokenUsage } from "../agent-context/types.js";
import { applyCompactionResult, autoCompact } from "../compaction";
import { microCompact } from "../compaction/micro-compact.js";
import { isPromptTooLongError, reactiveCompact } from "../compaction/reactive-compact.js";
import { estimateTokens } from "../compaction/token-estimator.js";
import { emitHook } from "../hooks/hook-runner.js";
import { cleanupOrphanedToolCache, createTodoTool } from "../tools";

import { SessionHandler } from "./session-handler.js";

import type { Sandbox } from "../../environment";
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
  StreamTextOnStepFinishCallback,
  GenerateTextOnStepFinishCallback,
  StreamTextOnFinishCallback,
  GenerateTextOnFinishCallback,
  PrepareStepFunction,
} from "ai";

// ============================================================================
// Base Class
// ============================================================================

export class Base extends SessionHandler {
  // State
  status: AgentStatus = "idle";
  error = "";

  // Resources
  systemPrompt = "";
  sandbox: Sandbox | null = null;
  mcpManager: McpManager | null = null;
  skillRegister: SkillRegistry | null = null;
  compactionConfig: CompactionConfig | null = null;
  customTools: ToolSet = {};
  builtInTools: ToolSet = {};

  // Hook system
  hookRegistry: HookRegistry | null = null;

  // Model metadata from the registry (context window, pricing, capabilities, etc.)
  modelInfo: ModelInfo | null = null;

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

  /** Set sandbox for tool execution */
  setSandbox(sandbox: Sandbox): void {
    this.log?.debug("agent", "Setting sandbox", {
      sandboxId: sandbox.sandboxId,
      provider: sandbox.provider,
    });
    this.sandbox = sandbox;
  }

  getSandbox(): Sandbox | null {
    return this.sandbox;
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
        this.context.updateUsage(extractTokenUsage(usage));
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

  createOnFinish(
    userCallback?: StreamTextOnFinishCallback<ToolSet> | GenerateTextOnFinishCallback<NoInfer<ToolSet>>
  ): StreamTextOnFinishCallback<ToolSet> | GenerateTextOnFinishCallback<NoInfer<ToolSet>> {
    return (event) => {
      if (this.status !== "waiting") this.status = "completed";
      if (this.error) this.status = "error";

      this.log?.agent("Agent response finished", {
        finishReason: event.finishReason,
        totalSteps: event.steps?.length ?? 0,
        usage: event.usage,
      });

      this.context?.updateFinal?.(event);
      this.context?.clearEvents();
      this.saveSession();
      this.relevantMemoryContent = "";

      emitHook(
        this.hookRegistry,
        "Stop",
        {
          hook_event_name: "Stop",
          session_id: this.sessionData?.id ?? "",
          reason: event.finishReason ?? "unknown",
        },
        { logger: this.log ?? undefined }
      );

      this.runMemoryExtraction();
      userCallback?.(event);
    };
  }

  // ============================================================================
  // Compaction Orchestration
  // ============================================================================

  createPrepareStep(userCallback?: PrepareStepFunction) {
    return (async (options) => {
      const res = userCallback ? await userCallback(options) : options;
      const finalMessages = res?.messages || [];

      microCompact(finalMessages, this.compactionConfig || {});
      this.context?.setMessages(finalMessages);
      let llmMessages = this.context?.getMessagesForLLM() || [];

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
          const result = await autoCompact(llmMessages, this.compactionConfig ?? {}, this.agentId, {
            todos: todos.length > 0 ? todos : undefined,
            actualTokens: actualTokens || undefined,
          });

          const beforeLength = llmMessages.length;

          if (
            applyCompactionResult(this.context, this.sandbox, result, {
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

      return { ...res, messages: llmMessages };
    }) as PrepareStepFunction;
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

        if (this.sandbox && newCompactIndex > oldCompactIndex) {
          const allMessages = this.context.getMessages();
          cleanupOrphanedToolCache(this.sandbox, allMessages, newCompactIndex).catch((err) => {
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

      return true;
    } catch (err) {
      const compactError = err instanceof Error ? err : new Error(String(err));
      this.log?.error("agent", "Reactive compact failed", compactError);
      return false;
    } finally {
      this.status = "running";
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
    this.resetMemoryState();
    this.log?.clear();
    this.context?.reset();
    this.todoManager?.reset();
  }
}
