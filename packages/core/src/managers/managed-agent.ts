import { convertMessagesToModelMessages } from "@tanstack/ai";

import { applyReactiveCompactionResult } from "../agent/compaction/apply-compaction-result.js";
import { shouldTriggerAutoCompact } from "../agent/compaction/auto-compact.js";
import { isPromptTooLongError, reactiveCompact } from "../agent/compaction/reactive-compact.js";
import { generateId } from "../agent/utils.js";

import { isActiveStatus } from "./agent-status.js";
import { AgentConfigSchema } from "./agent-types.js";
import { emitAgentEvent } from "./emit-agent-event.js";
import { buildDynamicTurnContext, buildFrozenSystemPrompt } from "./managed-agent-prompt.js";
import { MemoryService } from "./memory-service.js";
import { RunCoordinator } from "./run-coordinator.js";
import { SessionService } from "./session-service.js";
import { UsageTracker } from "./usage-tracker.js";

import type { AgentEvent, AgentEventType } from "./agent-event-bus.js";
import type { AgentConfig, AgentStatus } from "./agent-types.js";
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
import type { ModelMessage, UIMessage as TanStackUIMessage, ServerTool } from "@tanstack/ai";

// ============================================================================
// Config
// ============================================================================

export type ManagedAgentConfig<T = AgentContext> = AgentConfig & {
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

  /** Composed services — each owns only its domain state */
  readonly usage: UsageTracker;
  readonly memory: MemoryService;
  readonly session: SessionService;
  readonly run: RunCoordinator;

  context: AgentContext;
  tools: ToolsRecord;
  log: AgentLog;
  todoManager: TodoManager | null;

  runner?: AgentRunner;
  runnerConfigKey?: string;
  textAdapter?: TextAdapterConfig;
  tanstackTools?: ServerTool[];
  ui?: AgentUIChannel;
  parentId?: string;
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
  }

  // ============================================================================
  // Status & events
  // ============================================================================

  setStatus(status: AgentStatus): void {
    this.status = status;
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
    this.context.setMessages(convertMessagesToModelMessages(uiMessages));
  }

  updateSessionUIMessages(uiMessages: TanStackUIMessage[], options: { syncContext?: boolean } = {}): void {
    const shouldSync = options.syncContext ?? !isActiveStatus(this.status);
    if (shouldSync) {
      this.syncContextFromUIMessages(uiMessages);
    }
    this.session.updateUIMessages(uiMessages, this.log, (type, data) => this.emitEvent(type, data));
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
    prompt?: string | ModelMessage[];
    messages?: ModelMessage[];
    abortSignal?: AbortSignal;
  }): Promise<ModelMessage[]> {
    const finalMessages = this.run.prepareMessages(options);
    this.run.setupAbortController(options.abortSignal, {
      onAborted: () => {
        this.setStatus("aborted");
      },
    });
    this.run.resetReactiveCompactRetries();
    if (this.streamStartedAt === 0) this.streamStartedAt = Date.now();

    await this.memory.prefetchRelevantMemories({
      messages: finalMessages,
      usage: this.usage,
      log: this.log,
      resolveTextAdapter: this.resolveTextAdapter,
      emitEvent: (type, data) => this.emitEvent(type, data),
    });

    this.emitEvent("prompt:submit", {
      prompt: typeof options.prompt === "string" ? options.prompt : "(structured)",
    });
    return finalMessages;
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
      this.setStatus("compacting");
      const llmMessages = this.context.getMessagesForLLM();
      const compactedMessages = await reactiveCompact(llmMessages, this.id, manager);

      applyReactiveCompactionResult(this.context, this.usage, compactedMessages, {
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

      this.setStatus("running");
      return true;
    } catch (err) {
      const compactError = err instanceof Error ? err : new Error(String(err));
      this.emitEvent("compaction:reactive-error", { error: compactError.message });
      return false;
    }
  }

  /** Called when a run finishes — coordinates session save and memory extraction. */
  completeRun(manager: AgentManager): void {
    this.session.saveSession({
      context: this.context,
      usage: this.usage,
      todoManager: this.todoManager,
      log: this.log,
      resolveTextAdapter: this.resolveTextAdapter,
      emitEvent: (type, data) => this.emitEvent(type, data),
    });
    this.memory.clearTurnContext();
    this.memory.runExtraction({
      agentId: this.id,
      context: this.context,
      log: this.log,
      manager,
      emitEvent: (type, data) => this.emitEvent(type, data),
    });
    this.emitEvent("agent:stop", { reason: "finished" });
  }

  async restoreSession(sessionId: string): Promise<SessionData> {
    return this.session.restoreFromStore(sessionId, {
      context: this.context,
      usage: this.usage,
      todoManager: this.todoManager,
    });
  }

  isToolNeedsApproval(toolName: string): boolean {
    const tools = this.managedToolsProvider?.() ?? {};
    const tool = tools[toolName];
    return tool != null && "needsApproval" in tool && tool.needsApproval === true;
  }

  reset(): void {
    const prevStatus = this.status;
    this.log?.info("agent", "Resetting agent", {
      previousStatus: prevStatus,
      hadTodos: this.todoManager?.hasTodos() ?? false,
    });
    this.run.resetRunState();
    this.setStatus("idle");
    this.error = "";
    this.memory.resetState();
    this.log?.clear();
    this.context?.reset();
    this.usage.reset();
    this.todoManager?.reset();
    this.systemPromptFrozen = false;
    this.frozenSystemPrompt = undefined;
  }
}

export function createManagedAgentTimestamps(): Pick<ManagedAgent, "createdAt" | "updatedAt" | "childIds"> {
  const now = Date.now();
  return { createdAt: now, updatedAt: now, childIds: [] };
}
