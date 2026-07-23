import { formatExploredActivitySummary, MIN_FOLD_COUNT, shouldFoldToolRow } from "./tool-activity-summary.js";
import { isToolCallPart } from "./tool-part.js";

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

type PendingFoldable = {
  part: ToolCallPart;
  source: UIMessage;
  partIndex: number;
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

function getTextContent(part: TextPart): string {
  return part.content?.trim() ?? "";
}

function emitPartMessage(source: UIMessage, part: UIMessage["parts"][number], partIndex: number): UIMessage {
  return {
    ...source,
    id: `${source.id}-d${partIndex}`,
    parts: [part],
  } as UIMessage;
}

/**
 * Density-first compact projection:
 * - Keep tools as rows by default (render layer hides bulky outputs / shortens headers)
 * - Only fold contiguous completed exploration tools when count >= {@link MIN_FOLD_COUNT}
 * - Folded segments use path-aware activity summaries
 */
function collapseTurn(turn: Turn): UIMessage[] {
  const out: UIMessage[] = [];
  let pendingFoldable: PendingFoldable[] = [];
  let summarySeq = 0;
  let didFold = false;

  const flushSummary = () => {
    if (pendingFoldable.length === 0) return;

    const folded = pendingFoldable;
    pendingFoldable = [];

    // Below threshold: keep as individual tool rows (density mode, no projection loss).
    if (folded.length < MIN_FOLD_COUNT) {
      for (const item of folded) {
        out.push(emitPartMessage(item.source, item.part, item.partIndex));
      }
      return;
    }

    const summary = formatExploredActivitySummary(folded.map((f) => f.part));
    if (!summary) {
      for (const item of folded) {
        out.push(emitPartMessage(item.source, item.part, item.partIndex));
      }
      return;
    }

    didFold = true;
    out.push({
      id: `${ACTIVITY_SUMMARY_ID_PREFIX}${turn.userMessageId ?? "orphan"}:${summarySeq++}`,
      role: "assistant",
      parts: [{ type: "text", content: summary } as TextPart],
    } as UIMessage);
  };

  for (const message of turn.messages) {
    if (message.role === "user") {
      flushSummary();
      out.push(message);
      continue;
    }

    if (message.role !== "assistant") {
      flushSummary();
      out.push(message);
      continue;
    }

    const parts = message.parts ?? [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      if (part.type === "text") {
        if (!getTextContent(part as TextPart)) continue;
        flushSummary();
        out.push(emitPartMessage(message, part, i));
        continue;
      }

      if (part.type === "image") {
        flushSummary();
        out.push(emitPartMessage(message, part, i));
        continue;
      }

      if (!isToolCallPart(part)) {
        continue;
      }

      if (shouldFoldToolRow(part)) {
        pendingFoldable.push({ part, source: message, partIndex: i });
        continue;
      }

      flushSummary();
      out.push(emitPartMessage(message, part, i));
    }
  }

  flushSummary();

  // No segment reached the fold threshold — keep original messages (stable ids).
  if (!didFold) {
    return turn.messages;
  }

  return out;
}

/**
 * Project transcript for compact display.
 *
 * Density-first: most tools stay as one-line rows. Only long runs of completed
 * exploration tools collapse into path-aware activity summaries.
 */
export function projectTranscriptForDisplay(
  messages: UIMessage[],
  options: { mode: TranscriptDisplayMode }
): UIMessage[] {
  if (options.mode !== "compact" || messages.length === 0) return messages;

  const turns = groupTurns(messages);
  const result: UIMessage[] = [];

  for (const turn of turns) {
    result.push(...collapseTurn(turn));
  }

  return result;
}
