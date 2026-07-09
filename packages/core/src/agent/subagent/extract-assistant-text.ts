/**
 * Extract final assistant text from subagent UIMessage snapshots.
 */

import type { UIMessage } from "@tanstack/ai";

/** Minimum chars before streaming summary text to the parent task tool UI. */
export const SUMMARY_STREAM_MIN_CHARS = 80;

type MessagePart = UIMessage["parts"][number];

function isToolPart(part: MessagePart): boolean {
  return part.type === "tool-call" || part.type === "tool-result";
}

function textFromPart(part: MessagePart): string {
  if (part.type === "text") {
    return part.content?.trim() ?? "";
  }
  return "";
}

function thinkingFromPart(part: MessagePart): string {
  if (part.type === "thinking") {
    return part.content?.trim() ?? "";
  }
  return "";
}

function joinSegmentText(parts: MessagePart[]): string {
  const text = parts
    .map((part) => textFromPart(part))
    .filter(Boolean)
    .join("\n")
    .trim();
  if (text) return text;

  return parts
    .map((part) => thinkingFromPart(part))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function splitByToolBoundaries(parts: MessagePart[]): MessagePart[][] {
  const segments: MessagePart[][] = [];
  let current: MessagePart[] = [];

  for (const part of parts) {
    if (isToolPart(part)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      segments.push([part]);
      continue;
    }
    current.push(part);
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

/** Split assistant parts into per-step segments at tool-call / tool-result boundaries. */
export function splitStepSegments(parts: MessagePart[]): MessagePart[][] {
  return splitByToolBoundaries(parts);
}

function joinTextParts(parts: MessagePart[]): string {
  return joinSegmentText(parts);
}

function segmentHasTool(parts: MessagePart[]): boolean {
  return parts.some((part) => isToolPart(part));
}

function getLastAssistantMessage(messages: UIMessage[]): UIMessage | undefined {
  return [...messages].reverse().find((message) => message.role === "assistant");
}

const TERMINAL_TOOL_CALL_STATES = new Set(["complete", "error"]);

/** Whether any subagent tool-call is still in progress. */
export function hasIncompleteToolCalls(messages: UIMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "tool-call") continue;
      const state = part.state ?? "input-complete";
      if (!TERMINAL_TOOL_CALL_STATES.has(state)) return true;
    }
  }
  return false;
}

export type TaskRunPhase = "tools" | "summary";

/** Tracks whether {@link begin_summary} has unlocked summary streaming. */
export interface TaskSummaryStreamState {
  summaryPhaseUnlocked: boolean;
}

export const DEFAULT_TASK_SUMMARY_STREAM_STATE: TaskSummaryStreamState = {
  summaryPhaseUnlocked: false,
};

/**
 * Resolve whether the subagent is in the tool phase or summary phase.
 * Summary phase begins after the model calls {@link BEGIN_SUMMARY_TOOL_NAME}.
 */
export function resolveTaskRunPhase(
  messages: UIMessage[],
  streamState: TaskSummaryStreamState = DEFAULT_TASK_SUMMARY_STREAM_STATE
): TaskRunPhase {
  if (hasIncompleteToolCalls(messages)) return "tools";
  return streamState.summaryPhaseUnlocked ? "summary" : "tools";
}

/** Whether summary text should be streamed to the parent task tool UI. */
export function shouldStreamTaskSummary(
  parts: MessagePart[],
  streamState: TaskSummaryStreamState = DEFAULT_TASK_SUMMARY_STREAM_STATE
): boolean {
  return getSummaryStreamText(parts, streamState) !== null;
}

/**
 * Text from the last text-only step (final summary), excluding exploration narration
 * from earlier steps that also had leading text before tool calls.
 */
export function extractAssistantText(messages: UIMessage[]): string {
  const lastAssistant = getLastAssistantMessage(messages);
  if (!lastAssistant) return "";

  const segments = splitStepSegments(lastAssistant.parts);
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]!;
    if (segmentHasTool(segment)) continue;
    const text = joinTextParts(segment);
    if (text) return text;
  }

  const lastText = [...lastAssistant.parts].reverse().find((part) => part.type === "text");
  if (lastText) return textFromPart(lastText);

  const lastThinking = [...lastAssistant.parts].reverse().find((part) => part.type === "thinking");
  return lastThinking ? thinkingFromPart(lastThinking) : "";
}

/**
 * Current-turn summary text for streaming to the parent task tool.
 *
 * Pass only the **current agent-loop turn** assistant parts (Vercel `readUIMessageStream`
 * semantics). Returns null until {@link TaskSummaryStreamState.summaryPhaseUnlocked} is set
 * by {@link BEGIN_SUMMARY_TOOL_NAME} and the last segment of this turn is text-only.
 */
export function getSummaryStreamText(
  parts: MessagePart[],
  streamState: TaskSummaryStreamState = DEFAULT_TASK_SUMMARY_STREAM_STATE
): string | null {
  if (!streamState.summaryPhaseUnlocked) return null;

  const segments = splitStepSegments(parts);
  if (segments.length === 0) return null;

  const lastSegment = segments[segments.length - 1]!;
  if (segmentHasTool(lastSegment)) return null;

  const text = joinTextParts(lastSegment);
  if (text.length < SUMMARY_STREAM_MIN_CHARS) return null;

  return text;
}
