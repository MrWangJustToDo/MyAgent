/**
 * Session Types - Type definitions for session persistence and resume.
 *
 * Uses a single JSON file per session. Each session is stored as
 * `.agents/sessions/{id}.session.json` containing the full SessionData object.
 */

import { z } from "zod";

import type { ModelStyle } from "../../models/types.js";
import type { TokenUsage } from "../../runtime-types/token-usage.js";
import type { PlanModeState } from "../plan/plan-mode-controller.js";
import type { TodoItem } from "../todo-manager";
import type { UIMessage } from "@tanstack/ai";

// ============================================================================
// Constants
// ============================================================================

/** v4: base64 binary assets extracted to .agents/media/ with mediaRef in metadata. */
export const SESSION_VERSION = 4;
export const SESSION_DIR = ".agents/sessions";
export const SESSION_FILE_SUFFIX = ".session.json";

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
  /**
   * Plan-mode lifecycle snapshot (phase, markdown, path, seeded flags).
   * Omitted or null when plan mode is off. Older sessions omit this field.
   */
  planMode?: PlanModeState | null;
  /** When true, skip all tool approvals (auto / YOLO mode). Older sessions omit this. */
  autoMode?: boolean;
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
