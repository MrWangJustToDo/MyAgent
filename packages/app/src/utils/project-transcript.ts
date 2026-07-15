import { summarizeToolActivity } from "./tool-activity-summary.js";
import { isPendingToolApproval, isToolCallPart } from "./tool-part.js";

import type { TextPart, ToolCallPart, UIMessage } from "@tanstack/ai";

export type TranscriptDisplayMode = "compact" | "full";

/** Synthetic display-only message id prefix (not persisted to session). */
export const ACTIVITY_SUMMARY_ID_PREFIX = "display-activity:";

export function isActivitySummaryMessage(message: { id?: string }): boolean {
  return typeof message.id === "string" && message.id.startsWith(ACTIVITY_SUMMARY_ID_PREFIX);
}

type Turn = {
  userMessageId: string | null;
  messages: UIMessage[];
};

function groupTurns(messages: UIMessage[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      if (current) turns.push(current);
      current = { userMessageId: message.id, messages: [message] };
      continue;
    }
    if (!current) {
      current = { userMessageId: null, messages: [message] };
    } else {
      current.messages.push(message);
    }
  }

  if (current) turns.push(current);
  return turns;
}

function collectToolParts(messages: UIMessage[]): ToolCallPart[] {
  const parts: ToolCallPart[] = [];
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (isToolCallPart(part)) parts.push(part);
    }
  }
  return parts;
}

function isPendingAskUser(part: ToolCallPart): boolean {
  return part.name === "ask_user" && part.state === "input-complete" && part.output === undefined;
}

function turnShouldStayExpanded(turn: Turn): boolean {
  for (const part of collectToolParts(turn.messages)) {
    if (isPendingToolApproval(part) || isPendingAskUser(part)) return true;
  }
  return false;
}

function getTextContent(part: TextPart): string {
  return part.content?.trim() ?? "";
}

function collapseTurn(turn: Turn): UIMessage[] {
  const users = turn.messages.filter((m) => m.role === "user");
  const assistants = turn.messages.filter((m) => m.role === "assistant");
  const toolParts = collectToolParts(assistants);

  let lastText: { content: string; sourceMessageId: string } | null = null;
  for (const message of assistants) {
    for (const part of message.parts ?? []) {
      if (!part || part.type !== "text") continue;
      const content = getTextContent(part as TextPart);
      if (!content) continue;
      lastText = { content: (part as TextPart).content ?? content, sourceMessageId: message.id };
    }
  }

  const summary = summarizeToolActivity(toolParts);
  const out: UIMessage[] = [...users];

  if (summary) {
    out.push({
      id: `${ACTIVITY_SUMMARY_ID_PREFIX}${turn.userMessageId ?? "orphan"}`,
      role: "assistant",
      parts: [{ type: "text", content: summary } as TextPart],
    } as UIMessage);
  }

  if (lastText) {
    out.push({
      id: `${lastText.sourceMessageId}-compact-final`,
      role: "assistant",
      parts: [{ type: "text", content: lastText.content } as TextPart],
    } as UIMessage);
  }

  // Nothing useful collapsed — keep original messages (e.g. image-only assistant).
  if (out.length === users.length && assistants.length > 0) {
    return turn.messages;
  }

  return out;
}

/**
 * Project transcript for compact display.
 * Closed turns collapse to user + activity summary + final assistant text.
 * The open (loading) turn and turns with pending approval / ask_user stay verbose.
 */
export function projectTranscriptForDisplay(
  messages: UIMessage[],
  options: { mode: TranscriptDisplayMode; isLoading: boolean }
): UIMessage[] {
  if (options.mode !== "compact" || messages.length === 0) return messages;

  const turns = groupTurns(messages);
  const result: UIMessage[] = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const isOpenTurn = i === turns.length - 1 && options.isLoading;
    if (isOpenTurn || turnShouldStayExpanded(turn)) {
      result.push(...turn.messages);
      continue;
    }
    result.push(...collapseTurn(turn));
  }

  return result;
}
