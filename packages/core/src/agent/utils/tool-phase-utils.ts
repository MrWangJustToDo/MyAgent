import type { AgentStatus } from "../../managers/agent-types.js";
import type { ModelMessage, ToolCallPart, UIMessage } from "@tanstack/ai";

/** Client-side tools — UI supplies output via {@link AgentChatController.addToolResult}. */
const CLIENT_TOOL_NAMES = new Set(["ask_user"]);

function lastAssistantMessage(messages: UIMessage[]): UIMessage | undefined {
  return [...messages].reverse().find((message) => message.role === "assistant");
}

function isToolCallPart(part: { type?: string }): part is ToolCallPart {
  return part.type === "tool-call";
}

export function isPendingToolApprovalPart(part: ToolCallPart): boolean {
  return part.approval?.needsApproval === true && part.approval.approved === undefined;
}

/**
 * Non-approval server tools still waiting after batch gating (e.g. `tree` + `run_command`).
 */
export function hasDeferredToolExecution(messages: UIMessage[]): boolean {
  const lastAssistant = lastAssistantMessage(messages);
  if (!lastAssistant) return false;

  for (const part of lastAssistant.parts) {
    if (!isToolCallPart(part)) continue;
    if (CLIENT_TOOL_NAMES.has(part.name)) continue;
    if (part.approval?.needsApproval) continue;
    if (part.state === "complete" || part.output !== undefined) continue;
    if (part.state === "input-complete" || part.state === "input-streaming" || part.state === "awaiting-input") {
      return true;
    }
  }
  return false;
}

/** Approved server tools that still need a follow-up tool-phase run. */
export function hasApprovedToolsPendingExecution(messages: UIMessage[]): boolean {
  return hasApprovalRespondedToolsPendingExecution(messages);
}

export function needsToolPhaseContinue(messages: UIMessage[]): boolean {
  return hasDeferredToolExecution(messages) || hasApprovalRespondedToolsPendingExecution(messages);
}

export function hasPendingToolApprovals(messages: UIMessage[]): boolean {
  return countPendingToolApprovals(messages) > 0;
}

export function countPendingToolApprovals(messages: UIMessage[]): number {
  const lastAssistant = lastAssistantMessage(messages);
  if (!lastAssistant) return 0;

  let count = 0;
  for (const part of lastAssistant.parts) {
    if (!isToolCallPart(part)) continue;
    if (isPendingToolApprovalPart(part)) count++;
  }
  return count;
}

/** Approval-responded server tools (approved or denied) that still need a follow-up run. */
export function hasApprovalRespondedToolsPendingExecution(messages: UIMessage[]): boolean {
  const lastAssistant = lastAssistantMessage(messages);
  if (!lastAssistant) return false;

  for (const part of lastAssistant.parts) {
    if (!isToolCallPart(part)) continue;
    if (!part.approval?.needsApproval || part.approval.approved === undefined) continue;
    if (part.state === "complete" || part.output !== undefined) continue;
    return true;
  }
  return false;
}

/**
 * Whether `prepareForRun` should skip expensive one-shot work (memory prefetch, `prompt:submit`).
 *
 * Uses existing agent status plus conversation shape — no separate run-phase flag:
 * - `waiting` — stream paused for tool approval
 * - last message is not `user` — tool-phase or approval continuation within the same turn
 */
export function isToolContinuationPrepare(status: AgentStatus, messages?: Array<UIMessage | ModelMessage>): boolean {
  if (status === "waiting" || status === "awaiting_user") return true;
  if (!messages?.length) return false;
  return messages[messages.length - 1].role !== "user";
}

export function hasPendingAskUser(messages: UIMessage[]): boolean {
  const lastAssistant = lastAssistantMessage(messages);
  if (!lastAssistant) return false;

  for (const part of lastAssistant.parts) {
    if (!isToolCallPart(part)) continue;
    if (part.name !== "ask_user") continue;
    if (part.state === "input-complete" && part.output === undefined) return true;
  }
  return false;
}
