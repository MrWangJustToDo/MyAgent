/**
 * Synthetic turn-context user messages (epoch-style dynamic context).
 *
 * Persisted in UIMessage history for stability; hidden in the transcript UI.
 * Skipped by {@link findCutPoint} so compaction keepRecentFlows stays accurate.
 */

import { generateId } from "../../utils/generate-id.js";
import { extractTextFromContent } from "../compaction/message-utils.js";

import type { ModelMessage, UIMessage } from "@tanstack/ai";

export const TURN_CONTEXT_OPEN = "<turn_context>";
export const TURN_CONTEXT_CLOSE = "</turn_context>";

const SUPERSEDE_NOTICE =
  "If earlier <turn_context> blocks appear above in this conversation, ignore them and treat this block as authoritative.";

/** FNV-1a 32-bit — stable, dependency-free payload fingerprint. */
export function hashTurnContextPayload(payload: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Combine snapshot + extension system append into one hashable / renderable payload.
 */
export function buildTurnContextPayload(
  dynamicContext: string | undefined,
  extensionSystemAppend?: string
): string | undefined {
  const parts: string[] = [];
  const dynamic = dynamicContext?.trim();
  if (dynamic) parts.push(dynamic);
  const append = extensionSystemAppend?.trim();
  if (append) parts.push(append);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

/**
 * Wrap payload for a synthetic user message.
 *
 * @param isUpdate - When true, include supersede guidance (prior turn_context exists).
 */
export function formatTurnContextUserContent(payload: string, options?: { isUpdate?: boolean }): string {
  const body = options?.isUpdate ? `${SUPERSEDE_NOTICE}\n\n${payload.trim()}` : payload.trim();
  return `${TURN_CONTEXT_OPEN}\n${body}\n${TURN_CONTEXT_CLOSE}`;
}

export function isTurnContextText(text: string | undefined | null): boolean {
  if (!text) return false;
  return text.trimStart().startsWith(TURN_CONTEXT_OPEN);
}

export function isTurnContextModelMessage(message: ModelMessage): boolean {
  if (message.role !== "user") return false;
  return isTurnContextText(extractTextFromContent(message.content));
}

export function isTurnContextUIMessage(message: UIMessage): boolean {
  if (message.role !== "user") return false;
  const textPart = message.parts.find((part) => part.type === "text");
  if (!textPart || textPart.type !== "text") return false;
  return isTurnContextText(textPart.content);
}

/** Extract inner payload (without tags / supersede notice) for hashing restored messages. */
export function extractTurnContextPayload(text: string): string | undefined {
  if (!isTurnContextText(text)) return undefined;
  const start = text.indexOf(TURN_CONTEXT_OPEN);
  const end = text.indexOf(TURN_CONTEXT_CLOSE);
  if (start < 0 || end < 0 || end <= start) return undefined;
  let inner = text.slice(start + TURN_CONTEXT_OPEN.length, end).trim();
  if (inner.startsWith(SUPERSEDE_NOTICE)) {
    inner = inner.slice(SUPERSEDE_NOTICE.length).trim();
  }
  return inner || undefined;
}

export function findLatestTurnContextHash(messages: UIMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!isTurnContextUIMessage(message)) continue;
    const textPart = message.parts.find((part) => part.type === "text");
    if (!textPart || textPart.type !== "text") continue;
    const payload = extractTurnContextPayload(textPart.content);
    if (payload) return hashTurnContextPayload(payload);
  }
  return undefined;
}

/**
 * Insert a turn_context user message immediately after the latest real user message.
 */
export function insertTurnContextUIMessage(messages: UIMessage[], content: string, id?: string): UIMessage[] {
  const message: UIMessage = {
    id: id ?? generateId("tc"),
    role: "user",
    parts: [{ type: "text", content }],
  };

  let insertAt = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && !isTurnContextUIMessage(messages[i])) {
      insertAt = i + 1;
      break;
    }
  }

  const next = messages.slice();
  next.splice(insertAt, 0, message);
  return next;
}
