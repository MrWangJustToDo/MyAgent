/**
 * Internal validation exports — manager / runtime orchestration modules.
 * Aggregated by `dev.ts`; not part of the public API.
 */

export {
  ACTIVE_STATUSES,
  isActiveStatus,
  isTerminalStatus,
  resolveFinishStatus,
} from "../runtime-types/agent-status.js";
export {
  DefaultAgentEventBus,
  createAgentEventBus,
  AGENT_EVENT_META,
  INTERCEPTOR_EVENT_PATTERNS,
} from "../agent/agent-event-bus/index.js";
export type {
  AgentEvent,
  AgentEventBus,
  AgentEventListener,
  AgentEventMeta,
  AgentEvents,
  AgentEventType,
  AgentEventPayloadMap,
} from "../agent/agent-event-bus/index.js";
export { bridgeTelemetryToAgentLog, summarizePayload } from "../managers/telemetry/event-log-bridge.js";
export { emitAgentTelemetry } from "../managers/telemetry/emit-agent-telemetry.js";
export { UsageTracker } from "../managers/telemetry/usage-tracker.js";
export { AgentChatController } from "../managers/controllers/agent-chat-controller.js";
export { finalizeManagedAgentRun } from "../managers/managed-agent-run-lifecycle.js";
export { ManagedAgent } from "../managers/managed-agent.js";
export { RunCoordinator, type RunToken } from "../managers/run-coordinator.js";
export { CompactionService } from "../managers/services/compaction-service.js";
export { SessionService } from "../managers/services/session-service.js";
export { resolveTextAdapterForManaged } from "../managers/run-agent.js";
export {
  armCapabilityStrip,
  extractRetryAfterSeconds,
  isTransientRetryableError,
  retryDelayMs,
  runStreamWithRecovery,
  tryCapabilitySanitizeRetry,
  tryReactiveCompactRetry,
} from "../managers/run-stream-recovery.js";
export { createTaskPreforkMiddleware } from "../managers/middleware/task-prefork-middleware.js";
export {
  createEarlyToolResultUiMiddleware,
  createExtensionsMiddleware,
  createLifecycleMiddleware,
  instrumentMiddlewareLog,
} from "../managers/middleware";
export { createStatusMiddleware } from "../managers/middleware/status-middleware.js";
export { createApprovalResumeMiddleware } from "../managers/middleware/approval-resume-middleware.js";
export {
  buildSystemPromptWithTurnContext,
  buildTurnContextSections,
  buildProjectInstructionsSection,
  buildFrozenSystemPrompt,
} from "../managers/managed-agent-prompt.js";
export { createPromptCacheMiddleware } from "../managers/middleware/prompt-cache-middleware.js";
// Exported for `validate:middleware-order`, which drives the real pipeline assembly
// instead of duplicating the factory list (see that script's section 1).
export { buildAgentRunner } from "../managers/run-agent.js";

export { deriveCapabilities, MODELS_DEV_COST_FIELDS, MODELS_DEV_MODEL_FIELDS } from "../models/provider/models-dev.js";
export { MODEL_CAPABILITIES } from "../models/types.js";

// Drives `validate:capability-unknown-vs-none`: the `undefined` (unknown) vs `[]` (declared
// none) distinction has to survive the metadata merge, and that merge is only reachable here.
export { resolveModelConfig } from "../models/config/model-config.js";
export { MODEL_CAPABILITY_FLAGS } from "../agent/extension/types.js";

export {
  assertCanonicalMiddlewareOrder,
  CANONICAL_MIDDLEWARE_ORDER,
  createBackgroundNotificationMiddleware,
  createCompactionMiddleware,
  createMessageTransformMiddleware,
  createWireRecoveryMiddleware,
  createPlanModeMiddleware,
  createToolCompactMiddleware,
  createTurnContextMiddleware,
  defineMiddleware,
  sortMiddlewaresByPhase,
  MIDDLEWARE_PHASE_RANK,
} from "../managers/middleware/index.js";
export type { MiddlewarePhase } from "../managers/middleware";
export { CONTINUATION_PROMPT } from "../managers/stream-recovery/max-tokens-continue.js";
export {
  createTruncationState,
  handleMaxTokensTruncation,
} from "../managers/stream-recovery/max-tokens-continue.js";
export { createAgentStatusController, AgentStatusController } from "../managers/controllers/agent-status-controller.js";
export type {
  AgentRunOutcome,
  AgentRunOutcomeKind,
  AgentRunPath,
  StatusReconcilePolicy,
} from "../managers/agent-run-outcome.js";
export { whenClearForReconcilePolicy } from "../managers/agent-run-outcome.js";
export { applyRestoredSessionChatState, getSessionPersistInput, restoreManagedSession } from "../managers/managed-agent-session.js";
export { SKILL_DIRS_ENV_VAR, getDefaultSkillDirs } from "../managers/agent-manager.js";
