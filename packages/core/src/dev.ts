/**
 * Internal re-exports for core validation scripts (`pnpm validate:*`).
 * Not part of the public `@my-agent/core` package API.
 */

export {
  areAllUIMessagesStable,
  computeSessionSyncSnapshot,
  createSessionSyncTracker,
  fingerprintUIMessage,
  isUIMessageStable,
  shouldPersistUIMessages,
} from "./agent/persistence/session-sync-tracker.js";
export type { SessionSaveReason, SessionSyncSnapshot } from "./agent/persistence/session-sync-tracker.js";
export { ACTIVE_STATUSES, isActiveStatus, isTerminalStatus, resolveFinishStatus } from "./managers/agent-status.js";
export { AgentTelemetryBus } from "./managers/agent-telemetry-bus.js";
export { bridgeTelemetryToAgentLog } from "./managers/event-log-bridge.js";
export { emitAgentTelemetry } from "./managers/emit-agent-telemetry.js";
export { AgentLog } from "./agent/agent-log/agent-log.js";
export { Emitter } from "./utils/emitter.js";
export { UsageTracker } from "./managers/usage-tracker.js";
export {
  AGENT_SESSION_CHANNELS,
  DEFAULT_AGENT_SESSION_CHANNELS,
  DEFAULT_SESSION_LIFECYCLE_EVENTS,
  createLocalAgentSession,
  createLocalAgentSessionHost,
  sessionForSubagent,
} from "./agent-session";
export { AgentUIChannel } from "./agent/ui-channel.js";
export {
  findToolCallPart,
  shouldSuppressReplayedToolChunk,
} from "./agent/run-helpers/suppress-replayed-tool-chunks.js";
export { shouldSuppressMessagesSnapshot } from "./agent/run-helpers/suppress-messages-snapshot.js";
export { AgentChatController } from "./managers/agent-chat-controller.js";
export { finalizeManagedAgentRun } from "./managers/managed-agent-run-lifecycle.js";
export { PendingMessageQueue } from "./agent/run-helpers/pending-message-queue.js";
export type { QueueMode } from "./agent/run-helpers/pending-message-queue.js";
export { ManagedAgent } from "./managers/managed-agent.js";
export { RunCoordinator } from "./managers/run-coordinator.js";
export { createTextAdapter } from "./models/adapter-factory.js";
export { liftToolMediaForChatCompletions } from "./models/lift-tool-media-for-chat-completions.js";
export {
  buildReasoningContentFromThinking,
  extractReasoningContentFromStreamChunk,
  shouldEchoReasoningContent,
} from "./models/reasoning-echo.js";
export { runSideTextQuery } from "./models/side-text-query.js";
export { resolveTextAdapterForManaged } from "./managers/run-agent.js";
export { SessionStore } from "./agent/persistence/session-store.js";
export { autoCompact } from "./agent/compaction/auto-compact.js";
export { applyCompactionResult } from "./agent/compaction/apply-compaction-result.js";
export { isPromptTooLongError, reactiveCompact } from "./agent/compaction/reactive-compact.js";
export {
  extractRetryAfterSeconds,
  isTransientRetryableError,
  messagesForModelCapabilities,
  retryDelayMs,
  runStreamWithRecovery,
  tryReactiveCompactRetry,
} from "./managers/run-stream-recovery.js";
export { extractRunErrorMessage, throwOnRunError } from "./agent/stream/stream-errors.js";
export { formatReadFileToolResult } from "./agent/tools/util/format-read-file-result.js";
export {
  estimateImageInputTokens,
  estimateImageTokensFromDimensions,
  tryReadImageDimensions,
} from "./agent/run-helpers/estimate-image-tokens.js";
export {
  applyResolvedEdit,
  expandMatchVariants,
  formatNotFoundHint,
  resolveEditMatch,
  START_LINE_TOLERANCE,
  unescapeCommonEscapes,
} from "./agent/tools/util/find-edit-match.js";
export { BEGIN_SUMMARY_TOOL_NAME } from "./agent/subagent/begin-summary-tool.js";
export {
  mcpContentHasMultimodal,
  mcpContentToTanstack,
  resolveMcpToolExecuteResult,
  wrapMcpToolForMultimodalContent,
} from "./agent/mcp/prefer-multimodal-content.js";
export {
  extractAssistantText,
  getSummaryStreamText,
  resolveTaskRunPhase,
  shouldStreamTaskSummary,
} from "./agent/stream/extract-assistant-text.js";
export { countSubagentIterations, deriveSubagentRunStats, hasBeginSummaryCall } from "./agent/subagent/run-stats.js";
export { applySubagentCancelNotice, SUBAGENT_CANCELLED_NOTICE, truncateSummary } from "./agent/subagent/output.js";
export {
  buildProgressSummaryPrompt,
  isProgressSummaryEligible,
  PROGRESS_SUMMARY_MARKER,
  summarizeProgress,
} from "./agent/subagent/progress-summary.js";
export { resolveSubagentBridgeUI } from "./agent/subagent/types.js";
export { MAX_ACTIVE_TASK_PREFORKS, TaskPreforkCoordinator } from "./agent/subagent/task-prefork.js";
export { createTaskPreforkMiddleware } from "./managers/middleware/task-prefork-middleware.js";
export {
  consumeAgentStream,
  ensureUIChannel,
  runAgentOnce,
  type RunAgentOnceOutcome,
} from "./agent/run/run-agent-skeleton.js";
export { generateId, resetGeneratedIdsForTesting } from "./utils/generate-id.js";
export { extractFileOpsFromMessages, formatFileOperations } from "./agent/compaction/file-ops-tracker.js";
export { applyToolCompact, ToolCompactCache, toModelOutputRegistry } from "./agent/compaction";
export {
  buildCompactArchiveMarkdown,
  buildCompactionPrompt,
  buildSegmentedConversationText,
  buildSummarizationUserPrompt,
  COMPACT_TRANSCRIPT_ROOT,
  deriveKeepRecentTokens,
  extractCompactArchivePaths,
  findCutPoint,
  findCutPointByBudget,
  formatCompactArchivesSection,
  createCompactionSummaryUIMessage,
  findLatestSummaryIndex,
  formatCompactionSummaryContent,
  extractCompactionSummaryBody,
  getModelVisibleMessages,
  isCompactionSummaryModelMessage,
  isCompactionSummaryText,
  isCompactionSummaryUIMessage,
  isLatestDurableMessageCompactionSummary,
  keepPolicyProjectionOptions,
  maybeAppendCompactArchive,
  parseCompactSequence,
  resolveAutoCompactTrigger,
  resolveKeepPolicy,
  serializeConversation,
  STILL_IN_CONTEXT_RULES,
  stripCompactArchiveSections,
  TURN_PREFIX_INSTRUCTION,
  writeCompactArchive,
} from "./agent/compaction";
export { extractTextFromContent } from "./agent/compaction/message-utils.js";
export { clearCoreEnv, registerCoreEnv } from "./env.js";
export type { CoreEnv } from "./env.js";
export {
  createTimeoutAbort,
  filterResultsByDomain,
  getProviderManager,
  initializeProviders,
  resetWebsearchProviders,
} from "./agent/tools/websearch";
export { resolveSelectedMemoryFilename } from "./agent/memory/memory-retrieval.js";
export { MemoryManager } from "./agent/memory/memory-manager.js";
export { extractMemories, consolidateMemories } from "./agent/memory/memory-extractor.js";
export { findRelevantMemories, formatRelevantMemories } from "./agent/memory/memory-retrieval.js";
export type { RelevantMemory } from "./agent/memory/memory-retrieval.js";
export {
  DEFAULT_SUMMARIZATION_CONTEXT_WINDOW,
  resolveSummarizationInputBudget,
  splitMessagesByTokenBudget,
} from "./agent/compaction/summarization-budget.js";
export { estimateTokens } from "./agent/compaction/token-estimator.js";
export {
  createEarlyToolResultUiMiddleware,
  createExtensionsMiddleware,
  createLifecycleMiddleware,
} from "./managers/middleware";
export { createStatusMiddleware } from "./managers/middleware/status-middleware.js";
export { createApprovalResumeMiddleware } from "./managers/middleware/approval-resume-middleware.js";
export {
  ToolApprovalTable,
  approvalsToResumeMap,
  backfillApprovalsFromUIMessages,
  normalizeSessionApprovals,
} from "./agent/approval/tool-approval-table.js";
export {
  ExtensionLoader,
  ExtensionRunner,
  normalizeExtensionExport,
  isExtensionModuleFile,
  pathToFileUrl,
  DEFAULT_EXTENSION_DIR,
  getDefaultExtensionDirs,
  joinExtensionAppendSegments,
} from "./agent/extension";
export {
  buildSystemPromptWithTurnContext,
  buildDynamicTurnContext,
  buildFrozenSystemPrompt,
} from "./managers/managed-agent-prompt.js";
export { buildAutoModePrompt } from "./agent/approval/auto-mode-prompt.js";
export {
  TURN_CONTEXT_OPEN,
  TURN_CONTEXT_CLOSE,
  hashTurnContextPayload,
  buildTurnContextPayload,
  formatTurnContextUserContent,
  isTurnContextText,
  isTurnContextModelMessage,
  isTurnContextUIMessage,
  extractTurnContextPayload,
  findLatestTurnContextHash,
  insertTurnContextUIMessage,
} from "./agent/turn-context";
export {
  INSTRUCTION_FILENAMES,
  INSTRUCTION_MAX_BYTES,
  diffInstructionStates,
  formatInstructionContextSection,
  instructionStateChanged,
  loadLatestInstructionContent,
  readInstructionContextState,
} from "./agent/turn-context";
export type { InstructionContextState, InstructionFile } from "./agent/turn-context";
export {
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  ANTHROPIC_CACHE_BREAKPOINT_CAP,
  EPHEMERAL_CACHE_CONTROL,
  applyAnthropicLatestUserCacheBreakpoint,
  applyAnthropicToolCacheBreakpoint,
  buildAnthropicCachedSystemPrompts,
  resolvePromptCacheKey,
  shouldApplyAnthropicCacheBreakpoints,
  shouldApplyOpenAIPromptCacheKey,
  sortToolsByName,
  splitSystemPromptAtDynamicBoundary,
} from "./models/prompt-cache.js";
export { toolsToArray } from "./agent/tools/runtime/tools-record.js";
export { createPromptCacheMiddleware } from "./managers/middleware/prompt-cache-middleware.js";
export { createAgentStatusController, AgentStatusController } from "./managers/agent-status-controller.js";
export type {
  AgentRunOutcome,
  AgentRunOutcomeKind,
  AgentRunPath,
  StatusReconcilePolicy,
} from "./managers/agent-run-outcome.js";
export { whenClearForReconcilePolicy } from "./managers/agent-run-outcome.js";
export { AgentRunner } from "./agent/runner/agent-runner.js";
export { assertAsyncIterable, formatAgentStreamError } from "./agent/run-helpers/assert-async-iterable.js";
export {
  applyToolDenialReason,
  buildToolDenialResultContent,
  DEFAULT_TOOL_DENIAL_MESSAGE,
} from "./agent/run-helpers/apply-tool-denial-reason.js";
export {
  findLastMeaningfulAssistant,
  isEmptyAssistantShell,
  stripEmptyAssistantShells,
} from "./agent/run-helpers/empty-assistant-shell.js";
export {
  EMPTY_MODEL_STREAM_MESSAGE,
  assistantProgressSignature,
  didStreamProduceModelOutput,
  shouldFlagEmptyModelStream,
} from "./agent/run-helpers/empty-model-stream.js";
export { ReasoningContentCache } from "./models/reasoning-content-cache.js";
export { resolveReasoningContentForAssistant } from "./models/resolve-reasoning-content.js";
export {
  TOOL_CANCELLED_MESSAGE,
  cancelIncompleteToolCalls,
  hasCancellableIncompleteToolCalls,
  hasValidToolArguments,
  isCancellableIncompleteToolCall,
} from "./agent/run-helpers/incomplete-tool-calls.js";
export {
  MULTIMODAL_OMITTED_PLACEHOLDER,
  MULTIMODAL_PART_CAPABILITY,
  chatMessagesHaveMultimodal,
  isMultimodalUnsupportedError,
  sanitizeMessagesForCapabilities,
  stripMultimodalFromChatMessages,
  trySanitizeForMultimodalRetry,
  unsupportedMultimodalPartTypes,
} from "./agent/run-helpers/capability-message-utils.js";
export type { CapabilityProbe, MultimodalPartType } from "./agent/run-helpers/capability-message-utils.js";
export {
  hasDeferredToolExecution,
  hasApprovedToolsPendingExecution,
  hasApprovalRespondedToolsPendingExecution,
  needsAgentResponseAfterTools,
  needsToolPhaseContinue,
  shouldContinueAgentPump,
  isToolContinuationPrepare,
  countPendingToolApprovals,
} from "./agent/run-helpers/tool-phase-utils.js";
export { isStaleActiveRunStatus, shouldDeferMidRunQueue } from "./agent/run-helpers/defer-mid-run-queue.js";
export { createTanStackSubagentTools, createTanStackTools, getReadOnlyTanStackToolNames } from "./agent/tools/runtime";
export {
  clearStreamingOutput,
  emitStreamingChunk,
  getStreamingSubscriberCounts,
  resetStreamingCallbacksForTests,
  subscribeStreamingCallback,
  subscribeStreamingClearCallback,
} from "./agent/tools/util/streaming-callback.js";
export {
  SUMMARY_STREAM_SNAPSHOT_LINE_CAP,
  SummaryStreamHub,
  applyAppendToDisplayWindow,
  applySummaryStreamAppend,
  displayWindowFromSnapshot,
  emptySummaryDisplayWindow,
  emptySummaryLineBuffer,
  renderSummaryDisplayRows,
  compactSummaryStreamId,
  summaryStreamKey,
} from "./agent/summary-stream";
export { commandJobRegistry } from "./agent/tools/util/command-job-registry.js";
export type { CommandJobRecord, CommandJobPollResult } from "./agent/tools/util/command-job-registry.js";
export {
  PlanModeController,
  cleanStepText,
  extractDoneSteps,
  extractPlan,
  isSafeCommand,
  getPlanModeToolExcludeSet,
  getPlanModeToolBlockReason,
  isMcpToolName,
  isPlanModeForbiddenTool,
  PLAN_AUTHORING_TOOL_NAMES,
  PLAN_COMPLETION_TOOL_NAMES,
  PLAN_MODE_EXCLUDED_TOOL_NAMES,
  PLAN_STORE_DIR,
  PLAN_TODO_TITLE,
  formatPlanModeFooterLabel,
  todoProgressFromItems,
  formatStructuredPlanMarkdown,
  formatPlanSummary,
  extractGoalFromPlanMarkdown,
  slugifyPlanName,
  planFilePath,
  stepsFromTexts,
  stripLeadingStepNumber,
  buildPlanModePrompt,
  buildPlanModePlanningPrompt,
  buildPlanModeReadyPrompt,
  buildPlanModeRetroPrompt,
  buildPlanRetroSteerMessage,
  createPlanModeMiddleware,
  gateCompletePlanVerification,
  isUsableVerification,
  parseVerificationItemsFromPlanMarkdown,
  parseVerificationItemsFromText,
} from "./agent/plan";
export type {
  BeginPlanExecutionResult,
  ApplyPlanResult,
  PlanModePhase,
  PlanModeState,
  PlanStep,
  ExtractedPlan,
  StructuredPlanInput,
  VerificationResultItem,
} from "./agent/plan";
export { TodoManager } from "./agent/todo-manager";
export {
  getMediaStore,
  resetMediaStore,
  extractBase64Content,
  buildDataUrl,
  sha256Stable,
} from "./agent/media/media-store.js";
export { MediaStore } from "./agent/media/media-store.js";
export type { MediaRef } from "./agent/media/types.js";
export { MEDIA_DIR, mimeToExtension, parseMediaRefPath, buildMediaRefPath } from "./agent/media/types.js";
export { dehydrateUIMessages, hydrateUIMessages } from "./agent/media/media-utils.js";
export { applyRestoredSessionChatState } from "./managers/managed-agent-session.js";
export {
  repairMessagesSnapshotChunk,
  repairStringifiedMultimodalUIMessages,
  parseStringifiedMultimodalContent,
  isStringifiedMultimodalContentParts,
} from "./agent/media/repair-stringified-multimodal.js";

// ============================================================================
// Built-in LSP extension (internal validation exports — not part of public API)
// ============================================================================
export { createLspExtension, lspExtension } from "./agent/lsp";
export { DEFAULT_DISABLED_LSP_TOOLS } from "./agent/lsp";
export type { LspExtensionConfig } from "./agent/lsp";
export { EXT_TO_LANGUAGE, getLanguageIdFromPath } from "./agent/lsp/language-map.js";
export {
  LspManager,
  type LspServerConfigRecord,
  type ServerStatus,
  type LspClient,
  type LspManagerCallbacks,
} from "./agent/lsp/lsp-manager.js";
export { findLombokJar } from "./agent/lsp/lombok.js";
export { applyDiagnosticsToToolAfterPayload } from "./agent/lsp/shared/apply-tool-diagnostics.js";
export { extractToolPath, parseToolCallArgs } from "./agent/lsp/shared/parse-tool-args.js";
export { insertDot, shouldSyntheticTrigger, syntheticDotLocks } from "./agent/lsp/shared/synthetic-dot.js";
export { DIAGNOSTIC_SETTLE_DELAY_MS, SYNTHETIC_DOT_SETTLE_DELAY_MS } from "./agent/lsp/shared/timing.js";
export { lspTextToModelOutput } from "./agent/lsp/shared/tool-output.js";

// ============================================================================
// Built-in Memory extension (internal validation exports — not part of public API)
// ============================================================================
export {
  createMemoryExtension,
  memoryExtension,
  type MemoryExtensionConfig,
  type CreateMemoryExtensionOptions,
} from "./agent/memory";

// ============================================================================
// Built-in Skills extension (internal validation exports — not part of public API)
// ============================================================================
export {
  SkillRegistry,
  SkillLoader,
  createSkillsExtension,
  skillsExtension,
  type SkillsExtensionConfig,
  type CreateSkillsExtensionOptions,
} from "./agent/skills";
export { SKILL_DIRS_ENV_VAR, getDefaultSkillDirs } from "./managers/agent-manager.js";
