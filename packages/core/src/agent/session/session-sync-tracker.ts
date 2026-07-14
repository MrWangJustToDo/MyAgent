import { isEmptyAssistantShell } from "../utils/empty-assistant-shell.js";

import type { AgentStatus } from "../../managers/agent-types.js";
import type { ToolCallPart, UIMessage } from "@tanstack/ai";

// ToolCallPart["approval"] doesn't include `reason`, but
// applyToolDenialReason dynamically adds it at runtime.
type ToolCallApproval = ToolCallPart["approval"] & { reason?: string };

// ============================================================================
// Types
// ============================================================================

export type SessionSaveReason = "checkpoint" | "pump-complete" | "force";

export interface SessionSyncSnapshot {
  messageCount: number;
  fingerprints: string[];
}

const STREAMING_AGENT_STATUSES = new Set<AgentStatus>(["running", "thinking", "responding", "compacting"]);

const STABLE_TOOL_CALL_STATES = new Set<ToolCallPart["state"]>([
  "input-complete",
  "approval-requested",
  "approval-responded",
  "complete",
  "error",
]);

// ============================================================================
// Fingerprint & stability
// ============================================================================

function fingerprintPart(part: UIMessage["parts"][number]): string {
  switch (part.type) {
    case "text":
      return `text:${part.content}`;
    case "tool-call":
      return [
        "tool-call",
        part.id,
        part.name,
        part.arguments,
        part.state,
        (part.approval as ToolCallApproval | undefined)?.id ?? "",
        (part.approval as ToolCallApproval | undefined)?.approved === true
          ? "1"
          : (part.approval as ToolCallApproval | undefined)?.approved === false
            ? "0"
            : "",
        (part.approval as ToolCallApproval | undefined)?.reason ?? "",
        part.output !== undefined ? "out" : "",
      ].join(":");
    case "tool-result":
      return [
        "tool-result",
        part.toolCallId,
        part.state,
        typeof part.content === "string" ? part.content : JSON.stringify(part.content),
        part.error ?? "",
      ].join(":");
    case "thinking":
      return `thinking:${part.content}:${part.signature ?? ""}`;
    case "structured-output":
      return `structured:${part.status}:${part.raw}`;
    default:
      return part.type;
  }
}

/** Lightweight per-message fingerprint for change detection. */
export function fingerprintUIMessage(message: UIMessage): string {
  if (isEmptyAssistantShell(message)) return `${message.id}:empty`;
  const parts = message.parts.map(fingerprintPart).join("|");
  return `${message.id}:${message.role}:${parts}`;
}

export function computeSessionSyncSnapshot(messages: UIMessage[]): SessionSyncSnapshot {
  return {
    messageCount: messages.length,
    fingerprints: messages.map(fingerprintUIMessage),
  };
}

function isToolCallPart(part: UIMessage["parts"][number]): part is ToolCallPart {
  return part.type === "tool-call";
}

/** Whether a UIMessage is safe to treat as a durable checkpoint (not mid-stream). */
export function isUIMessageStable(message: UIMessage): boolean {
  if (message.role === "user") return true;
  if (isEmptyAssistantShell(message)) return false;

  for (const part of message.parts) {
    if (part.type === "text") continue;

    if (isToolCallPart(part)) {
      if (!STABLE_TOOL_CALL_STATES.has(part.state)) return false;
      continue;
    }

    if (part.type === "tool-result") {
      if (part.state !== "complete" && part.state !== "error") return false;
      continue;
    }

    if (part.type === "thinking") continue;

    if (part.type === "structured-output") {
      if (part.status === "streaming") return false;
    }
  }

  return true;
}

export function areAllUIMessagesStable(messages: UIMessage[]): boolean {
  return messages.every(isUIMessageStable);
}

function snapshotsEqual(a: SessionSyncSnapshot | null, b: SessionSyncSnapshot): boolean {
  if (!a) return false;
  if (a.messageCount !== b.messageCount) return false;
  if (a.fingerprints.length !== b.fingerprints.length) return false;
  for (let i = 0; i < a.fingerprints.length; i++) {
    if (a.fingerprints[i] !== b.fingerprints[i]) return false;
  }
  return true;
}

// ============================================================================
// Persist decision
// ============================================================================

export interface ShouldPersistUIMessagesOptions {
  reason: SessionSaveReason;
  agentStatus?: AgentStatus;
}

/**
 * Decide whether to flush {@link UIMessage} history to session storage.
 *
 * - `force` / `pump-complete`: always persist when messages are non-empty.
 * - `checkpoint`: skip during active model/tool streaming; persist stable deltas
 *   (new user turns, approval waits, terminal status).
 */
export function shouldPersistUIMessages(
  messages: UIMessage[],
  previous: SessionSyncSnapshot | null,
  options: ShouldPersistUIMessagesOptions
): boolean {
  if (messages.length === 0) return false;

  const snapshot = computeSessionSyncSnapshot(messages);
  if (snapshotsEqual(previous, snapshot)) return false;

  if (options.reason === "force" || options.reason === "pump-complete") {
    return true;
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "user") return true;

  const status = options.agentStatus;
  if (status && STREAMING_AGENT_STATUSES.has(status)) {
    return false;
  }

  if (status === "waiting" || status === "awaiting_user") {
    return true;
  }

  if (status === "completed" || status === "idle" || status === "error" || status === "aborted") {
    return areAllUIMessagesStable(messages);
  }

  return areAllUIMessagesStable(messages);
}

// ============================================================================
// Tracker instance
// ============================================================================

export interface SessionSyncTracker {
  getSnapshot(): SessionSyncSnapshot | null;
  markPersisted(messages: UIMessage[]): void;
  reset(messages?: UIMessage[]): void;
  shouldPersist(messages: UIMessage[], options: ShouldPersistUIMessagesOptions): boolean;
}

export function createSessionSyncTracker(): SessionSyncTracker {
  let lastPersisted: SessionSyncSnapshot | null = null;

  return {
    getSnapshot() {
      return lastPersisted;
    },
    markPersisted(messages) {
      lastPersisted = computeSessionSyncSnapshot(messages);
    },
    reset(messages) {
      lastPersisted = messages?.length ? computeSessionSyncSnapshot(messages) : null;
    },
    shouldPersist(messages, options) {
      return shouldPersistUIMessages(messages, lastPersisted, options);
    },
  };
}
