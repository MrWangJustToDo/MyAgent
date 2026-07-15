import {
  type ModelMessage,
  type UIMessage as TanStackUIMessage,
  type ServerTool,
  convertMessagesToModelMessages,
} from "@tanstack/ai";

import { applyReactiveCompactionResult } from "../agent/compaction/apply-compaction-result.js";
import { shouldTriggerAutoCompact } from "../agent/compaction/auto-compact.js";
import { getLatestUserMessage } from "../agent/compaction/message-utils.js";
import { isPromptTooLongError, reactiveCompact } from "../agent/compaction/reactive-compact.js";
import { ToolCompactCache } from "../agent/compaction/tool-compact/tool-compact-cache.js";
import {
  createSessionSyncTracker,
  type SessionSaveReason,
  type SessionSyncTracker,
} from "../agent/session/session-sync-tracker.js";
import { isToolContinuationPrepare } from "../agent/utils/tool-phase-utils.js";
import { generateId } from "../agent/utils.js";

import { AgentChatController } from "./agent-chat-controller.js";
import { createAgentStatusController, type AgentStatusController } from "./agent-status-controller.js";
import { AgentConfigSchema } from "./agent-types.js";
import { emitAgentEvent } from "./emit-agent-event.js";
import { buildDynamicTurnContext, buildFrozenSystemPrompt } from "./managed-agent-prompt.js";
import { MemoryService } from "./memory-service.js";
import { RunCoordinator } from "./run-coordinator.js";
import { SessionService, type SessionPersistInput } from "./session-service.js";
import { UsageTracker } from "./usage-tracker.js";

import type { AgentEvent, AgentEventType } from "./agent-event-bus.js";
import type { AgentConfig, AgentStatus, RunFinalizeReason } from "./agent-types.js";
import type { AgentUIChannel } from "./agent-ui-channel.js";
import type { AgentManager } from "./manager-agent.js";
import type { AgentContext } from "../agent/agent-context";
import type { AgentLog } from "../agent/agent-log";
import type { CompactionConfig, CompactionConfigInput } from "../agent/compaction/types.js";
import type { HookRegistry } from "../agent/hooks/hook-registry.js";
import type { McpManager } from "../agent/mcp/manager.js";
import type { MemoryManager } from "../agent/memory/memory-manager.js";
import type { AgentRunner } from "../agent/runner/agent-runner.js";
import type { SessionStore } from "../agent/session/session-store.js";
import type { SessionData } from "../agent/session/types.js";
import type { SkillRegistry } from "../agent/skills";
import type { TodoManager } from "../agent/todo-manager";
import type { ToolsRecord } from "../agent/tools/tanstack/tools-record.js";
import type { TextAdapterConfig } from "../models/adapter-factory.js";
import type { ModelStyle } from "../models/model-config.js";
import type { ModelInfo } from "../models/types.js";

// ============================================================================
// Config
// ============================================================================

export type { RunFinalizeReason } from "./agent-types.js";

export type ManagedAgentConfig<T = ManagedAgent> = AgentConfig & {
  id?: string;
  name: string;
  modelInfo?: ModelInfo;
  modelStyle?: ModelStyle;
  modelBaseURL?: string;
  modelApiKey?: string;
  setUp?: (instance: T) => T;
  skillDirs?: string[];
  compaction?: CompactionConfigInput;
  mcpConfigPath?: string;
  agentDocFilenames?: string[];
  agentDocLoadOverride?: boolean;
};

/** Subagent preview / non-useChat UI channel (TanStack StreamProcessor). */
export type AgentUIChannelRef = Pick<
  AgentUIChannel,
  "getMessages" | "subscribe" | "subscribeCustomEvents" | "subscribeApprovalRequests"
>;

// ============================================================================
// ManagedAgent — composition root
// ============================================================================

/**
 * Central runtime object. Owns composed services and orchestrates cross-service calls.
 * Individual services ({@link MemoryService}, {@link SessionService}, {@link RunCoordinator})
 * hold only their own state; they never reference each other.
 */
export class ManagedAgent {
  readonly id: string;
  name: string;
  readonly config: ManagedAgentConfig;

  /** Lifecycle */
  status: AgentStatus = "idle";
  error = "";
  /** Tools awaiting user approval in the current run (set by approval middleware). */
  pendingApprovalCount = 0;

  private readonly stateListeners = new Set<() => void>();

  /** Composed services — each owns only its domain state */
  readonly usage: UsageTracker;
  readonly memory: MemoryService;
  readonly session: SessionService;
  readonly run: RunCoordinator;
  readonly statusController: AgentStatusController;

  context: AgentContext;
  tools: ToolsRecord;
  log: AgentLog;
  todoManager: TodoManager | null;

  runner?: AgentRunner;
  runnerConfigKey?: string;
  textAdapter?: TextAdapterConfig;
  tanstackTools?: ServerTool[];
  ui?: AgentUIChannel;
  chatController?: AgentChatController;
  parentId?: string;
  parentTaskId?: string;
  childIds: string[];
  createdAt: number;
  updatedAt: number;

  resolveTextAdapter?: () => Promise<TextAdapterConfig | null>;
  /** Set by AgentManager to route events to listeners and hooks. */
  dispatchEvent?: (event: AgentEvent) => void;

  private managedToolsProvider?: () => ToolsRecord;
  private agentConfig: AgentConfig;
  streamStartedAt = 0;
  lastStreamDurationMs = 0;
  systemPrompt = "";
  mcpManager: McpManager | null = null;
  skillRegister: SkillRegistry | null = null;
  compactionConfig: CompactionConfig | null = null;
  readonly toolCompactCache = new ToolCompactCache();
  private readonly sessionSyncTracker: SessionSyncTracker = createSessionSyncTracker();
  hookRegistry: HookRegistry | null = null;
  modelInfo: ModelInfo | null = null;
  agentDocContent = "";
  agentDocSource = "";

  private frozenSystemPrompt: string | undefined;
  private systemPromptFrozen = false;

  constructor(
    config: ManagedAgentConfig,
    init: {
      id?: string;
      context: AgentContext;
      log: AgentLog;
      tools: ToolsRecord;
      todoManager: TodoManager | null;
      parentId?: string;
      usage?: UsageTracker;
      memory?: MemoryService;
      session?: SessionService;
    }
  ) {
    this.id = init.id ?? config.id ?? generateId("agent");
    this.name = config.name;
    this.config = config;
    this.agentConfig = AgentConfigSchema.parse(config);
    this.context = init.context;
    this.log = init.log;
    this.tools = init.tools;
    this.todoManager = init.todoManager;
    this.parentId = init.parentId;
    this.usage = init.usage ?? new UsageTracker();
    this.memory = init.memory ?? new MemoryService();
    this.session = init.session ?? new SessionService();
    this.run = new RunCoordinator();
    this.childIds = [];
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.managedToolsProvider = () => this.tools;
    this.statusController = createAgentStatusController({
      getStatus: () => this.status,
      setStatus: (status) => this.setStatus(status),
      getError: () => this.error,
      setError: (error) => this.setError(error),
      setPendingApprovalCount: (count) => this.setPendingApprovalCount(count),
      log: this.log,
      emitEvent: (type, data) => this.emitEvent(type, data),
    });

    if (config.setUp) {
      return config.setUp(this);
    }

    return this;
  }

  // ============================================================================
  // Status & events
  // ============================================================================

  setStatus(status: AgentStatus): void {
    if (status === "completed" || status === "aborted" || status === "error") {
      this.recordStreamDuration();
    }
    this.status = status;
    this.emitStateChange();
  }

  /** Snapshot wall-clock duration for the current turn into {@link lastStreamDurationMs}. */
  private recordStreamDuration(): void {
    if (this.streamStartedAt <= 0) return;
    this.lastStreamDurationMs = Math.max(0, Date.now() - this.streamStartedAt);
  }

  setError(error: string): void {
    this.error = error;
    this.emitStateChange();
  }

  setPendingApprovalCount(count: number): void {
    this.pendingApprovalCount = count;
    this.emitStateChange();
  }

  /**
   * App host API — pause agent status while a client tool (e.g. `ask_user`) waits for user input.
   * Core does not infer this from messages; the UI sets it when opening/closing client-tool flows.
   */
  setClientToolWaiting(active: boolean): void {
    this.statusController.setClientToolWaiting(active);
  }

  /** Sync approval / client-tool pause status from loaded UIMessages (e.g. session resume). */
  syncInteractionStateFromUIMessages(
    messages: TanStackUIMessage[],
    options?: { whenClear?: "idle" | "running" | "completed" }
  ): void {
    this.statusController.reconcileFromUIMessages(messages, options);
  }

  /** Reconcile status after a chat pump finishes. */
  syncRunStatusFromUIMessages(messages: TanStackUIMessage[]): void {
    this.statusController.reconcileAfterRun(messages);
  }

  /** Subscribe to status / error / pending-approval changes (for UI refresh). */
  subscribeState(listener: () => void): () => void {
    this.stateListeners.add(listener);
    listener();
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private emitStateChange(): void {
    for (const listener of this.stateListeners) {
      try {
        listener();
      } catch {
        // Ignore listener errors
      }
    }
  }

  emitEvent(
    type: AgentEventType,
    data?: Record<string, unknown>,
    options?: { parentId?: string; agentId?: string }
  ): void {
    emitAgentEvent(this, type, { data, ...options });
  }

  getSessionData(): SessionData | null {
    return this.session.getSessionData();
  }

  // ============================================================================
  // Config & resources
  // ============================================================================

  getConfig(): Readonly<AgentConfig> {
    return { ...this.agentConfig };
  }

  updateConfig(updates: Partial<AgentConfig>): void {
    this.agentConfig = AgentConfigSchema.parse({ ...this.agentConfig, ...updates });
  }

  setModelInfo(info: ModelInfo): void {
    this.log?.debug("agent", "Setting model info", {
      id: info.id,
      style: info.style,
      contextWindow: info.contextWindow,
    });
    this.modelInfo = info;
  }

  getModelInfo(): ModelInfo | null {
    return this.modelInfo;
  }

  setContext(c: AgentContext): void {
    this.context = c;
    if (this.compactionConfig) {
      this.usage.setTokenLimit(this.compactionConfig.tokenThreshold);
    }
  }

  getContext(): AgentContext {
    return this.context;
  }

  setLog(c: AgentLog): void {
    this.log = c;
  }

  getLog(): AgentLog {
    return this.log;
  }

  setTodoManager(t: TodoManager): void {
    if (this.todoManager) return;
    this.todoManager = t;
  }

  getTodoManager(): TodoManager | null {
    return this.todoManager;
  }

  setMemoryManager(manager: MemoryManager): void {
    this.memory.setManager(manager);
  }

  getMemoryManager(): MemoryManager | null {
    return this.memory.getManager();
  }

  setMemoryContent(content: string): void {
    this.memory.setContent(content);
  }

  getMemoryContent(): string {
    return this.memory.getContent();
  }

  get memoryContent(): string {
    return this.memory.getContent();
  }

  get relevantMemoryContent(): string {
    return this.memory.getRelevantContent();
  }

  setSessionStore(store: SessionStore, sessionConfig: { modelStyle: string; model: string }): void {
    this.session.setStore(store, sessionConfig);
  }

  getSessionStore(): SessionStore | null {
    return this.session.getStore();
  }

  setSessionData(data: SessionData): void {
    this.session.setSessionData(data);
  }

  /**
   * Sync {@link AgentContext} messages from UI messages (preserves compaction summary state).
   * Skipped during active runs unless explicitly requested.
   */
  syncContextFromUIMessages(uiMessages: TanStackUIMessage[]): void {
    if (!this.context || uiMessages.length === 0) return;
    this.context.setUIMessages(uiMessages);
  }

  /**
   * Checkpoint-based session persist for live UI updates.
   * Skips writes during streaming; persists stable deltas (user turns, approvals, pump idle).
   */
  maybeSaveSessionUIMessages(uiMessages: TanStackUIMessage[], reason: SessionSaveReason = "checkpoint"): void {
    if (uiMessages.length === 0) return;
    if (!this.sessionSyncTracker.shouldPersist(uiMessages, { reason, agentStatus: this.status })) {
      return;
    }
    this.syncContextFromUIMessages(uiMessages);
    this.session.persistSession(this.getSessionPersistInput(uiMessages));
    this.sessionSyncTracker.markPersisted(uiMessages);
  }

  /**
   * Persist session `uiMessages` from the app `useChat` hook (single source of truth).
   * Also syncs AgentContext and writes model fields in the same session save.
   */
  saveSessionUIMessages(uiMessages: TanStackUIMessage[]): void {
    if (uiMessages.length === 0) return;
    this.syncContextFromUIMessages(uiMessages);
    this.session.persistSession(this.getSessionPersistInput(uiMessages));
    this.sessionSyncTracker.markPersisted(uiMessages);
  }

  /** Reset checkpoint tracking after restore, clear, or new chat bootstrap. */
  resetSessionSyncTracker(uiMessages?: TanStackUIMessage[]): void {
    this.sessionSyncTracker.reset(uiMessages);
  }

  private getSessionPersistInput(uiMessages?: TanStackUIMessage[]): SessionPersistInput {
    return {
      context: this.context,
      usage: this.usage,
      todoManager: this.todoManager,
      resolveTextAdapter: this.resolveTextAdapter,
      emitEvent: (type, data) => this.emitEvent(type, data),
      uiMessages,
    };
  }

  /** Persist model state only (summary, compact index, usage, todos). Does not write `uiMessages`. */
  persistSession(): void {
    this.session.persistSession(this.getSessionPersistInput());
  }

  /**
   * Finalize a run — persist session, clear turn memory, optionally extract memories, emit `agent:stop`.
   * Memory extraction runs only when `reason === "finished"`.
   */
  finalizeRun(manager: AgentManager, reason: RunFinalizeReason): void {
    this.recordStreamDuration();
    this.persistSession();
    this.memory.clearTurnContext();
    if (reason === "finished") {
      this.memory.runExtraction({
        agentId: this.id,
        context: this.context,
        log: this.log,
        manager,
        emitEvent: (type, data) => this.emitEvent(type, data),
      });
    }
    this.emitEvent("agent:stop", { reason });
  }

  setAgentDocContent(content: string, source?: string): void {
    this.agentDocContent = content;
    this.agentDocSource = source ?? "";
  }

  getAgentDocContent(): string {
    return this.agentDocContent;
  }

  setSkillRegister(t: SkillRegistry): void {
    if (this.skillRegister) return;
    this.skillRegister = t;
  }

  getSkillRegister(): SkillRegistry | null {
    return this.skillRegister;
  }

  setMcpManager(m: McpManager): void {
    if (this.mcpManager) return;
    this.mcpManager = m;
  }

  getMcpManager(): McpManager | null {
    return this.mcpManager;
  }

  setCompactionConfig(config: CompactionConfig): void {
    this.log?.debug("agent", "Setting compaction config", {
      tokenThreshold: config.tokenThreshold,
      keepRecentToolResults: config.keepRecentToolResults,
    });
    this.compactionConfig = config;
    this.usage.setTokenLimit(config.tokenThreshold);
  }

  getCompactionConfig(): CompactionConfig | null {
    return this.compactionConfig;
  }

  getToolCompactCache(): ToolCompactCache {
    return this.toolCompactCache;
  }

  getSystemPrompt(): string | undefined {
    if (this.systemPromptFrozen) return this.frozenSystemPrompt;
    this.frozenSystemPrompt = buildFrozenSystemPrompt({
      config: this.agentConfig,
      agentDocContent: this.agentDocContent,
      skillRegister: this.skillRegister,
      memoryContent: this.memoryContent,
    });
    this.systemPromptFrozen = true;
    this.systemPrompt = this.frozenSystemPrompt ?? "";
    return this.frozenSystemPrompt;
  }

  getDynamicTurnContext(): string | undefined {
    let todoNagReminder: string | undefined;
    if (this.todoManager?.shouldNag()) {
      todoNagReminder = this.todoManager.getNagReminder();
      this.log?.todo("Injecting nag reminder via turn context", {
        roundsSinceUpdate: this.todoManager.getRoundsSinceUpdate(),
      });
    }
    return buildDynamicTurnContext({
      relevantMemoryContent: this.relevantMemoryContent,
      todoNagReminder,
    });
  }

  // ============================================================================
  // Run orchestration (ManagedAgent coordinates services)
  // ============================================================================

  prepareMessages(options: { prompt?: string | ModelMessage[]; messages?: ModelMessage[] }): ModelMessage[] {
    return this.run.prepareMessages(options);
  }

  async prepareForRun(options: {
    prompt?: string;
    messages?: Array<TanStackUIMessage | ModelMessage>;
    abortSignal?: AbortSignal;
  }) {
    if (options.messages?.length) {
      this.syncContextFromUIMessages(options.messages as TanStackUIMessage[]);
      const baseline = convertMessagesToModelMessages(options.messages as TanStackUIMessage[]).length;
      this.context?.setRunBaselineCount(baseline);
    }

    const inputMessages = options.messages || [];

    this.run.setupAbortController(options.abortSignal, {
      onAborted: () => {
        this.setStatus("aborted");
      },
    });
    this.run.resetReactiveCompactRetries();

    const isToolContinuation = isToolContinuationPrepare(this.status, options.messages);
    // Wall-clock for the whole user turn (including tool-phase continues). Reset only on a new turn.
    if (!isToolContinuation || this.streamStartedAt === 0) {
      this.streamStartedAt = Date.now();
    }

    if (!isToolContinuation && !this.parentId) {
      await this.memory.prefetchRelevantMemories({
        messages:
          getLatestUserMessage(options.prompt ? [{ role: "user", content: options.prompt }] : inputMessages) || [],
        usage: this.usage,
        log: this.log,
        resolveTextAdapter: this.resolveTextAdapter,
        emitEvent: (type, data) => this.emitEvent(type, data),
      });

      this.emitEvent("prompt:submit", {
        prompt: typeof options.prompt === "string" ? options.prompt : "(structured)",
      });
    }
  }

  shouldTriggerAutoCompact(messages?: ModelMessage[]): boolean {
    const config = this.compactionConfig ?? {};
    return shouldTriggerAutoCompact(config, {
      windowInputTokens: this.usage.getWindowUsage().inputTokens,
      messages,
    });
  }

  getCacheHitRatio(): number {
    const total = this.usage.getTotal();
    if (total.inputTokens <= 0) return 0;
    return (total.cacheReadTokens ?? 0) / total.inputTokens;
  }

  setupAbortController(abortSignal?: AbortSignal): void {
    this.run.setupAbortController(abortSignal, {
      onAborted: () => {
        this.setStatus("aborted");
      },
    });
  }

  addPendingAbortController(abortController: AbortController): void {
    this.run.addPendingAbortController(abortController);
  }

  removePendingAbortController(abortController: AbortController): void {
    this.run.removePendingAbortController(abortController);
  }

  abort(reason?: string): void {
    this.emitEvent("agent:abort", { reason: reason ?? "(no reason)" });
    this.run.abort();
  }

  isAbortError(err: unknown): boolean {
    return this.run.isAbortError(err);
  }

  resetReactiveCompactRetries(): void {
    this.run.resetReactiveCompactRetries();
  }

  async handleReactiveCompact(error: unknown, manager: AgentManager): Promise<boolean> {
    if (this.parentId) return false;
    if (!isPromptTooLongError(error)) return false;
    if (!this.run.canRetryReactiveCompact()) {
      this.emitEvent("compaction:reactive-max-retries");
      return false;
    }

    const retry = this.run.recordReactiveCompactRetry();
    this.emitEvent("compaction:reactive-start", {
      retry,
      maxRetries: this.run.getMaxReactiveCompactRetries(),
    });

    try {
      this.statusController.beginCompaction();
      const canon = this.context.getCanonicalFromUI();
      const llmMessages = this.context.getMessagesForLLM(canon);
      const compactedMessages = await reactiveCompact(llmMessages, this.id, manager);

      applyReactiveCompactionResult(canon, this.context, this.usage, compactedMessages, {
        onCacheCleanupError: (err) => {
          this.emitEvent("compaction:reactive-error", {
            phase: "cache-cleanup",
            error: err.message,
          });
        },
      });

      this.emitEvent("compaction:reactive-complete", {
        originalMessages: llmMessages.length,
        compactedMessages: compactedMessages.length,
      });

      this.statusController.endCompaction();
      return true;
    } catch (err) {
      const compactError = err instanceof Error ? err : new Error(String(err));
      this.emitEvent("compaction:reactive-error", { error: compactError.message });
      return false;
    }
  }

  async restoreSession(sessionId: string): Promise<SessionData> {
    this.toolCompactCache.clear();
    const session = await this.session.restoreFromStore(sessionId, {
      context: this.context,
      usage: this.usage,
      todoManager: this.todoManager,
    });
    this.resetSessionSyncTracker(session.uiMessages);
    return session;
  }

  isToolNeedsApproval(toolName: string): boolean {
    const tools = this.managedToolsProvider?.() ?? {};
    const tool = tools[toolName];
    return tool != null && "needsApproval" in tool && tool.needsApproval === true;
  }

  /** Create or replace the core-owned main chat session (StreamProcessor + run loop). */
  initChat(manager: AgentManager, initialMessages?: TanStackUIMessage[]): AgentChatController {
    this.chatController = new AgentChatController(this, manager, initialMessages);
    this.resetSessionSyncTracker(initialMessages);
    return this.chatController;
  }

  getChatController(): AgentChatController | undefined {
    return this.chatController;
  }

  reset(): void {
    const prevStatus = this.status;
    this.log?.info("agent", "Resetting agent", {
      previousStatus: prevStatus,
      hadTodos: this.todoManager?.hasTodos() ?? false,
    });
    this.run.resetRunState();
    this.statusController.resetToIdle();
    this.setError("");
    this.pendingApprovalCount = 0;
    this.memory.resetState();
    this.log?.clear();
    this.context?.reset();
    this.usage.reset();
    this.todoManager?.reset();
    this.chatController = undefined;
    this.ui = undefined;
    this.systemPromptFrozen = false;
    this.frozenSystemPrompt = undefined;
  }
}

export function createManagedAgentTimestamps(): Pick<ManagedAgent, "createdAt" | "updatedAt" | "childIds"> {
  const now = Date.now();
  return { createdAt: now, updatedAt: now, childIds: [] };
}
