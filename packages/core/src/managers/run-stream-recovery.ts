import { extractRunErrorMessage } from "../agent/stream/stream-errors.js";
import { assertAsyncIterable } from "../agent/utils/assert-async-iterable.js";

import { messagesForModelCapabilities, tryCapabilitySanitizeRetry } from "./stream-recovery/capability-sanitize.js";
import { createTruncationState, handleMaxTokensTruncation } from "./stream-recovery/max-tokens-continue.js";
import { tryReactiveCompactRetry } from "./stream-recovery/reactive-compact.js";

import type { AgentManager } from "./agent-manager.js";
import type { ManagedAgent } from "./managed-agent.js";
import type { AgentRunner } from "../agent/runner/agent-runner.js";
import type { ModelMessage, StreamChunk, UIMessage } from "@tanstack/ai";

export { messagesForModelCapabilities } from "./stream-recovery/capability-sanitize.js";
export { tryReactiveCompactRetry } from "./stream-recovery/reactive-compact.js";
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

  const stripped = tryCapabilitySanitizeRetry(options.managed, error, currentMessages, multimodalStripAttempted);
  if (stripped) {
    return { messages: stripped, multimodalStripAttempted: true };
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
  const truncation = createTruncationState();

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
      }
    }

    if (!shouldRetry) return;

    const delay = retryDelayMs(recoveryAttempts);
    options.managed.log?.debug("agent", "Backoff before retry", {
      attempt: recoveryAttempts,
      delayMs: Math.round(delay),
    });
    await new Promise((resolve) => setTimeout(resolve, delay));

    recoveryAttempts++;
  }
}
