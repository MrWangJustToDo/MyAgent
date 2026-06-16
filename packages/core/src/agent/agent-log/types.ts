// ============================================================================
// Log Types
// ============================================================================

/** Log levels */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Log categories for filtering */
export type LogCategory =
  | "agent" // Agent lifecycle
  | "connection" // Connection events
  | "chat" // Chat/LLM interactions
  | "tool" // Tool calls and results
  | "approval" // Approval flow
  | "stream" // Stream events
  | "middleware" // Middleware processing
  | "todo" // Todo tracking
  | "skill" // skill load
  | "memory" // Memory system
  | "hooks" // Hook system
  | "error" // Errors
  | "system" // System/initialization events
  | "custom"; // Custom logs

/** Log entry */
export interface LogEntry {
  /** Unique log ID */
  id: string;
  /** Timestamp (ms since epoch) */
  timestamp: number;
  /** Log level */
  level: LogLevel;
  /** Log category */
  category: LogCategory;
  /** Log message */
  message: string;
  /** Optional structured data */
  data?: Record<string, unknown>;
  /** Optional error */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  /** Optional tags for filtering */
  tags?: string[];
}

/** Log filter options */
export interface LogFilter {
  /** Filter by levels */
  levels?: LogLevel[];
  /** Filter by categories */
  categories?: LogCategory[];
  /** Filter by tags (any match) */
  tags?: string[];
  /** Filter by time range (start) */
  since?: number;
  /** Filter by time range (end) */
  until?: number;
  /** Search in message */
  search?: string;
  /** Limit results */
  limit?: number;
}

// ============================================================================
// Notification Types
// ============================================================================

/** Notification severity levels */
export type NotificationLevel = "info" | "success" | "warning" | "error";

/**
 * A transient notification for UI display.
 * Created via `AgentLog.notify()`. Multiple notifications can be active
 * simultaneously; use `notifyIndex` to track which one the UI is showing.
 */
export interface AgentNotification {
  /** Unique ID (same format as log entry IDs) */
  id: string;
  /** Category (e.g., "memory", "compaction", "session") */
  category: LogCategory;
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
