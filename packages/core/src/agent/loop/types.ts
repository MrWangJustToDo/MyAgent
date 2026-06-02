import type { LanguageModel, ModelMessage } from "ai";

// ============================================================================
// Agent Status
// ============================================================================

export type AgentStatus = "idle" | "running" | "completed" | "error" | "aborted" | "waiting" | "compacting";

/** Run options */
export interface AgentRunOptions {
  /** User prompt (creates a user message) */
  prompt?: string;
  /** Messages array */
  messages?: ModelMessage[];
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Override model for this run */
  model?: LanguageModel;
}

// ============================================================================
// Notification System
// ============================================================================

/** Notification severity levels */
export type NotificationLevel = "info" | "success" | "warning" | "error";

/**
 * A transient notification emitted by the agent for UI display.
 *
 * Unlike `AgentStatus` (which is a persistent state), notifications are
 * one-shot events for background tasks: memory extraction, consolidation,
 * session saves, etc. The UI can show them as toasts, status-bar flashes, or logs.
 */
export interface AgentNotification {
  /** Notification category (e.g., "memory", "compaction", "session") */
  category: string;
  /** Severity level */
  level: NotificationLevel;
  /** Human-readable message */
  message: string;
  /** Optional structured data */
  data?: Record<string, unknown>;
  /** Timestamp (ms since epoch) */
  timestamp: number;
}

export type AgentNotificationListener = (notification: AgentNotification) => void;
