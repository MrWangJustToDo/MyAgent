import { isPromptTooLongError } from "../agent/compaction/reactive-compact.js";
import { extractRunErrorMessage } from "../agent/subagent/stream-errors.js";
import { assertAsyncIterable } from "../agent/utils/assert-async-iterable.js";

import type { ManagedAgent } from "./managed-agent.js";
import type { AgentManager } from "./manager-agent.js";
import type { ModelMessage, StreamChunk, UIMessage } from "@tanstack/ai";

function selectRunMessagesAfterCompact(
  managed: ManagedAgent,
  fallback: Array<UIMessage | ModelMessage>
): Array<UIMessage | ModelMessage> {
  const ui = managed.getContext()?.getUIMessages();
  if (ui && ui.length > 0) return ui;
  return managed.getContext()?.getMessagesForLLM() ?? fallback;
}

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
  let messages = options.getMessages();

  while (true) {
    let retry = false;
    const stream = options.run(messages);
    assertAsyncIterable(stream, "AgentRunner.run");

    try {
      for await (const chunk of stream) {
        if (chunk.type === "RUN_ERROR") {
          const handled = await tryReactiveCompactRetry(
            options.managed,
            options.manager,
            errorFromUnknown(extractRunErrorMessage(chunk))
          );
          if (handled) {
            retry = true;
            messages = selectRunMessagesAfterCompact(options.managed, messages);
            break;
          }
        }
        yield chunk;
      }
    } catch (error) {
      if (!retry) {
        const handled = await tryReactiveCompactRetry(options.managed, options.manager, error);
        if (handled) {
          retry = true;
          messages = selectRunMessagesAfterCompact(options.managed, messages);
        } else {
          throw error;
        }
      }
    }

    if (!retry) return;
  }
}
