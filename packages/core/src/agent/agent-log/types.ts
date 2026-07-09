// ============================================================================
// Log Types
// ============================================================================

/** Log levels */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Log categories for filtering */
export type LogCategory =
  | "agent" // Agent lifecycle
  | "chat" // Chat/LLM interactions
  | "tool" // Tool calls and results
  | "approval" // Approval flow
  | "stream" // Stream events
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
