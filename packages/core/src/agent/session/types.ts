/**
 * Session Types - Type definitions for session persistence and resume.
 *
 * Uses an append-only JSONL (JSON Lines) format for resilience.
 * Each session file is a `.session.jsonl` file where:
 *   - Line 1 is a header entry with metadata
 *   - Subsequent lines are event entries that update session state
 *   - On load, entries are replayed in order to reconstruct the in-memory SessionData
 *   - Compaction is recorded as a dedicated entry type (not a rewrite)
 */

import { z } from "zod";

import type { TokenUsage } from "../agent-context";
import type { TodoItem } from "../todo-manager";
import type { ModelMessage, UIMessage } from "ai";

// ============================================================================
// Constants
// ============================================================================

export const SESSION_VERSION = 2;
export const SESSION_DIR = ".sessions";
export const SESSION_FILE_SUFFIX = ".session.jsonl";

// ============================================================================
// JSONL Entry Types
// ============================================================================

/**
 * Base fields shared by all JSONL entries.
 */
interface SessionEntryBase {
  /** Unique ID for this entry */
  id: string;
  /** Epoch timestamp */
  timestamp: number;
}

/**
 * Header entry — first line of every session file.
 * Contains immutable session metadata.
 */
export interface SessionHeaderEntry extends SessionEntryBase {
  type: "session";
  /** Schema version for future migrations */
  version: number;
  /** Human-readable session name */
  name: string;
  /** LLM provider used (e.g., "ollama", "openRouter", "deepseek") */
  provider: string;
  /** Model name used */
  model: string;
  /** Timestamp when session was created */
  createdAt: number;
}

/**
 * Update the UI messages array.
 */
export interface UIMessagesEntry extends SessionEntryBase {
  type: "ui_messages";
  uiMessages: UIMessage[];
}

/**
 * Update the compaction summary message.
 */
export interface SummaryMessageEntry extends SessionEntryBase {
  type: "summary_message";
  summaryMessage: ModelMessage | null;
  /** Index in messages where the last compaction cut happened */
  compactIndex: number;
}

/**
 * Update token usage statistics.
 */
export interface UsageEntry extends SessionEntryBase {
  type: "usage";
  usage: TokenUsage;
}

/**
 * Update active todos.
 */
export interface TodosEntry extends SessionEntryBase {
  type: "todos";
  todos: TodoItem[];
}

/**
 * Update the session name.
 */
export interface NameEntry extends SessionEntryBase {
  type: "name";
  name: string;
}

/**
 * Compaction record — records when compaction happened and what was kept.
 */
export interface CompactionEntry extends SessionEntryBase {
  type: "compaction";
  /** The ID of the first entry that was kept after compaction */
  firstKeptEntryId: string;
  /** The ID of the summary message entry that precedes the compacted region */
  summaryEntryId: string;
  /** Number of entries that were discarded */
  entriesDiscarded: number;
}

/**
 * Union of all possible event entry types (excluding the header).
 */
export type SessionEventEntry =
  | UIMessagesEntry
  | SummaryMessageEntry
  | UsageEntry
  | TodosEntry
  | NameEntry
  | CompactionEntry;

/**
 * Union of all entry types that can appear in a session file.
 */
export type SessionEntry = SessionHeaderEntry | SessionEventEntry;

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
  /** Compaction summary message (null if never compacted) */
  summaryMessage: ModelMessage | null;
  /** Index in messages where the last compaction cut happened (0 = no compaction) */
  compactIndex: number;
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
