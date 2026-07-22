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

export { agentManager, AgentManager, getDefaultSkillDirs, SKILL_DIRS_ENV_VAR } from "./managers/manager-agent.js";
export type {
  AgentEvent,
  AgentEventListener,
  AgentEventType,
  RunAgentOptions,
  RunAgentStreamInput,
} from "./managers/manager-agent.js";
export {
  buildManagedAgent,
  type BuildManagedAgentOptions,
  type BuildManagedAgentResult,
} from "./managers/agent-factory.js";
export { ManagedAgent, type ManagedAgentConfig, type RunFinalizeReason } from "./managers/managed-agent.js";
export type { AgentObserveHandlers } from "./managers/managed-agent-observe.js";
export { DEFAULT_OBSERVE_EVENTS } from "./managers/managed-agent-observe.js";
export { ACTIVE_STATUSES, isActiveStatus, isTerminalStatus, resolveFinishStatus } from "./managers/agent-status.js";
export type { AgentStatus } from "./managers/agent-types.js";
export { localConnect, createLocalConnect, type LocalConnectManager } from "./connect";
export { AgentChatController, formatChatError } from "./managers/agent-chat-controller.js";

// ============================================================================
// Agent state (hosts / UI)
// ============================================================================

export {
  areAllUIMessagesStable,
  computeSessionSyncSnapshot,
  createSessionSyncTracker,
  fingerprintUIMessage,
  isUIMessageStable,
  shouldPersistUIMessages,
} from "./agent/session/session-sync-tracker.js";
export type { SessionSaveReason, SessionSyncSnapshot } from "./agent/session/session-sync-tracker.js";
export { AgentContext, buildCanonicalModelMessages, type TokenUsage } from "./agent/agent-context";
export { AgentLog } from "./agent/agent-log";
export { TodoManager, type TodoItem, type TodoStatus, type TodoPriority, STATUS_ICONS } from "./agent/todo-manager";

// ============================================================================
// Session
// ============================================================================

export { SessionStore, type SessionMeta, type SessionData, type ResumeResult } from "./agent/session";

// ============================================================================
// Compaction (/compact command)
// ============================================================================

export { applyCompactionResult, autoCompact, estimateTokens, extractTextFromContent } from "./agent/compaction";

// ============================================================================
// Models & agent bootstrap helpers
// ============================================================================

export {
  DEFAULT_BASE_URLS,
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  parseModelStyle,
  resolveModelConfig,
  resolveModelConnection,
  lookupModelFromModelsDev,
  parseModelInfoFromEnv,
  runSideTextQuery,
} from "./models";
export type { ModelInfo, ModelStyle, ModelConnection, ResolvedModelConfig } from "./models";
export { resolveTextAdapterForManaged } from "./managers/run-agent.js";
export { buildDefaultSystemPrompt } from "./agent/default-prompt.js";
export { bridgeExternalToolToServer } from "./agent/tools/tanstack/bridge-external-tool.js";

// ============================================================================
// UI utilities
// ============================================================================

export { previewEdit, type PreviewEditResult } from "./agent/tools/util/preview-edit.js";
export { registerToUI, getToUI, clearToUI } from "./agent/tools/tanstack/to-ui-registry.js";
/** Streaming emit APIs (tools / UI channel). Hosts subscribe via {@link ManagedAgent.observe}. */
export {
  clearStreamingOutput,
  emitStreamingChunk,
  type StreamingChunk,
  type StreamingEmitOptions,
} from "./agent/tools/util/streaming-callback.js";

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

export { ExtensionRunner, ExtensionLoader } from "./agent/extension";
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
  InterceptableEvent,
  EventInterceptor,
} from "./agent/extension";

// ============================================================================
// Shared utilities
// ============================================================================

export { generateId, generateShortId, createSequentialIdGenerator } from "./agent/utils.js";
export { destroyAllCommandJobs } from "./agent/tools/util/command-job-registry.js";
export { formatAgentStreamError } from "./agent/utils/assert-async-iterable.js";
export {
  hasDeferredToolExecution,
  hasPendingAskUser,
  hasPendingToolApprovals,
  needsAgentResponseAfterTools,
  needsToolPhaseContinue,
  shouldContinueAgentPump,
} from "./agent/utils/tool-phase-utils.js";
