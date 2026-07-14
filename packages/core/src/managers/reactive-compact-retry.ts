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
// Stream wrapper
// ============================================================================

export interface ReactiveCompactRetryOptions {
  managed: ManagedAgent;
  manager: AgentManager;
  getMessages: () => Array<UIMessage | ModelMessage>;
  run: (messages: Array<UIMessage | ModelMessage>) => AsyncIterable<StreamChunk>;
}

export async function* runStreamWithReactiveCompactRetry(
  options: ReactiveCompactRetryOptions
): AsyncIterable<StreamChunk> {
  let messages = messagesForModelCapabilities(options.managed, options.getMessages());
  let multimodalStripAttempted = false;

  while (true) {
    let retry = false;
    const stream = options.run(messages);
    assertAsyncIterable(stream, "AgentRunner.run");

    try {
      for await (const chunk of stream) {
        if (chunk.type === "RUN_ERROR") {
          const runError = errorFromUnknown(extractRunErrorMessage(chunk) || "Agent run failed");
          const handled = await tryHandleRunFailure(options, runError, messages, multimodalStripAttempted);
          if (handled) {
            retry = true;
            messages = handled.messages;
            multimodalStripAttempted = handled.multimodalStripAttempted;
            break;
          }
          // Fail visibly — do not yield RUN_ERROR for consumers to silently ignore.
          throw runError;
        }
        yield chunk;
      }
    } catch (error) {
      if (!retry) {
        const handled = await tryHandleRunFailure(options, error, messages, multimodalStripAttempted);
        if (handled) {
          retry = true;
          messages = handled.messages;
          multimodalStripAttempted = handled.multimodalStripAttempted;
        } else {
          throw error;
        }
      }
    }

    if (!retry) return;
  }
}

async function tryHandleRunFailure(
  options: ReactiveCompactRetryOptions,
  error: unknown,
  currentMessages: Array<UIMessage | ModelMessage>,
  multimodalStripAttempted: boolean
): Promise<{ messages: Array<UIMessage | ModelMessage>; multimodalStripAttempted: boolean } | null> {
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
