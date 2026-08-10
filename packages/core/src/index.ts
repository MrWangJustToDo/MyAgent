// ============================================================================
// CoreEnv — register before any core usage
// ============================================================================

export {
  registerCoreEnv,
  clearCoreEnv,
  getEnv,
  hasCoreEnv,
  defaultPath,
  defaultByteLength,
  defaultBase64Encode,
  defaultBase64Decode,
  type CoreEnv,
  type ResolvedCoreEnv,
  type CoreEnvPath,
  type CoreEnvFs,
  type CoreEnvFsStat,
  type CoreEnvExecOptions,
  type CoreEnvExecResult,
  type McpStdioTransportConfig,
  type McpProcessHandle,
} from "./env.js";

// ============================================================================
// Runtime — agent manager & managed agent
// ============================================================================

export { agentManager, AgentManager } from "./managers/agent-manager.js";
export type { AgentEvent, AgentEventListener, AgentEventType, RunAgentStreamInput } from "./managers/agent-manager.js";
export { ManagedAgent, type ManagedAgentConfig, type AgentMode } from "./managers/managed-agent.js";
export { isActiveStatus } from "./managers/agent-status.js";
export type { AgentStatus } from "./runtime-types/agent-status.js";
export { localConnect, createLocalConnect, type LocalConnectManager } from "./connect";
export { AgentChatController } from "./managers/agent-chat-controller.js";
export type {
  QueuedMessageContent,
  QueuedMessagesSnapshot,
  QueueUpdateListener,
} from "./managers/agent-chat-controller.js";
export type { PlanModePhase, PlanModeState, BeginPlanExecutionResult } from "./agent/plan/plan-mode-controller.js";
export {
  formatPlanModeFooterLabel,
  todoProgressFromItems,
  type PlanTodoProgress,
} from "./agent/plan/plan-footer-label.js";
export type { QueueMode } from "./agent/utils/pending-message-queue.js";

// ============================================================================
// Agent state (hosts / UI)
// ============================================================================

export { buildCanonicalModelMessages, type TokenUsage } from "./agent/compaction";
export { AgentLog } from "./agent/agent-log";
export { TodoManager, type TodoItem, type TodoStatus, type TodoPriority } from "./agent/todo-manager";

// ============================================================================
// Session persistence
// ============================================================================

export { SessionStore, type SessionMeta, type SessionData, type ResumeResult } from "./agent/session";

// ============================================================================
// Agent Session API (host-facing transport-agnostic surface)
// ============================================================================

export {
  AGENT_SESSION_CHANNELS,
  DEFAULT_AGENT_SESSION_CHANNELS,
  DEFAULT_SESSION_LIFECYCLE_EVENTS,
  createLocalAgentSession,
  sessionForSubagent,
  type AgentSession,
  type AgentSessionChannel,
  type AgentSessionCommand,
  type AgentSessionCommandResult,
  type AgentSessionEvent,
  type AgentSessionMessageContent,
  type AgentSessionSnapshot,
  type AgentSessionSubagentSummary,
  type AgentSessionSubscribeOptions,
  type AgentSessionSubscriber,
  type CreateLocalAgentSessionOptions,
} from "./agent-session";
export type { AgentL1State } from "./managers/managed-agent.js";
export type { UsageChangeSnapshot, UsageSnapshot } from "./managers/usage-tracker.js";

// ============================================================================
// Summary streams (task / compact)
// ============================================================================

export {
  SUMMARY_STREAM_SNAPSHOT_LINE_CAP,
  SummaryStreamHub,
  applyAppendToDisplayWindow,
  applySummaryStreamAppend,
  displayWindowFromSnapshot,
  emptySummaryDisplayWindow,
  emptySummaryLineBuffer,
  renderSummaryDisplayRows,
  summaryStreamKey,
  compactSummaryStreamId,
  type SummaryDisplayWindow,
  type SummaryLineBuffer,
  type SummaryStreamEvent,
  type SummaryStreamListener,
  type SummaryStreamResetInput,
  type SummaryStreamSnapshot,
  type SummaryStreamSource,
  type SummaryStreamStatus,
} from "./agent/summary-stream";

// ============================================================================
// Compaction (/compact command)
// ============================================================================

export {
  applyCompactionResult,
  autoCompact,
  CONVERSATION_SUMMARY_END,
  CONVERSATION_SUMMARY_START,
  estimateTokens,
  extractCompactionSummaryBody,
  extractTextFromContent,
  formatCompactionSummaryContent,
  getModelVisibleMessages,
  isCompactionSummaryUIMessage,
  isCompactionSummaryText,
} from "./agent/compaction";

// ============================================================================
// Models & agent bootstrap helpers
// ============================================================================

export {
  DEFAULT_BASE_URLS,
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  parseModelStyle,
  resolveModelConfig,
  resolveModelConnection,
  parseModelInfoFromEnv,
  runSideTextQuery,
} from "./models";
export type { ModelInfo, ModelStyle, ModelConnection, ResolvedModelConfig } from "./models";
export { resolveTextAdapterForManaged } from "./managers/run-agent.js";
export { buildDefaultSystemPrompt } from "./agent/default-prompt.js";

// ============================================================================
// UI utilities
// ============================================================================

export { previewEdit, type PreviewEditResult } from "./agent/tools/util/preview-edit.js";
export { registerToUI, getToUI, clearToUI } from "./agent/tools/tanstack/to-ui-registry.js";

// ============================================================================
// Tool output types (message formatting)
// ============================================================================

export type {
  EditFileOutput,
  GetCommandOutput,
  GlobOutput,
  GrepOutput,
  KillCommandOutput,
  ListFileOutput,
  RunCommandOutput,
  TodoOutput,
  WriteFileOutput,
} from "./agent/tools/util/types.js";
export type { ReadFileOutput } from "./agent/tools/read-file-tool.js";
export type { TaskOutput } from "./agent/tools/task-tool.js";

// ============================================================================
// Environment errors & types (node / server adapters)
// ============================================================================

export { FileError, ExecutionError } from "./environment";
export type {
  FileEntry,
  FileStat,
  CommandResult,
  RunCommandOptions,
  CommandJobStatus,
  StartCommandOptions,
  StartCommandHandle,
} from "./environment";

// ============================================================================
// Extension API
// ============================================================================

export { ExtensionRunner, ExtensionLoader, DEFAULT_EXTENSION_DIR, getDefaultExtensionDirs } from "./agent/extension";
export type {
  ExtensionAPI,
  ExtensionFactory,
  ExtensionContext,
  ExtensionConfig,
  ExtensionInstance,
  ExtensionToolDefinition,
  ExtensionCommand,
  ExtensionEventBus,
  ExtensionUI,
  ExtensionZod,
  InterceptableEvent,
  EventInterceptor,
  BeforeAgentStartEvent,
  BeforeAgentStartPayload,
  ExtensionPromptAppends,
  TurnContextProvider,
  ExtensionInfo,
} from "./agent/extension";

// ============================================================================
// Shared utilities
// ============================================================================

export { generateId } from "./agent/utils.js";
export type { GenerateIdOptions } from "./agent/utils.js";
export { destroyAllCommandJobs } from "./agent/tools/util/command-job-registry.js";
