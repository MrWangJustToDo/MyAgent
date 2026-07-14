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
export { AgentContext, buildCanonicalModelMessages } from "./agent/agent-context/agent-context.js";
export { ACTIVE_STATUSES, isActiveStatus, isTerminalStatus, resolveFinishStatus } from "./managers/agent-status.js";
export { AgentEventBus } from "./managers/agent-event-bus.js";
export { attachEventLogBridge } from "./managers/event-log-bridge.js";
export { emitAgentEvent } from "./managers/emit-agent-event.js";
export { AgentLog } from "./agent/agent-log/agent-log.js";
export { AgentUIChannel } from "./managers/agent-ui-channel.js";
export { AgentChatController } from "./managers/agent-chat-controller.js";
export { ManagedAgent } from "./managers/managed-agent.js";
export { RunCoordinator } from "./managers/run-coordinator.js";
export { createLocalConnect } from "./connect/local-connect.js";
export { createTextAdapter } from "./models/adapter-factory.js";
export {
  buildReasoningContentFromThinking,
  extractReasoningContentFromStreamChunk,
  shouldEchoReasoningContent,
} from "./models/reasoning-echo.js";
export { runSideTextQuery } from "./models/side-text-query.js";
export { isPromptTooLongError } from "./agent/compaction/reactive-compact.js";
export { extractRunErrorMessage } from "./managers/reactive-compact-retry.js";
export { formatReadFileToolResult } from "./agent/tools/util/format-read-file-result.js";
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
} from "./agent/subagent/extract-assistant-text.js";
export { countSubagentIterations, deriveSubagentRunStats } from "./agent/subagent/run-stats.js";
export { resolveSubagentBridgeUI } from "./agent/subagent/types.js";
export { extractFileOpsFromMessages, formatFileOperations } from "./agent/compaction/file-ops-tracker.js";
export {
  applyToolCompact,
  createToolPlaceholder,
  ToolCompactCache,
  toModelOutputRegistry,
} from "./agent/compaction/index.js";
export { extractTextFromContent } from "./agent/compaction/message-utils.js";
export {
  DEFAULT_SUMMARIZATION_CONTEXT_WINDOW,
  resolveSummarizationInputBudget,
  splitMessagesByTokenBudget,
} from "./agent/compaction/summarization-budget.js";
export { estimateTokens } from "./agent/compaction/token-estimator.js";
export { createHooksMiddleware, createLifecycleMiddleware } from "./agent/middleware";
export { createStatusMiddleware } from "./agent/middleware/status-middleware.js";
export { createAgentStatusController, AgentStatusController } from "./managers/agent-status-controller.js";
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
  subscribeStreamingCallback,
  subscribeStreamingClearCallback,
} from "./agent/tools/util/streaming-callback.js";
