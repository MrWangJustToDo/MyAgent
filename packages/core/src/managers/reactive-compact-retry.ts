import { isPromptTooLongError } from "../agent/compaction/reactive-compact.js";
import { extractRunErrorMessage } from "../agent/subagent/stream-errors.js";
import { assertAsyncIterable } from "../agent/utils/assert-async-iterable.js";
import {
  sanitizeMessagesForCapabilities,
  trySanitizeForMultimodalRetry,
  unsupportedMultimodalPartTypes,
} from "../agent/utils/capability-message-utils.js";

import type { ManagedAgent } from "./managed-agent.js";
import type { AgentManager } from "./manager-agent.js";
import type { AgentRunner } from "../agent/runner/agent-runner.js";
import type { ModelMessage, StreamChunk, UIMessage } from "@tanstack/ai";

// ============================================================================
// Constants
// ============================================================================

/** Max bytes for backoff delay calculation. */
const MAX_RETRY_BACKOFF_MS = 32000;
/** Base delay for exponential backoff. */
const BASE_RETRY_DELAY_MS = 500;
/** Max number of overall recovery attempts (reactive compact, multimodal strip, truncation, backoff). */
const MAX_RECOVERY_ATTEMPTS = 3;
/** Max number of truncation continuation retries after max_tokens escalation. */
const MAX_TRUNCATION_CONTINUATIONS = 3;
/** Escalated max output tokens for the first truncation retry. */
const ESCALATED_MAX_TOKENS = 64000;

/**
 * Continuation prompt injected when the model hits max_tokens.
 * Tells the model to resume directly without apology or recap.
 */
const CONTINUATION_PROMPT =
  "Output token limit hit. Resume directly — no apology, no recap of what you were doing. Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces.";

// ============================================================================
// Helpers
// ============================================================================

export { extractRunErrorMessage };

function errorFromUnknown(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Exponential backoff with jitter.
 *
 * delay = min(BASE_RETRY_DELAY_MS × 2^attempt, MAX_RETRY_BACKOFF_MS) + random(0~25%)
 * If a `retryAfter` value is provided (from Retry-After header), use it directly.
 */
function retryDelayMs(attempt: number, retryAfter?: number): number {
  if (retryAfter != null && retryAfter > 0) return retryAfter * 1000;
  const base = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_BACKOFF_MS);
  return base + Math.random() * base * 0.25;
}

async function applyReactiveCompactRetry(managed: ManagedAgent): Promise<boolean> {
  if (!managed.getContext()) return false;
  managed.statusController.endCompaction();
  managed.setError("");
  return true;
}

export async function tryReactiveCompactRetry(
  managed: ManagedAgent,
  manager: AgentManager,
  error: unknown
): Promise<boolean> {
  if (managed.parentId) return false;
  if (!isPromptTooLongError(error)) return false;

  const compacted = await managed.handleReactiveCompact(error, manager);
  if (!compacted) return false;

  return applyReactiveCompactRetry(managed);
}

/** Prepare messages for the wire: drop multimodal parts the model cannot accept. */
export function messagesForModelCapabilities(
  managed: ManagedAgent,
  messages: Array<UIMessage | ModelMessage>
): Array<UIMessage | ModelMessage> {
  const probe = managed.usage ?? null;
  const drop = unsupportedMultimodalPartTypes(probe);
  if (drop.size === 0) return messages;

  const sanitized = sanitizeMessagesForCapabilities(messages, probe);
  if (sanitized !== messages) {
    managed.log?.warn(
      "agent",
      `Stripping unsupported multimodal parts for model capabilities: ${[...drop].join(", ")}`
    );
  }
  return sanitized;
}

// ============================================================================
// Truncation recovery state
// ============================================================================

interface TruncationState {
  maxTokensEscalated: boolean;
  continuationCount: number;
}

// ============================================================================
// Recovery helpers
// ============================================================================

interface RecoveryResult {
  messages: Array<UIMessage | ModelMessage>;
  multimodalStripAttempted: boolean;
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
    };
  }

  if (!multimodalStripAttempted) {
    const stripped = trySanitizeForMultimodalRetry(error, currentMessages);
    if (stripped) {
      options.managed.log?.warn(
        "agent",
        "Retrying without multimodal parts after capability/schema API error (UI history unchanged)"
      );
      options.managed.setError("");
      return { messages: stripped, multimodalStripAttempted: true };
    }
  }

  return null;
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
  const truncation: TruncationState = {
    maxTokensEscalated: false,
    continuationCount: 0,
  };

  while (true) {
    let shouldRetry = false;
    let truncationDetected = false;
    const stream = options.run(messages);
    assertAsyncIterable<StreamChunk>(stream, "AgentRunner.run");

    try {
      for await (const chunk of stream) {
        if (chunk.type === "RUN_ERROR") {
          const runError = errorFromUnknown(extractRunErrorMessage(chunk) || "Agent run failed");
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
        const result = await attemptErrorRecovery(options, error, messages, multimodalStripAttempted, recoveryAttempts);
        if (result) {
          shouldRetry = true;
          messages = result.messages;
          multimodalStripAttempted = result.multimodalStripAttempted;
        } else {
          throw error;
        }
      }
    }

    // ========================================================================
    // Truncation handling (finishReason === "length")
    // ========================================================================

    if (truncationDetected) {
      if (!truncation.maxTokensEscalated && options.runner) {
        // First truncation: escalate max_tokens and retry same messages
        options.runner.setMaxOutputTokens(ESCALATED_MAX_TOKENS);
        truncation.maxTokensEscalated = true;
        shouldRetry = true;

        options.managed.log?.debug("agent", "Output truncated — escalating max_tokens", {
          escalatedTokens: ESCALATED_MAX_TOKENS,
        });
      } else if (truncation.continuationCount < MAX_TRUNCATION_CONTINUATIONS) {
        // Subsequent truncations: inject continuation prompt
        const contextMessages =
          options.managed.getContext()?.getMessagesForLLM() ?? (messages as Array<UIMessage | ModelMessage>);
        messages = [...contextMessages, { role: "user" as const, content: CONTINUATION_PROMPT }];
        truncation.continuationCount++;
        shouldRetry = true;

        options.managed.log?.debug("agent", "Output truncated — injecting continuation prompt", {
          continuationCount: truncation.continuationCount,
        });
      } else {
        // Max continuation retries exceeded — yield RUN_FINISHED 'length' as-fallback
        options.managed.log?.warn("agent", "Output truncated — max continuations reached, returning partial result");
        // The stream ends naturally (no more retry)
      }
    }

    if (!shouldRetry) return;

    // ========================================================================
    // Exponential backoff: wait before retrying
    // ========================================================================

    const delay = retryDelayMs(recoveryAttempts);
    options.managed.log?.debug("agent", "Backoff before retry", {
      attempt: recoveryAttempts,
      delayMs: Math.round(delay),
    });
    await new Promise((resolve) => setTimeout(resolve, delay));

    recoveryAttempts++;
  }
}
