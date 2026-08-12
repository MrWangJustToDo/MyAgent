/**
 * Cancel incomplete / never-executed tool calls left behind after an abort.
 *
 * Esc mid tool-arg stream often leaves `input-streaming` (or TanStack finalize
 * promotes truncated JSON to `input-complete` with no output). Those rows stay
 * "executing" in the UI and the next `chat()` retries them via
 * `executeToolCalls` → JSON.parse failure.
 *
 * Must NOT cancel:
 * - pending approval prompts (user still deciding)
 * - `approval-responded` tools (user just pressed `y`)
 * - valid `input-complete` tools waiting for a normal tool-phase pump
 */

import type { ToolCallPart, ToolResultPart, UIMessage } from "@tanstack/ai";

export const TOOL_CANCELLED_MESSAGE = "Cancelled by user.";

function isToolCallPart(part: UIMessage["parts"][number]): part is ToolCallPart {
  return part.type === "tool-call";
}

function hasToolResult(message: UIMessage, toolCallId: string): boolean {
  return message.parts.some((part) => part.type === "tool-result" && part.toolCallId === toolCallId);
}

/** Whether tool arguments are non-empty, parseable JSON (safe for TanStack executeToolCalls). */
export function hasValidToolArguments(part: ToolCallPart): boolean {
  const raw = typeof part.arguments === "string" ? part.arguments.trim() : "";
  if (!raw) return false;
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tool call that is stuck from an aborted stream and must not be resumed.
 * Live approval / tool-phase queues are left alone.
 */
export function isCancellableIncompleteToolCall(part: ToolCallPart): boolean {
  if (part.output !== undefined) return false;
  if (part.state === "complete" || part.state === "error") return false;

  // User still deciding — approval UI owns this.
  if (part.approval?.needsApproval === true && part.approval.approved === undefined) {
    return false;
  }

  // User approved (`y`) — next pump must execute, not cancel.
  if (part.state === "approval-responded") return false;

  // Truncated / never-finished arg streams.
  if (part.state === "awaiting-input" || part.state === "input-streaming") return true;

  // Finalize after abort can promote truncated args to input-complete — only cancel bad JSON.
  if (part.state === "input-complete") {
    return !hasValidToolArguments(part);
  }

  return false;
}

/** Whether any message still has a cancellable incomplete tool call. */
export function hasCancellableIncompleteToolCalls(messages: UIMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (isToolCallPart(part) && isCancellableIncompleteToolCall(part)) return true;
    }
  }
  return false;
}

/**
 * Mark incomplete tool calls as cancelled (`error` + synthetic tool-result) so:
 * - UI stops showing a loading spinner
 * - TanStack `checkForPendingToolCalls` will not try to execute truncated args
 */
export function cancelIncompleteToolCalls(messages: UIMessage[], reason: string = TOOL_CANCELLED_MESSAGE): UIMessage[] {
  const message = reason.trim() || TOOL_CANCELLED_MESSAGE;
  let changed = false;

  const next = messages.map((uiMessage) => {
    if (uiMessage.role !== "assistant") return uiMessage;

    let partsChanged = false;
    const parts = [...uiMessage.parts];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!isToolCallPart(part) || !isCancellableIncompleteToolCall(part)) continue;

      partsChanged = true;
      parts[i] = {
        ...part,
        state: "error",
        output: { success: false, error: message },
      };

      if (
        !hasToolResult(uiMessage, part.id) &&
        !parts.some((p) => p.type === "tool-result" && p.toolCallId === part.id)
      ) {
        const result: ToolResultPart = {
          type: "tool-result",
          toolCallId: part.id,
          content: JSON.stringify({ success: false, error: message, cancelled: true }),
          state: "complete",
        };
        parts.splice(i + 1, 0, result);
        i += 1;
      }
    }

    if (!partsChanged) return uiMessage;
    changed = true;
    return { ...uiMessage, parts };
  });

  return changed ? next : messages;
}
