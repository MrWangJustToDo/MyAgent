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
import type { ModelMessage, StreamChunk, UIMessage } from "@tanstack/ai";

// ============================================================================
// Constants
// ============================================================================

const MAX_RECOVERY_ATTEMPTS = 3;

// ============================================================================
// Helpers
// ============================================================================

export { extractRunErrorMessage };

function errorFromUnknown(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
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

async function attemptRecovery(
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
}

export async function* runStreamWithRecovery(options: RecoveryOptions): AsyncIterable<StreamChunk> {
  let messages = messagesForModelCapabilities(options.managed, options.getMessages());
  let multimodalStripAttempted = false;
  let recoveryAttempts = 0;

  while (true) {
    let shouldRetry = false;
    const stream = options.run(messages);
    assertAsyncIterable<StreamChunk>(stream, "AgentRunner.run");

    try {
      for await (const chunk of stream) {
        if (chunk.type === "RUN_ERROR") {
          const runError = errorFromUnknown(extractRunErrorMessage(chunk) || "Agent run failed");
          const result = await attemptRecovery(options, runError, messages, multimodalStripAttempted, recoveryAttempts);
          if (result) {
            shouldRetry = true;
            messages = result.messages;
            multimodalStripAttempted = result.multimodalStripAttempted;
            break;
          }
          throw runError;
        }
        yield chunk;
      }
    } catch (error) {
      if (!shouldRetry) {
        const result = await attemptRecovery(options, error, messages, multimodalStripAttempted, recoveryAttempts);
        if (result) {
          shouldRetry = true;
          messages = result.messages;
          multimodalStripAttempted = result.multimodalStripAttempted;
        } else {
          throw error;
        }
      }
    }

    if (!shouldRetry) return;
    recoveryAttempts++;
  }
}
