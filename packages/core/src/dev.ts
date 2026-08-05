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
} from "./agent/session/session-sync-tracker.js";
export type { SessionSaveReason, SessionSyncSnapshot } from "./agent/session/session-sync-tracker.js";
export { buildCanonicalModelMessages } from "./agent/agent-context/build-canonical-model-messages.js";
export { ACTIVE_STATUSES, isActiveStatus, isTerminalStatus, resolveFinishStatus } from "./managers/agent-status.js";
export { AgentEventBus } from "./managers/agent-event-bus.js";
export { attachEventLogBridge } from "./managers/event-log-bridge.js";
export { emitAgentEvent } from "./managers/emit-agent-event.js";
export { AgentLog } from "./agent/agent-log/agent-log.js";
export { Emitter } from "./utils/emitter.js";
export { UsageTracker } from "./managers/usage-tracker.js";
export {
  AGENT_SESSION_CHANNELS,
  DEFAULT_AGENT_SESSION_CHANNELS,
  DEFAULT_SESSION_LIFECYCLE_EVENTS,
  createLocalAgentSession,
  sessionForSubagent,
} from "./agent-session";
export { AgentUIChannel } from "./agent/ui-channel.js";
export { findToolCallPart, shouldSuppressReplayedToolChunk } from "./agent/utils/suppress-replayed-tool-chunks.js";
export { AgentChatController } from "./managers/agent-chat-controller.js";
export { finalizeManagedAgentRun } from "./managers/managed-agent-run-lifecycle.js";
export { PendingMessageQueue } from "./agent/utils/pending-message-queue.js";
export type { QueueMode } from "./agent/utils/pending-message-queue.js";
export { ManagedAgent } from "./managers/managed-agent.js";
export { RunCoordinator } from "./managers/run-coordinator.js";
export { createLocalConnect } from "./connect/local-connect.js";
export { createTextAdapter } from "./models/adapter-factory.js";
export { liftToolMediaForChatCompletions } from "./models/lift-tool-media-for-chat-completions.js";
export {
  buildReasoningContentFromThinking,
  extractReasoningContentFromStreamChunk,
  shouldEchoReasoningContent,
} from "./models/reasoning-echo.js";
export { runSideTextQuery } from "./models/side-text-query.js";
export { isPromptTooLongError } from "./agent/compaction/reactive-compact.js";
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
} from "./agent/utils/estimate-image-tokens.js";
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
export { resolveSubagentBridgeUI } from "./agent/subagent/types.js";
export {
  consumeAgentStream,
  ensureUIChannel,
  runAgentOnce,
  type RunAgentOnceOutcome,
} from "./agent/run/run-agent-skeleton.js";
export { generateId, resetGeneratedIdsForTesting } from "./agent/utils.js";
export { extractFileOpsFromMessages, formatFileOperations } from "./agent/compaction/file-ops-tracker.js";
export { applyToolCompact, createToolPlaceholder, ToolCompactCache, toModelOutputRegistry } from "./agent/compaction";
export {
  buildCompactArchiveMarkdown,
  buildCompactionPrompt,
  buildSegmentedConversationText,
  buildSummarizationUserPrompt,
  COMPACT_TRANSCRIPT_ROOT,
  extractCompactArchivePaths,
  findCutPoint,
  formatCompactArchivesSection,
  createCompactionSummaryUIMessage,
  findLatestSummaryIndex,
  formatCompactionSummaryContent,
  extractCompactionSummaryBody,
  getModelVisibleMessages,
  isCompactionSummaryModelMessage,
  isCompactionSummaryText,
  isCompactionSummaryUIMessage,
  maybeAppendCompactArchive,
  parseCompactSequence,
  serializeConversation,
  STILL_IN_CONTEXT_RULES,
  stripCompactArchiveSections,
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
export { toolsToArray } from "./agent/tools/tanstack/tools-record.js";
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
export { assertAsyncIterable, formatAgentStreamError } from "./agent/utils/assert-async-iterable.js";
export {
  applyToolDenialReason,
  buildToolDenialResultContent,
  DEFAULT_TOOL_DENIAL_MESSAGE,
} from "./agent/utils/apply-tool-denial-reason.js";
export {
  findLastMeaningfulAssistant,
  isEmptyAssistantShell,
  stripEmptyAssistantShells,
} from "./agent/utils/empty-assistant-shell.js";
export {
  EMPTY_MODEL_STREAM_MESSAGE,
  assistantProgressSignature,
  didStreamProduceModelOutput,
  shouldFlagEmptyModelStream,
} from "./agent/utils/empty-model-stream.js";
export { ReasoningContentCache } from "./models/reasoning-content-cache.js";
export { resolveReasoningContentForAssistant } from "./models/resolve-reasoning-content.js";
export {
  TOOL_CANCELLED_MESSAGE,
  cancelIncompleteToolCalls,
  hasCancellableIncompleteToolCalls,
  hasValidToolArguments,
  isCancellableIncompleteToolCall,
} from "./agent/utils/incomplete-tool-calls.js";
export {
  IMAGE_OMITTED_PLACEHOLDER,
  MULTIMODAL_OMITTED_PLACEHOLDER,
  MULTIMODAL_PART_CAPABILITY,
  chatMessagesHaveImages,
  chatMessagesHaveMultimodal,
  isMultimodalUnsupportedError,
  isVisionUnsupportedError,
  sanitizeMessagesForCapabilities,
  stripImagesFromChatMessages,
  stripMultimodalFromChatMessages,
  trySanitizeForMultimodalRetry,
  tryStripImagesForVisionRetry,
  unsupportedMultimodalPartTypes,
} from "./agent/utils/capability-message-utils.js";
export type { CapabilityProbe, MultimodalPartType } from "./agent/utils/capability-message-utils.js";
export {
  hasDeferredToolExecution,
  hasApprovedToolsPendingExecution,
  hasApprovalRespondedToolsPendingExecution,
  needsAgentResponseAfterTools,
  needsToolPhaseContinue,
  shouldContinueAgentPump,
  isToolContinuationPrepare,
  countPendingToolApprovals,
} from "./agent/utils/tool-phase-utils.js";
export { createTanStackSubagentTools, createTanStackTools, getReadOnlyTanStackToolNames } from "./agent/tools/tanstack";
export {
  clearStreamingOutput,
  emitStreamingChunk,
  getStreamingSubscriberCounts,
  resetStreamingCallbacksForTests,
  subscribeStreamingCallback,
  subscribeStreamingClearCallback,
} from "./agent/tools/util/streaming-callback.js";
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
