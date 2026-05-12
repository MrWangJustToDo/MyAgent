/**
 * Session Types - Type definitions for session persistence and resume.
 */

import { z } from "zod";

import type { TokenUsage } from "../agent-context";
import type { TodoItem } from "../todo-manager";
import type { ModelMessage, UIMessage } from "ai";

// ============================================================================
// Constants
// ============================================================================

export const SESSION_VERSION = 1;
export const SESSION_DIR = ".sessions";

// ============================================================================
// Session Data Schema
// ============================================================================

export const sessionMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  provider: z.string(),
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
  /** LLM provider used (e.g., "ollama", "openRouter", "deepseek") */
  provider: string;
  /** Model name used */
  model: string;
  /** Full conversation as UIMessages (for client display on resume) */
  uiMessages: UIMessage[];
  /** Compacted messages (for LLM context on resume) */
  compactMessages: ModelMessage[];
  /** Length of the conversation */
  messageLength: number;
  /** Token usage statistics */
  usage: TokenUsage;
  /** Active todos */
  todos: TodoItem[];
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
