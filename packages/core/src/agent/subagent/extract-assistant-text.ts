/**
 * Extract final assistant text from subagent UIMessage snapshots.
 */

import { isToolUIPart, type TextUIPart, type UIMessage } from "ai";

/** Minimum chars before streaming summary text to the parent task tool UI. */
export const SUMMARY_STREAM_MIN_CHARS = 80;

type MessagePart = UIMessage["parts"][number];

/** Split assistant parts into per-step segments (delimited by step-start). */
export function splitStepSegments(parts: MessagePart[]): MessagePart[][] {
  const segments: MessagePart[][] = [];
  let current: MessagePart[] = [];

  for (const part of parts) {
    if (part.type === "step-start") {
      if (current.length > 0) segments.push(current);
      current = [];
      continue;
    }
    current.push(part);
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

function joinTextParts(parts: MessagePart[]): string {
  return parts
    .filter((part): part is TextUIPart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function segmentHasTool(parts: MessagePart[]): boolean {
  return parts.some((part) => isToolUIPart(part));
}

/**
 * Text from the last text-only step (final summary), excluding exploration narration
 * from earlier steps that also had leading text before tool calls.
 */
export function extractAssistantText(messages: UIMessage[]): string {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return "";

  const segments = splitStepSegments(lastAssistant.parts);
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]!;
    if (segmentHasTool(segment)) continue;
    const text = joinTextParts(segment);
    if (text) return text;
  }

  const lastText = [...lastAssistant.parts].reverse().find((part) => part.type === "text");
  return lastText?.type === "text" ? lastText.text.trim() : "";
}

/**
 * Current in-progress summary text for streaming to the parent task tool.
 * Returns null until the last step is text-only, prior steps used tools, and length threshold met.
 */
export function getSummaryStreamText(parts: MessagePart[]): string | null {
  const segments = splitStepSegments(parts);
  if (segments.length === 0) return null;

  const lastSegment = segments[segments.length - 1]!;
  if (segmentHasTool(lastSegment)) return null;

  const hadToolsBefore = segments.slice(0, -1).some((segment) => segmentHasTool(segment));
  if (!hadToolsBefore) return null;

  const text = joinTextParts(lastSegment);
  if (text.length < SUMMARY_STREAM_MIN_CHARS) return null;

  return text;
}
