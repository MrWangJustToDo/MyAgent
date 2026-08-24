import { assertAsyncIterable } from "../agent/run-helpers/assert-async-iterable.js";
import { extractRunErrorMessage } from "../agent/stream/stream-errors.js";

import { messagesForModelCapabilities, tryCapabilitySanitizeRetry } from "./stream-recovery/capability-sanitize.js";
import {
  createTruncationState,
  handleMaxTokensTruncation,
  MAX_TRUNCATION_CONTINUATIONS,
} from "./stream-recovery/max-tokens-continue.js";
import { tryReactiveCompactRetry } from "./stream-recovery/reactive-compact.js";
import { extractRetryAfterSeconds, isTransientRetryableError } from "./stream-recovery/transient-retry.js";

import type { AgentManager } from "./agent-manager.js";
import type { ManagedAgent } from "./managed-agent.js";
import type { AgentRunner } from "../agent/runner/agent-runner.js";
import type { AgentRetryStrategy, AgentRetryState } from "../runtime-types/agent-retry.js";
import type { ModelMessage, StreamChunk, UIMessage } from "@tanstack/ai";

export { messagesForModelCapabilities } from "./stream-recovery/capability-sanitize.js";
export { tryReactiveCompactRetry } from "./stream-recovery/reactive-compact.js";
export { extractRetryAfterSeconds, isTransientRetryableError } from "./stream-recovery/transient-retry.js";
export {
  CONTINUATION_PROMPT,
  ESCALATED_MAX_TOKENS,
  MAX_TRUNCATION_CONTINUATIONS,
  handleMaxTokensTruncation,
} from "./stream-recovery/max-tokens-continue.js";

// ============================================================================
// Constants
// ============================================================================

/** Max bytes for backoff delay calculation. */
const MAX_RETRY_BACKOFF_MS = 32000;
/** Base delay for exponential backoff. */
const BASE_RETRY_DELAY_MS = 500;
/** Max number of overall recovery attempts (reactive compact, multimodal strip, truncation, backoff). */
const MAX_RECOVERY_ATTEMPTS = 3;

// ============================================================================
// Helpers
// ============================================================================

function errorFromUnknown(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Exponential backoff with jitter.
 *
 * delay = min(BASE_RETRY_DELAY_MS × 2^attempt, MAX_RETRY_BACKOFF_MS) + random(0~25%)
 * If a `retryAfter` value is provided (from Retry-After header), use it directly.
 */
export function retryDelayMs(attempt: number, retryAfter?: number): number {
  if (retryAfter != null && retryAfter > 0) return retryAfter * 1000;
  const base = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_BACKOFF_MS);
  return base + Math.random() * base * 0.25;
}

// ============================================================================
// Recovery helpers
// ============================================================================

interface RecoveryResult {
  messages: Array<UIMessage | ModelMessage>;
  multimodalStripAttempted: boolean;
  /** Which recovery strategy matched — drives UI retry visibility. */
  strategy: AgentRetryStrategy;
  /** Prefer provider Retry-After when present (seconds). */
  retryAfterSeconds?: number;
}

interface AttemptRecoveryOptions {
  managed: ManagedAgent;
  manager: AgentManager;
  getMessages: () => Array<UIMessage | ModelMessage>;
}

async function attemptErrorRecovery(
  options: AttemptRecoveryOptions,
  error: unknown,
  currentMessages: Array<UIMessage | ModelMessage>,
  multimodalStripAttempted: boolean,
  recoveryAttempts: number
): Promise<RecoveryResult | null> {
  if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
    options.managed.log?.error(
      "agent",
      `Max recovery attempts (${MAX_RECOVERY_ATTEMPTS}) exceeded`,
      errorFromUnknown(error)
    );
    return null;
  }

  const compactHandled = await tryReactiveCompactRetry(options.managed, options.manager, error);
  if (compactHandled) {
    return {
      messages: messagesForModelCapabilities(options.managed, options.getMessages()),
      multimodalStripAttempted,
      strategy: "reactive_compact",
    };
  }

  const stripped = tryCapabilitySanitizeRetry(options.managed, error, currentMessages, multimodalStripAttempted);
  if (stripped) {
    return { messages: stripped, multimodalStripAttempted: true, strategy: "capability" };
  }

  // Same messages + backoff (429 / gateway / network). Applies to root and subagents.
  if (isTransientRetryableError(error)) {
    const retryAfterSeconds = extractRetryAfterSeconds(error);
    options.managed.log?.warn("agent", "Transient provider error — retrying with backoff", {
      attempt: recoveryAttempts + 1,
      maxAttempts: MAX_RECOVERY_ATTEMPTS,
      retryAfterSeconds,
      error: errorFromUnknown(error).message,
    });
    options.managed.setError("");
    return {
      messages: messagesForModelCapabilities(options.managed, currentMessages),
      multimodalStripAttempted,
      strategy: "transient",
      ...(retryAfterSeconds != null ? { retryAfterSeconds } : {}),
    };
  }

  return null;
}

/**
 * Surface a pending retry to hosts: L1 `retry` state (state channel / snapshot)
 * plus an `agent:retry` telemetry event (lifecycle channel + log bridge).
 */
function recordRetry(managed: ManagedAgent, retry: AgentRetryState): void {
  managed.setRetry?.(retry);
  managed.emitEvent?.("agent:retry", {
    attempt: retry.attempt,
    maxAttempts: retry.maxAttempts,
    strategy: retry.strategy,
    ...(retry.error ? { error: retry.error } : {}),
    ...(retry.delayMs != null ? { delayMs: retry.delayMs } : {}),
    ...(retry.retryAfterSeconds != null ? { retryAfterSeconds: retry.retryAfterSeconds } : {}),
  });
}

// ============================================================================
// Stream wrapper
// ============================================================================

export interface RecoveryOptions {
  managed: ManagedAgent;
  manager: AgentManager;
  getMessages: () => Array<UIMessage | ModelMessage>;
  run: (messages: Array<UIMessage | ModelMessage>) => AsyncIterable<StreamChunk>;
  /** Optional — needed for max_tokens escalation on truncation */
  runner?: AgentRunner;
}

export async function* runStreamWithRecovery(options: RecoveryOptions): AsyncIterable<StreamChunk> {
  let messages = messagesForModelCapabilities(options.managed, options.getMessages());
  let multimodalStripAttempted = false;
  let recoveryAttempts = 0;
  let clearRetryOnNextChunk = false;
  const truncation = createTruncationState();

  while (true) {
    let shouldRetry = false;
    let truncationDetected = false;
    let retryAfterSeconds: number | undefined;
    let lastErrorMessage = "";
    let retryStrategy: AgentRetryStrategy | undefined;
    const stream = options.run(messages);
    assertAsyncIterable<StreamChunk>(stream, "AgentRunner.run");

    try {
      for await (const chunk of stream) {
        if (clearRetryOnNextChunk && chunk.type !== "RUN_ERROR") {
          // Stream recovered after a retry — hide retry visibility again.
          clearRetryOnNextChunk = false;
          options.managed.setRetry?.(null);
        }

        if (chunk.type === "RUN_ERROR") {
          const runError = errorFromUnknown(extractRunErrorMessage(chunk) || "Agent run failed");
          lastErrorMessage = runError.message;
          const result = await attemptErrorRecovery(
            options,
            runError,
            messages,
            multimodalStripAttempted,
            recoveryAttempts
          );
          if (result) {
            shouldRetry = true;
            messages = result.messages;
            multimodalStripAttempted = result.multimodalStripAttempted;
            retryAfterSeconds = result.retryAfterSeconds;
            retryStrategy = result.strategy;
            break;
          }
          throw runError;
        }

        // Detect output token limit before yielding RUN_FINISHED
        if (chunk.type === "RUN_FINISHED") {
          const finishReason = (chunk as { finishReason?: string }).finishReason;
          if (finishReason === "length") {
            truncationDetected = true;
            break;
          }
        }

        yield chunk;
      }
    } catch (error) {
      if (!shouldRetry) {
        lastErrorMessage = errorFromUnknown(error).message;
        const result = await attemptErrorRecovery(options, error, messages, multimodalStripAttempted, recoveryAttempts);
        if (result) {
          shouldRetry = true;
          messages = result.messages;
          multimodalStripAttempted = result.multimodalStripAttempted;
          retryAfterSeconds = result.retryAfterSeconds;
          retryStrategy = result.strategy;
        } else {
          throw error;
        }
      }
    }

    if (truncationDetected) {
      const truncationResult = handleMaxTokensTruncation({
        managed: options.managed,
        runner: options.runner,
        messages,
        truncation,
      });
      if (truncationResult.shouldRetry && truncationResult.messages) {
        messages = truncationResult.messages;
        shouldRetry = true;
        lastErrorMessage = "";
        retryStrategy = "max_tokens";
      }
    }

    if (!shouldRetry) return;

    // Restart-style recovery (transient / capability / reactive): clear subagent
    // preview so the task panel does not keep stale tools/summary across retries.
    // Max-tokens continuation appends to the same turn — do not reset UI.
    if (!truncationDetected) {
      prepareRestartStyleRetry(options);
    }

    const delay = retryDelayMs(recoveryAttempts, retryAfterSeconds);

    // Surface retry progress to the UI + telemetry (attempt is 1-based).
    recordRetry(options.managed, {
      attempt: recoveryAttempts + 1,
      maxAttempts: truncationDetected ? MAX_TRUNCATION_CONTINUATIONS : MAX_RECOVERY_ATTEMPTS,
      strategy: retryStrategy!,
      ...(lastErrorMessage ? { error: lastErrorMessage } : {}),
      delayMs: Math.round(delay),
      ...(retryAfterSeconds != null ? { retryAfterSeconds } : {}),
      startedAt: Date.now(),
    });
    clearRetryOnNextChunk = !truncationDetected;

    options.managed.log?.debug("agent", "Backoff before retry", {
      attempt: recoveryAttempts,
      delayMs: Math.round(delay),
      retryAfterSeconds,
    });
    await new Promise((resolve) => setTimeout(resolve, delay));

    recoveryAttempts++;
  }
}

/**
 * Before a full stream restart: soft-reset subagent UI + clear error status.
 * Wire `messages` stay as set by the recovery strategy (may be capability-stripped).
 */
function prepareRestartStyleRetry(options: RecoveryOptions): void {
  if (options.managed.parentId && options.managed.ui) {
    options.managed.ui.resetForStreamRetry();
  }
  options.managed.setError("");
  options.managed.statusController?.onRecoveryRetry?.();
}
