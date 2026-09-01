import type { ToolCallPart, ToolResultPart, UIMessage } from "@tanstack/ai";

export const DEFAULT_TOOL_DENIAL_MESSAGE = "User denied this tool execution. Do not assume the action was performed.";

export function buildToolDenialResultContent(reason?: string): string {
  const message = reason?.trim() || DEFAULT_TOOL_DENIAL_MESSAGE;
  return JSON.stringify({ approved: false, message });
}

/**
 * Attach a user-provided denial reason to the matching tool-call part and add a
 * `tool-result` part for TanStack `uiMessageToModelMessages` conversion.
 *
 * TanStack `addToolApprovalResponse` only records approved/denied; the default
 * model-facing denial text is generic. This keeps the UI freeform flow while
 * ensuring the LLM sees the user's reason on the next tool-phase run.
 */
export function applyToolDenialReason(messages: UIMessage[], approvalId: string, reason?: string): UIMessage[] {
  const denialContent = buildToolDenialResultContent(reason);
  const denialMessage = reason?.trim() || DEFAULT_TOOL_DENIAL_MESSAGE;

  return messages.map((message) => {
    if (message.role !== "assistant") return message;

    const toolCallIndex = message.parts.findIndex(
      (part): part is ToolCallPart => part.type === "tool-call" && part.approval?.id === approvalId
    );
    if (toolCallIndex === -1) return message;

    const toolCallPart = message.parts[toolCallIndex] as ToolCallPart;
    const hasDenialResult = message.parts.some(
      (part) => part.type === "tool-result" && part.toolCallId === toolCallPart.id
    );

    const parts = [...message.parts];
    parts[toolCallIndex] = {
      ...toolCallPart,
      state: "approval-responded",
      approval: toolCallPart.approval
        ? ({ ...toolCallPart.approval, approved: false, reason: denialMessage } as ToolCallPart["approval"])
        : toolCallPart.approval,
    };

    if (!hasDenialResult) {
      const denialResult: ToolResultPart = {
        type: "tool-result",
        toolCallId: toolCallPart.id,
        content: denialContent,
        state: "complete",
      };
      parts.splice(toolCallIndex + 1, 0, denialResult);
    }

    return { ...message, parts };
  });
}
