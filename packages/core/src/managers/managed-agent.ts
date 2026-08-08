/* eslint-disable max-lines */
import { type ModelMessage, type UIMessage as TanStackUIMessage, convertMessagesToModelMessages } from "@tanstack/ai";

import { AutoModeController } from "../agent/approval/auto-mode-controller.js";
import { buildAutoModePrompt } from "../agent/approval/auto-mode-prompt.js";
import { shouldTriggerAutoCompact } from "../agent/compaction/auto-compact.js";
import { getModelVisibleMessages } from "../agent/compaction/message-chain-projection.js";
import { ToolCompactCache } from "../agent/compaction/tool-compact/tool-compact-cache.js";
import { PlanModeController } from "../agent/plan/plan-mode-controller.js";
import { buildPlanModePrompt, buildPlanRetroSteerMessage } from "../agent/plan/plan-prompts.js";
import {
  createSessionSyncTracker,
  type SessionSaveReason,
  type SessionSyncTracker,
} from "../agent/session/session-sync-tracker.js";
import { SummaryStreamHub } from "../agent/summary-stream/summary-stream-hub.js";
import { defineServerTool } from "../agent/tools/tanstack/define-tool.js";
import { getCurrentDate, getGitInfo } from "../agent/turn-context/env-context.js";
import {
  buildTurnContextPayload,
  findLatestTurnContextHash,
  formatTurnContextUserContent,
  hashTurnContextPayload,
  insertTurnContextUIMessage,
} from "../agent/turn-context/turn-context-message.js";
import { generateId } from "../agent/utils.js";
import { Emitter } from "../utils/emitter.js";

import { AgentChatController } from "./agent-chat-controller.js";
import { createAgentStatusController, type AgentStatusController } from "./agent-status-controller.js";
import { AgentConfigSchema } from "./agent-types.js";
import { emitAgentEvent } from "./emit-agent-event.js";
import { handleManagedReactiveCompact } from "./managed-agent-compact.js";
import {
  beginPlanExecution as beginPlanExecutionHelper,
  cancelPlanExecution as cancelPlanExecutionHelper,
  completePlan as completePlanHelper,
  disablePlanMode as disablePlanModeHelper,
  enablePlanMode as enablePlanModeHelper,
  getPlanModeState as getPlanModeStateHelper,
  listWorkspacePlans as listWorkspacePlansHelper,
  loadPlanFromWorkspace as loadPlanFromWorkspaceHelper,
  savePlanToWorkspace as savePlanToWorkspaceHelper,
  togglePlanMode as togglePlanModeHelper,
} from "./managed-agent-plan.js";
import { buildDynamicTurnContext, buildFrozenSystemPrompt } from "./managed-agent-prompt.js";
import {
  abortManagedAgentRun,
  finalizeManagedAgentRun,
  prepareManagedAgentForRun,
} from "./managed-agent-run-lifecycle.js";
import {
  persistSessionModelState,
  restoreManagedSession,
  saveSessionUIMessages as saveSessionUIMessagesHelper,
} from "./managed-agent-session.js";
import { MemoryService } from "./memory-service.js";
import { RunCoordinator } from "./run-coordinator.js";
import { SessionService } from "./session-service.js";
import { UsageTracker } from "./usage-tracker.js";

import type { AgentEvent, AgentEventType } from "./agent-event-bus.js";
import type { AgentManager } from "./agent-manager.js";
import type { AgentConfig, AgentStatus, RunFinalizeReason } from "./agent-types.js";
import type { AgentLog } from "../agent/agent-log";
import type { CompactionConfig, CompactionConfigInput } from "../agent/compaction/types.js";
import type {
  ExtensionCommand,
  ExtensionFactory,
  ExtensionLoader,
  ExtensionRunner,
  ExtensionToolDefinition,
} from "../agent/extension";
import type { McpManager } from "../agent/mcp/manager.js";
import type { MemoryManager } from "../agent/memory/memory-manager.js";
import type { BeginPlanExecutionResult, PlanModePhase, PlanModeState } from "../agent/plan/plan-mode-controller.js";
import type { AgentRunner } from "../agent/runner/agent-runner.js";
import type { SessionStore } from "../agent/session/session-store.js";
import type { SessionData } from "../agent/session/types.js";
import type { SkillRegistry } from "../agent/skills";
import type { TodoManager } from "../agent/todo-manager";
import type { ToolsRecord } from "../agent/tools/tanstack/tools-record.js";
import type { AgentUIChannel } from "../agent/ui-channel.js";
import type { TextAdapterConfig } from "../models/adapter-factory.js";
import type { ModelStyle } from "../models/model-config.js";
import type { ModelInfo } from "../models/types.js";

// ============================================================================
// Config
// ============================================================================

/** When the turn context payload hasn't changed, re-admit every N messages to keep context fresh. */
const TURN_CONTEXT_REFRESH_MESSAGE_THRESHOLD = 100;

export type { RunFinalizeReason } from "./agent-types.js";

/** Active agent mode — mutually exclusive modes for the agent. */
export type AgentMode = "normal" | "auto" | "plan";

/** L1 runtime status surface projected to AgentSession `state` channel. */
export interface AgentL1State {
  status: AgentStatus;
  error: string;
  pendingApprovalCount: number;
}

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
  /**
   * Custom tools for subagents. When set, `spawnSubagent` will use these
   * instead of the default subagent tools. Pass `null` to clear all tools,
   * or omit to use the default read-only + web subagent tools.
   */
  subagentTools?: ToolsRecord | null;
  /**
   * Programmatic extension factories to load on bootstrap.
   * Each factory is called during agent initialization.
   */
  extensions?: Array<ExtensionFactory>;
  /**
   * Extra filesystem directories to scan for extensions (before env / defaults).
   * Relative paths resolve against CoreEnv `rootPath`.
   */
  extensionDirs?: string[];
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
  // ============================================================================
  // Identity
  // ============================================================================

  readonly id: string;
  name: string;
  readonly config: ManagedAgentConfig;
  private agentConfig: AgentConfig;

  // ============================================================================
  // L1 state + local emitter
  // ============================================================================

  /** Lifecycle — hosts read via getter; mutate through {@link setStatus}. */
  private _status: AgentStatus;
  private error: string;
  /** Tools awaiting user approval in the current run (set by approval middleware). */
  private pendingApprovalCount: number;
  private readonly stateEvents: Emitter<{
    change: AgentL1State;
    /** Fired when {@link setUIChannel} attaches/clears the UI channel. */
    ui: AgentUIChannel | undefined;
  }>;

  // ============================================================================
  // Composed services / controllers
  // ============================================================================

  /** Composed services — each owns only its domain state */
  readonly usage: UsageTracker;
  readonly memory: MemoryService;
  readonly session: SessionService;
  readonly run: RunCoordinator;
  readonly statusController: AgentStatusController;
  /** Plan mode (read-only planning → execute). Root agents only; subagents leave phase off. */
  readonly planMode: PlanModeController;
  /** Auto / YOLO mode — skip all tool approvals. Cleared on reset / `/clear`. */
  readonly autoMode: AutoModeController;

  // ============================================================================
  // Tools / registries / extensions
  // ============================================================================

  tools: ToolsRecord;
  private managedToolsProvider?: () => ToolsRecord;
  log: AgentLog;
  todoManager: TodoManager | null;
  mcpManager: McpManager | null;
  skillRegister: SkillRegistry | null;
  extensionRunner: ExtensionRunner | null;
  extensionLoader: ExtensionLoader | null;
  /** Extension slash commands registered via {@link ExtensionContext.registerCommand}. */
  private extensionCommands: Map<string, ExtensionCommand>;

  // ============================================================================
  // Agent tree + timestamps
  // ============================================================================

  parentId?: string;
  parentTaskId?: string;
  childIds: string[];
  createdAt: number;
  updatedAt: number;

  // ============================================================================
  // Run / UI / model wiring
  // ============================================================================

  /** Package-internal TanStack runner wiring — not part of the host-facing surface. */
  private runner?: AgentRunner;
  private runnerConfigKey?: string;
  private textAdapter?: TextAdapterConfig;
  resolveTextAdapter?: () => Promise<TextAdapterConfig | null>;
  private _ui?: AgentUIChannel;
  /** Task / compact summary streams for the session `summary` channel. */
  readonly summaryStreams: SummaryStreamHub;
  private _chatController?: AgentChatController;
  /** Set by AgentManager to route events to listeners. */
  dispatchEvent?: (event: AgentEvent) => void;
  /** Owning manager — set when registered via {@link AgentManager.createManagedAgent}. */
  manager?: AgentManager;
  modelInfo: ModelInfo | null;

  // ============================================================================
  // Compaction / session sync
  // ============================================================================

  compactionConfig: CompactionConfig | null;
  readonly toolCompactCache: ToolCompactCache;
  readonly sessionSyncTracker: SessionSyncTracker;
  private _runBaselineCount: number;

  // ============================================================================
  // Run lifecycle flags + timing
  // ============================================================================

  /** When true, next {@link prepareForRun} skips memory prefetch / prompt:submit (steer / tool continue). */
  private prepareAsContinuation: boolean;
  /** Guards turn-level finalizeRun so stop() + pump outcome do not double-fire. */
  private turnLifecycleFinalized: boolean;
  private streamStartedAt: number;
  private lastStreamDurationMs: number;

  // ============================================================================
  // Prompt / turn context
  // ============================================================================

  private systemPrompt: string;
  agentDocContent: string;
  agentDocSource: string;
  private frozenSystemPrompt: string | undefined;
  private systemPromptFrozen: boolean;
  /** Stable dynamic turn context for the current user turn (payload snapshot). */
  private turnContextSnapshot: string | undefined;
  /** Extension append-only text for the current user turn (merged into turn_context message). */
  private extensionSystemAppendSnapshot: string | undefined;
  /** Pending extension turn-context text collected in prepareForRun (before snapshot). */
  private pendingExtensionTurnContext: string | undefined;
  /** Hash of the last turn_context payload admitted into UIMessage history. */
  private lastAdmittedTurnContextHash: string | undefined;
  /** Message count at the last turn_context admit (for periodic refresh). */
  private turnContextAdmitMessageCount: number;

  constructor(
    config: ManagedAgentConfig,
    init: {
      id?: string;
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
      emitEvent: (type, data) => this.emitEvent(type, data),
    });

    this.planMode = new PlanModeController({
      emitEvent: (type, data) => this.emitEvent(type, data),
      getTodoManager: () => this.todoManager,
      onPhaseChange: () => {
        this.invalidateRunner();
        this.emitStateChange();
      },
      onEnterRetro: (state) => {
        const steer = buildPlanRetroSteerMessage(state.planFilePath);
        if (this._chatController) {
          void this._chatController.sendMessage(steer);
        }
      },
    });
    this.autoMode = new AutoModeController(() => this.emitStateChange());

    // ============================================================================
    // L1 state + local emitter (inline inits)
    // ============================================================================
    this._status = "idle";
    this.error = "";
    this.pendingApprovalCount = 0;
    this.stateEvents = new Emitter<{
      change: AgentL1State;
      ui: AgentUIChannel | undefined;
    }>();

    // ============================================================================
    // Tools / registries / extensions (inline inits)
    // ============================================================================
    this.mcpManager = null;
    this.skillRegister = null;
    this.extensionRunner = null;
    this.extensionLoader = null;
    this.extensionCommands = new Map<string, ExtensionCommand>();

    // ============================================================================
    // Run / UI / model wiring (inline inits)
    // ============================================================================
    this.summaryStreams = new SummaryStreamHub();
    this.modelInfo = null;

    // ============================================================================
    // Compaction / session sync (inline inits)
    // ============================================================================
    this.compactionConfig = null;
    this.toolCompactCache = new ToolCompactCache();
    this.sessionSyncTracker = createSessionSyncTracker();
    this._runBaselineCount = 0;

    // ============================================================================
    // Run lifecycle flags + timing (inline inits)
    // ============================================================================
    this.prepareAsContinuation = false;
    this.turnLifecycleFinalized = false;
    this.streamStartedAt = 0;
    this.lastStreamDurationMs = 0;

    // ============================================================================
    // Prompt / turn context (inline inits)
    // ============================================================================
    this.systemPrompt = "";
    this.agentDocContent = "";
    this.agentDocSource = "";
    this.systemPromptFrozen = false;
    this.lastAdmittedTurnContextHash = undefined;
    this.turnContextAdmitMessageCount = 0;

    if (config.setUp) {
      return config.setUp(this);
    }

    return this;
  }

  // ============================================================================
  // Status & events
  // ============================================================================

  /** Host-facing status (read-only; use {@link setStatus} to mutate). */
  get status(): AgentStatus {
    return this._status;
  }

  /** Host-facing UI channel when present (read-only; package-internal {@link setUIChannel}). */
  get ui(): AgentUIChannel | undefined {
    return this._ui;
  }

  getError(): string {
    return this.error;
  }

  getPendingApprovalCount(): number {
    return this.pendingApprovalCount;
  }

  getStreamStartedAt(): number {
    return this.streamStartedAt;
  }

  setStreamStartedAt(value: number): void {
    this.streamStartedAt = value;
  }

  getLastStreamDurationMs(): number {
    return this.lastStreamDurationMs;
  }

  setStatus(status: AgentStatus): void {
    if (status === "completed" || status === "aborted" || status === "error") {
      this.recordStreamDuration();
    }
    this._status = status;
    this.emitStateChange();
  }

  /** Snapshot wall-clock duration for the current turn into {@link lastStreamDurationMs}. */
  recordStreamDuration(): void {
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
    if (options?.whenClear === "running") {
      this.statusController.reconcileWithPolicy(messages, "during-run");
      return;
    }
    if (options?.whenClear === "completed") {
      this.statusController.reconcileWithPolicy(messages, "after-chat-run");
      return;
    }
    this.statusController.reconcileWithPolicy(messages, "idle-clear");
  }

  /** Reconcile status after a chat pump finishes. */
  syncRunStatusFromUIMessages(messages: TanStackUIMessage[]): void {
    this.statusController.applyRunOutcome({ kind: "finished", messages, path: "chat" });
  }

  /** L1 status snapshot for Emitter / Session projection. */
  getL1State(): AgentL1State {
    return {
      status: this._status,
      error: this.error,
      pendingApprovalCount: this.pendingApprovalCount,
    };
  }

  /**
   * Typed domain events for this agent:
   * - `change` — L1 status/error/pendingApproval (fires current snapshot on subscribe)
   * - `ui` — UI channel attach/clear
   *
   * Hosts should prefer AgentSession channels.
   */
  on<K extends "change" | "ui">(
    type: K,
    listener: (payload: K extends "change" ? AgentL1State : AgentUIChannel | undefined) => void
  ): () => void {
    const unsub = this.stateEvents.on(type, listener as (payload: AgentL1State | AgentUIChannel | undefined) => void);
    if (type === "change") {
      (listener as (payload: AgentL1State) => void)(this.getL1State());
    }
    return unsub;
  }

  private emitStateChange(): void {
    this.stateEvents.emit("change", this.getL1State());
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

  /** Model-message count at the start of the current `chat()` invocation. */
  setRunBaselineCount(count: number): void {
    this._runBaselineCount = Math.max(0, count);
  }

  getRunBaselineCount(): number {
    return this._runBaselineCount;
  }

  /** Canonical model messages from the UI channel only. */
  getCanonicalFromUI(): ModelMessage[] {
    const uiMessages = this.ui?.getMessages() ?? [];
    if (uiMessages.length === 0) return [];
    return convertMessagesToModelMessages(uiMessages);
  }

  /**
   * Messages sent to the LLM after in-chain compaction summary projection.
   */
  getMessagesForLLM(canon?: ModelMessage[]): ModelMessage[] {
    const base = canon ?? this.getCanonicalFromUI();
    const keepRecentFlows = this.compactionConfig?.keepRecentFlows ?? 2;
    return getModelVisibleMessages(base, { keepRecentFlows });
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
   * Persist `uiMessages` when an explicit trigger fires and the fingerprint changed.
   * Reasons: `user-message` | `pump-complete` | `force` (via {@link saveSessionUIMessages}).
   * Fire-and-forget — dehydrate + disk write happen in the background.
   */
  maybeSaveSessionUIMessages(uiMessages: TanStackUIMessage[], reason: SessionSaveReason): void {
    if (uiMessages.length === 0) return;
    if (!this.sessionSyncTracker.shouldPersist(uiMessages, { reason })) {
      return;
    }
    void saveSessionUIMessagesHelper(this, uiMessages);
  }

  /**
   * Force-persist session `uiMessages` (slash commands such as `/clear`).
   * Fire-and-forget — dehydrate + disk write happen in the background.
   */
  saveSessionUIMessages(uiMessages: TanStackUIMessage[]): void {
    void saveSessionUIMessagesHelper(this, uiMessages);
  }

  /** Reset fingerprint tracking after restore, clear, or new chat bootstrap. */
  resetSessionSyncTracker(uiMessages?: TanStackUIMessage[]): void {
    this.sessionSyncTracker.reset(uiMessages);
  }

  /** Persist model state only (usage, todos). Does not write `uiMessages`. */
  persistSession(): void {
    void persistSessionModelState(this);
  }

  /**
   * Finalize a user turn / detached run — persist session, clear turn memory, optionally extract memories, emit `agent:stop`.
   * Owned by {@link AgentChatController} / subagent runners (not per-`chat()` middleware).
   * Memory extraction runs only when `reason === "finished"`. Idempotent per turn until {@link resetTurnLifecycle}.
   */
  finalizeRun(manager: AgentManager, reason: RunFinalizeReason): void {
    finalizeManagedAgentRun(this, manager, reason);
  }

  /** Call at the start of a chat pump or detached run so finalize can run once for that turn. */
  resetTurnLifecycle(): void {
    this.turnLifecycleFinalized = false;
  }

  /**
   * Claim turn finalization. @returns false when already finalized for this turn.
   * @internal Used by {@link finalizeManagedAgentRun}.
   */
  beginTurnFinalize(): boolean {
    if (this.turnLifecycleFinalized) return false;
    this.turnLifecycleFinalized = true;
    return true;
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

  registerTool(def: ExtensionToolDefinition): void {
    if (this.tools[def.name]) {
      this.log?.warn("system", `Tool "${def.name}" already registered, overwriting`);
    }
    const serverTool = defineServerTool({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      outputSchema: def.outputSchema,
      execute: async (args, ctx) =>
        def.execute(args, {
          toolCallId: ctx.toolCallId,
          abortSignal: ctx.abortSignal,
        }),
      toUI: def.toUI,
    });
    (this.tools as Record<string, unknown>)[def.name] = serverTool;
    this.setRunnerConfigKey(undefined);
  }

  registerCommand(cmd: ExtensionCommand): void {
    if (this.extensionCommands.has(cmd.name)) {
      this.log?.warn("system", `Command "/${cmd.name}" already registered, overwriting`);
    }
    this.extensionCommands.set(cmd.name, cmd);
  }

  getExtensionCommands(): ExtensionCommand[] {
    if (this.extensionRunner) {
      return this.extensionRunner.getCommands();
    }
    return Array.from(this.extensionCommands.values());
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
      memoryContent: this.getMemoryContent(),
    });
    this.systemPromptFrozen = true;
    this.systemPrompt = this.frozenSystemPrompt ?? "";
    return this.frozenSystemPrompt;
  }

  /** Alias for the cacheable system prompt prefix (before per-turn dynamic segment). */
  getFrozenSystemPrompt(): string | undefined {
    return this.getSystemPrompt();
  }

  getTurnContextSnapshot(): string | undefined {
    return this.turnContextSnapshot;
  }

  getExtensionSystemAppendSnapshot(): string | undefined {
    return this.extensionSystemAppendSnapshot;
  }

  /**
   * Collect `before_agent_start` interceptors + turn-context providers for this user turn.
   * Call before {@link captureTurnContextSnapshot}.
   */
  async collectExtensionPromptHooks(prompt: string): Promise<void> {
    this.pendingExtensionTurnContext = undefined;
    this.extensionSystemAppendSnapshot = undefined;

    const runner = this.extensionRunner;
    if (!runner) return;

    const collected = await runner.collectBeforeAgentStart(prompt, this.id);
    this.pendingExtensionTurnContext = collected.turnContext;
    this.extensionSystemAppendSnapshot = collected.systemAppend;

    this.emitEvent("prompt:before", {
      prompt,
      hasTurnContext: Boolean(collected.turnContext),
      hasSystemAppend: Boolean(collected.systemAppend),
    });
  }

  async captureTurnContextSnapshot(): Promise<void> {
    this.turnContextSnapshot = await this.getDynamicTurnContext();
  }

  /**
   * When the dynamic payload changed, insert a synthetic `<turn_context>` user message
   * into the UI channel (persisted, display-filtered). No-op when unchanged.
   *
   * Also re-admits periodically when messages grow beyond {@link TURN_CONTEXT_REFRESH_MESSAGE_THRESHOLD}
   * to keep context fresh in long conversations, even if the payload hasn't changed.
   */
  admitTurnContextIfNeeded(): boolean {
    const payload = buildTurnContextPayload(this.turnContextSnapshot, this.extensionSystemAppendSnapshot);
    if (!payload) return false;

    const hash = hashTurnContextPayload(payload);
    if (this.lastAdmittedTurnContextHash === undefined) {
      const existing = findLatestTurnContextHash(this.ui?.getMessages() ?? []) ?? undefined;
      this.lastAdmittedTurnContextHash = existing;
    }

    const messageCount = this.ui?.getMessages().length ?? 0;
    const aboveThreshold = messageCount - this.turnContextAdmitMessageCount >= TURN_CONTEXT_REFRESH_MESSAGE_THRESHOLD;

    if (hash === this.lastAdmittedTurnContextHash && !aboveThreshold) return false;

    const content = formatTurnContextUserContent(payload, {
      isUpdate: Boolean(this.lastAdmittedTurnContextHash),
    });

    const ui = this.ui;
    if (!ui) {
      this.log?.warn("agent", "admitTurnContextIfNeeded: UI channel missing; skipping turn_context admit");
      return false;
    }

    const next = insertTurnContextUIMessage(ui.getMessages(), content);
    ui.setMessages(next);
    this.maybeSaveSessionUIMessages(next, "user-message");

    this.lastAdmittedTurnContextHash = hash;
    this.turnContextAdmitMessageCount = next.length;
    return true;
  }

  /** After compaction / clear — force the next turn to re-admit full dynamic context. */
  resetAdmittedTurnContext(): void {
    this.lastAdmittedTurnContextHash = undefined;
    this.turnContextAdmitMessageCount = 0;
  }

  clearTurnContext(): void {
    this.memory.clearTurnContext();
    this.turnContextSnapshot = undefined;
    this.extensionSystemAppendSnapshot = undefined;
    this.pendingExtensionTurnContext = undefined;
  }

  resetSystemPrompt(): void {
    this.systemPromptFrozen = false;
    this.frozenSystemPrompt = undefined;
    this.invalidateRunner();
  }

  async getDynamicTurnContext(): Promise<string | undefined> {
    let todoNagReminder: string | undefined;
    if (this.todoManager?.shouldNag()) {
      todoNagReminder = this.todoManager.getNagReminder();
      this.log?.todo("Capturing nag reminder in turn context snapshot", {
        roundsSinceUpdate: this.todoManager.getRoundsSinceUpdate(),
      });
    }

    const currentDate = getCurrentDate();
    const { branch: gitBranch, status: gitStatus } = await getGitInfo();

    const planState = this.planMode.getState();
    const planModeContent = buildPlanModePrompt(planState.phase, planState.planMarkdown, planState.planFilePath);
    // Plan turn-context wins when plan is active; auto prompt only in pure auto mode.
    const autoModeContent = planState.phase === "off" && this.autoMode.isEnabled() ? buildAutoModePrompt() : undefined;

    return buildDynamicTurnContext({
      relevantMemoryContent: this.memory.getRelevantContent(),
      todoNagReminder,
      currentDate,
      gitBranch,
      gitStatus,
      planModeContent,
      autoModeContent,
      extensionTurnContext: this.pendingExtensionTurnContext,
    });
  }

  // ============================================================================
  // Auto-approve mode (skip all tool approvals)
  // ============================================================================

  isAutoModeEnabled(): boolean {
    return this.autoMode.isEnabled();
  }

  setAutoModeEnabled(enabled: boolean): void {
    this.autoMode.setEnabled(enabled);
    // Auto mode and plan mode are mutually exclusive — enabling auto disables plan
    if (enabled && this.planMode.getPhase() !== "off") {
      this.planMode.disable();
    }
  }

  /** @returns new enabled state */
  toggleAutoMode(): boolean {
    const enabled = this.autoMode.toggle();
    // Auto mode and plan mode are mutually exclusive — enabling auto disables plan
    if (enabled && this.planMode.getPhase() !== "off") {
      this.planMode.disable();
    }
    return enabled;
  }

  /**
   * Whether pending tool approvals should be auto-approved this turn.
   * True when auto mode is on, or plan mode is building a seeded plan.
   */
  shouldAutoApprovePendingTools(): boolean {
    return this.autoMode.isEnabled() || this.planMode.shouldAutoApproveTools();
  }

  /**
   * Return the current agent mode.
   * Plan mode takes priority over auto mode; normal is the fallback.
   */
  getAgentMode(): AgentMode {
    if (this.planMode.getPhase() !== "off") return "plan";
    if (this.autoMode.isEnabled()) return "auto";
    return "normal";
  }

  // ============================================================================
  // Plan mode
  // ============================================================================

  enablePlanMode(): void {
    enablePlanModeHelper(this);
    // Plan mode and auto mode are mutually exclusive — enabling plan disables auto
    if (this.autoMode.isEnabled()) {
      this.autoMode.setEnabled(false);
    }
  }

  disablePlanMode(): void {
    disablePlanModeHelper(this);
  }

  togglePlanMode(): PlanModePhase {
    const phase = togglePlanModeHelper(this);
    // Plan mode and auto mode are mutually exclusive — entering plan disables auto
    if (phase !== "off" && this.autoMode.isEnabled()) {
      this.autoMode.setEnabled(false);
    }
    return phase;
  }

  getPlanModeState(): PlanModeState {
    return getPlanModeStateHelper(this);
  }

  beginPlanExecution(options: { sendSteer?: boolean } = {}): BeginPlanExecutionResult {
    return beginPlanExecutionHelper(this, options);
  }

  cancelPlanExecution(): boolean {
    return cancelPlanExecutionHelper(this);
  }

  async savePlanToWorkspace(nameHint?: string): Promise<{ ok: boolean; path?: string; error?: string }> {
    return savePlanToWorkspaceHelper(this, nameHint);
  }

  async loadPlanFromWorkspace(
    name: string
  ): Promise<{ ok: boolean; path?: string; error?: string; stepCount?: number }> {
    return loadPlanFromWorkspaceHelper(this, name);
  }

  completePlan(): { ok: boolean; error?: string } {
    return completePlanHelper(this);
  }

  async listWorkspacePlans(): Promise<string[]> {
    return listWorkspacePlansHelper();
  }

  // ============================================================================
  // Run orchestration (ManagedAgent coordinates services)
  // ============================================================================

  /** Mark the next prepareForRun as a mid-turn continuation (queued steer / tool phase). */
  markNextPrepareAsContinuation(): void {
    this.prepareAsContinuation = true;
  }

  /** Clear a leftover continuation mark (e.g. on turn finalize). */
  clearPrepareAsContinuation(): void {
    this.prepareAsContinuation = false;
  }

  /** Consume and clear the continuation flag for prepareForRun. */
  consumePrepareAsContinuation(): boolean {
    const value = this.prepareAsContinuation;
    this.prepareAsContinuation = false;
    return value;
  }

  async prepareForRun(options: {
    prompt?: string;
    messages?: Array<TanStackUIMessage | ModelMessage>;
    abortSignal?: AbortSignal;
  }) {
    await prepareManagedAgentForRun(this, options);
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

  /**
   * Register a tool-scoped AbortController so {@link abort} cancels in-flight
   * HTTP work (e.g. webfetch / websearch) alongside the main run controller.
   */
  addPendingAbortController(abortController: AbortController): void {
    this.run.addPendingAbortController(abortController);
  }

  removePendingAbortController(abortController: AbortController): void {
    this.run.removePendingAbortController(abortController);
  }

  /**
   * Cancel the current run. Aborts {@link RunCoordinator.currentAbortController}
   * (the same identity wired into TanStack `chat` by {@link prepareForRun}) and
   * any pending tool controllers.
   */
  abort(reason?: string): void {
    abortManagedAgentRun(this, reason);
  }

  isAbortError(err: unknown): boolean {
    return this.run.isAbortError(err);
  }

  async handleReactiveCompact(error: unknown, manager: AgentManager): Promise<boolean> {
    return handleManagedReactiveCompact(this, error, manager);
  }

  async restoreSession(sessionId: string): Promise<SessionData> {
    return restoreManagedSession(this, sessionId);
  }

  isToolNeedsApproval(toolName: string): boolean {
    const tools = this.managedToolsProvider?.() ?? {};
    const tool = tools[toolName];
    return tool != null && "needsApproval" in tool && tool.needsApproval === true;
  }

  /** Create or replace the core-owned main chat session (StreamProcessor + run loop). */
  initChat(manager: AgentManager, initialMessages?: TanStackUIMessage[]): AgentChatController {
    this._chatController = new AgentChatController(this, manager, initialMessages);
    this.resetSessionSyncTracker(initialMessages);
    return this._chatController;
  }

  getChatController(): AgentChatController | undefined {
    return this._chatController;
  }

  reset(): void {
    const prevStatus = this.status;
    this.log?.info("agent", "Resetting agent", {
      previousStatus: prevStatus,
      hadTodos: this.todoManager?.hasTodos() ?? false,
    });
    // Exit plan / auto-approve first so approval bypass cannot stick across sessions.
    this.planMode.disable();
    this.setAutoModeEnabled(false);
    this.run.resetRunState();
    this.statusController.resetToIdle();
    this.setError("");
    this.pendingApprovalCount = 0;
    this.memory.resetState();
    this.turnContextSnapshot = undefined;
    this.extensionSystemAppendSnapshot = undefined;
    this.pendingExtensionTurnContext = undefined;
    this.log?.clear();
    this._runBaselineCount = 0;
    this.usage.reset();
    this.todoManager?.reset();
    this.turnLifecycleFinalized = false;
    // Keep chatController + _ui alive — /clear calls clearMessages() separately.
    // Resetting these would break subsequent sendMessage() calls.
    this.lastAdmittedTurnContextHash = undefined;
    this.systemPromptFrozen = false;
    this.frozenSystemPrompt = undefined;
  }

  // ============================================================================
  // Package-internal runner / adapter / UI wiring
  // ============================================================================

  /** @internal Used by run-agent / stream recovery. */
  getRunner(): AgentRunner | undefined {
    return this.runner;
  }

  /** @internal */
  setRunner(runner: AgentRunner | undefined): void {
    this.runner = runner;
  }

  /** @internal */
  getRunnerConfigKey(): string | undefined {
    return this.runnerConfigKey;
  }

  /** @internal */
  setRunnerConfigKey(key: string | undefined): void {
    this.runnerConfigKey = key;
  }

  /** @internal Invalidate cached AgentRunner (tools / plan phase / prompt changed). */
  invalidateRunner(): void {
    this.runner = undefined;
    this.runnerConfigKey = undefined;
  }

  /** @internal */
  getTextAdapter(): TextAdapterConfig | undefined {
    return this.textAdapter;
  }

  /** @internal */
  setTextAdapter(adapter: TextAdapterConfig | undefined): void {
    this.textAdapter = adapter;
  }

  /** @internal Wire chat / subagent UI channel (hosts read via {@link ui}). */
  setUIChannel(ui: AgentUIChannel | undefined): void {
    this._ui = ui;
    this.stateEvents.emit("ui", ui);
  }
}

export function createManagedAgentTimestamps(): Pick<ManagedAgent, "createdAt" | "updatedAt" | "childIds"> {
  const now = Date.now();
  return { createdAt: now, updatedAt: now, childIds: [] };
}
