/**
 * Session Types - Type definitions for session persistence and resume.
 *
 * Each session is one append-only JSONL message log
 * `.agents/sessions/{id}.session.jsonl`. Every line is one message plus a full
 * snapshot of the non-message session state at that point; `load()` folds the
 * lines by message id (later line wins). There is no separate snapshot file.
 */

import { z } from "zod";

import type { ModelStyle, ReasoningEffort } from "../../models/types.js";
import type { TokenUsage } from "../../runtime-types/token-usage.js";
import type { PlanModeState } from "../plan/plan-mode-controller.js";
import type { TodoItem } from "../todo";
import type { UIMessage } from "@tanstack/ai";

// ============================================================================
// Constants
// ============================================================================

/** v6: one append-only message log per session; no snapshot file. */
export const SESSION_VERSION = 6;
export const SESSION_DIR = ".agents/sessions";
/** Append-only message log suffix; the single source of truth per session. */
export const SESSION_LOG_SUFFIX = ".session.jsonl";
/** Log line kind: one message + the full non-message state snapshot at that point. */
export const SESSION_LOG_MESSAGE = "message";

/** Directory for per-session AgentLog JSONL files: `.agents/logs/{sessionId}/`. */
export const AGENT_LOG_DIR = ".agents/logs";

// ============================================================================
// Session Data Schema
// ============================================================================

export const sessionMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  modelStyle: z.enum(["openai", "anthropic"]),
  model: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type SessionMeta = z.infer<typeof sessionMetaSchema>;

export const toolApprovalStatusSchema = z.enum(["pending", "approved", "denied"]);

export const toolApprovalRecordSchema = z.object({
  id: z.string(),
  toolCallId: z.string(),
  status: toolApprovalStatusSchema,
  reason: z.string().optional(),
  updatedAt: z.number(),
});

export type ToolApprovalStatus = z.infer<typeof toolApprovalStatusSchema>;
export type ToolApprovalRecord = z.infer<typeof toolApprovalRecordSchema>;

// ============================================================================
// Session Log Line Types
// ============================================================================

/** Everything in {@link SessionData} except the message history and derived metadata. */
export type SessionStateFields = Omit<SessionData, "uiMessages" | "approvalTimes">;

/**
 * One line of the append-only session log (`{id}.session.jsonl`): one message
 * plus the full non-message state snapshot at that point.
 *
 * The message MAY be `null` on the very first line only (initial / empty-session
 * state such as `reservedAt`); every other line carries a message.
 * `messageUpdatedAt` is the line's write time; `approvalAt` maps a toolCallId to
 * the time its approval first became decided (so the decision timestamp survives
 * folding).
 */
export interface SessionLogLine {
  t: typeof SESSION_LOG_MESSAGE;
  message: UIMessage | null;
  messageUpdatedAt: number;
  state: SessionStateFields;
  approvalAt?: Record<string, number>;
}

export interface SessionData {
  /** Unique session identifier */
  id: string;
  /** Human-readable session name (auto-generated from first message) */
  name: string;
  /** Schema version for future migrations */
  version: number;
  /** API style used for this session */
  modelStyle: ModelStyle;
  /** Model name used */
  model: string;
  /** Full conversation as UIMessages (for client display on resume; includes in-chain summaries) */
  uiMessages: UIMessage[];
  /** Token usage statistics */
  usage: TokenUsage;
  /** Session cost in USD */
  cost?: number;
  /** Last SDK-reported input tokens (actual context window fill for percentage display) */
  contextTokens?: number;
  /** Active todos */
  todos: TodoItem[];
  /** Todo set title (optional; older sessions omit this). */
  todoTitle?: string | null;
  /** Whether todos are bound to plan building (optional; older sessions omit this). */
  todoPlanBound?: boolean;
  /** Reasoning effort level for this session (OpenAI `reasoning_effort` / Anthropic `effort`). */
  reasoningEffort?: ReasoningEffort;
  /**
   * Plan-mode lifecycle snapshot (phase, markdown, path, seeded flags).
   * Omitted or null when plan mode is off. Older sessions omit this field.
   */
  planMode?: PlanModeState | null;
  /** When true, skip all tool approvals (auto / YOLO mode). Older sessions omit this. */
  autoMode?: boolean;
  /**
   * Derived, non-persisted approval decision timestamps (toolCallId → epoch ms),
   * reconstructed on load from the message log. Never serialized into the log's
   * `state` snapshot (see {@link SessionStateFields}).
   */
  approvalTimes?: Record<string, number>;
  /**
   * Epoch ms when a live agent last *reserved* this (still-empty) session for
   * startup reuse. Lets a second process/agent skip a concurrently reused
   * session whose live owner is not visible to it (cross-process ownership is
   * intentionally not shared). The window expires on its own if the reserving
   * process crashed, keeping "live-exclusive" semantics. Not surfaced to hosts.
   */
  reservedAt?: number;
  /**
   * @deprecated Legacy field renamed to `autoMode`. Kept for backward compatibility
   * with sessions persisted before the rename. New sessions use `autoMode`.
   */
  autoApprove?: boolean;
  /** Timestamp when session was created */
  createdAt: number;
  /** Timestamp when session was last updated */
  updatedAt: number;
}

// ============================================================================
// Resume Result
// ============================================================================

export interface ResumeResult {
  /** UIMessages for client to display */
  uiMessages: UIMessage[];
  /** Session metadata */
  session: SessionMeta;
}
