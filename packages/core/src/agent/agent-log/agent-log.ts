import { z } from "zod";

import { createSequentialIdGenerator } from "../../base/utils.js";

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
// Log ID Generator
// ============================================================================

export const generateLogId = createSequentialIdGenerator("log");

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

// ============================================================================
// AgentLog Class
// ============================================================================

/**
 * AgentLog - Debug logging and notification system for agent operations.
 *
 * Features:
 * 1. **Structured logs** - LogEntry with level, category, data
 * 2. **Notifications** - Active notification set with index for UI cycling
 * 3. **Filtering** - Filter by level, category, tags, time range
 * 4. **Real-time** - Subscribe to log and notification events
 */
export class AgentLog {
  /** Log entries */
  private entries: LogEntry[] = [];

  /** Log listeners */
  private listeners: Set<(entry: LogEntry) => void> = new Set();

  /** Active notifications (ordered by insertion) */
  private notifications: AgentNotification[] = [];

  /** Current notification index for UI display */
  private notifyIndex = 0;

  /** Notification listeners */
  private notifyListeners: Set<AgentNotificationListener> = new Set();

  /** Whether logging is enabled */
  private enabled = true;

  /** Minimum log level */
  private minLevel: LogLevel = "debug";

  /** Maximum entries to keep (0 = unlimited) */
  private maxEntries = 10000;

  /** Level priority for filtering */
  private static readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(options?: { enabled?: boolean; minLevel?: LogLevel; maxEntries?: number }) {
    if (options?.enabled !== undefined) this.enabled = options.enabled;
    if (options?.minLevel) this.minLevel = options.minLevel;
    if (options?.maxEntries !== undefined) this.maxEntries = options.maxEntries;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /** Enable or disable logging */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Set minimum log level */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /** Set max entries to keep */
  setMaxEntries(max: number): void {
    this.maxEntries = max;
    this.trimEntries();
  }

  /** Check if a level should be logged */
  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;
    return AgentLog.levelPriority[level] >= AgentLog.levelPriority[this.minLevel];
  }

  // ============================================================================
  // Logging Methods
  // ============================================================================

  /** Create and add a log entry */
  private log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    options?: {
      data?: Record<string, unknown>;
      error?: Error;
      tags?: string[];
    }
  ): LogEntry | null {
    if (!this.shouldLog(level)) return null;

    const entry: LogEntry = {
      id: generateLogId(),
      timestamp: Date.now(),
      level,
      category,
      message,
    };

    if (options?.data) entry.data = options.data;
    if (options?.tags) entry.tags = options.tags;
    if (options?.error) {
      entry.error = {
        name: options.error.name,
        message: options.error.message,
        stack: options.error.stack,
      };
    }

    this.entries.push(entry);
    this.trimEntries();

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // Ignore listener errors
      }
    }

    return entry;
  }

  /** Log debug message */
  debug(category: LogCategory, message: string, data?: Record<string, unknown>, tags?: string[]): LogEntry | null {
    return this.log("debug", category, message, { data, tags });
  }

  /** Log info message */
  info(category: LogCategory, message: string, data?: Record<string, unknown>, tags?: string[]): LogEntry | null {
    return this.log("info", category, message, { data, tags });
  }

  /** Log warning message */
  warn(category: LogCategory, message: string, data?: Record<string, unknown>, tags?: string[]): LogEntry | null {
    return this.log("warn", category, message, { data, tags });
  }

  /** Log error message */
  error(
    category: LogCategory,
    message: string,
    error?: Error,
    data?: Record<string, unknown>,
    tags?: string[]
  ): LogEntry | null {
    return this.log("error", category, message, { data, error, tags });
  }

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  /** Log agent lifecycle event */
  agent(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.info("agent", message, data);
  }

  /** Log connection event */
  connection(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.debug("connection", message, data);
  }

  /** Log chat/LLM event */
  chat(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.debug("chat", message, data);
  }

  /** Log tool event */
  tool(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.info("tool", message, data);
  }

  /** Log approval event */
  approval(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.info("approval", message, data);
  }

  /** Log stream event */
  stream(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.debug("stream", message, data);
  }

  /** Log stream chunk (verbose) */
  chunk(chunkType: string, data?: Record<string, unknown>): LogEntry | null {
    return this.debug("stream", `Chunk: ${chunkType}`, data, ["chunk"]);
  }

  /** Log todo tracking event */
  todo(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.debug("todo", message, data);
  }

  skill(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.debug("skill", message, data);
  }

  // ============================================================================
  // Notifications
  // ============================================================================

  /**
   * Add a notification to the active set and also log it.
   * Returns the notification ID so it can be dismissed later.
   */
  notify(category: LogCategory, level: NotificationLevel, message: string, data?: Record<string, unknown>): string {
    const notification: AgentNotification = {
      id: generateLogId(),
      category,
      level,
      message,
      data,
      timestamp: Date.now(),
    };

    this.notifications.push(notification);

    // Also log it
    const logLevel = level === "success" ? "info" : level === "warning" ? "warn" : level;
    this.log(logLevel, category, message, { data });

    // Notify listeners
    for (const listener of this.notifyListeners) {
      try {
        listener(notification);
      } catch {
        // Ignore listener errors
      }
    }

    return notification.id;
  }

  /**
   * Dismiss (remove) a notification by ID.
   * Adjusts notifyIndex if needed to stay in bounds.
   */
  dismissNotification(id: string): void {
    const idx = this.notifications.findIndex((n) => n.id === id);
    if (idx === -1) return;
    this.notifications.splice(idx, 1);
    if (this.notifyIndex >= this.notifications.length) {
      this.notifyIndex = Math.max(0, this.notifications.length - 1);
    }
  }

  /** Clear all active notifications. */
  clearNotifications(): void {
    this.notifications = [];
    this.notifyIndex = 0;
  }

  /** Get all active notifications. */
  getNotifications(): AgentNotification[] {
    return this.notifications;
  }

  /** Get the currently indexed notification (for UI display). */
  getCurrentNotification(): AgentNotification | null {
    return this.notifications[this.notifyIndex] ?? null;
  }

  /** Get current notification index. */
  getNotifyIndex(): number {
    return this.notifyIndex;
  }

  /** Set notification index (e.g., to cycle through active notifications). */
  setNotifyIndex(index: number): void {
    if (this.notifications.length === 0) {
      this.notifyIndex = 0;
      return;
    }
    this.notifyIndex = Math.max(0, Math.min(index, this.notifications.length - 1));
  }

  /** Advance to the next notification (wraps around). */
  nextNotification(): AgentNotification | null {
    if (this.notifications.length === 0) return null;
    this.notifyIndex = (this.notifyIndex + 1) % this.notifications.length;
    return this.notifications[this.notifyIndex];
  }

  /** Get the number of active notifications. */
  getNotificationCount(): number {
    return this.notifications.length;
  }

  /** Subscribe to notification events. Returns an unsubscribe function. */
  onNotification(listener: AgentNotificationListener): () => void {
    this.notifyListeners.add(listener);
    return () => this.notifyListeners.delete(listener);
  }

  // ============================================================================
  // Querying
  // ============================================================================

  /** Get all entries */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /** Get entries count */
  getCount(): number {
    return this.entries.length;
  }

  /** Filter entries */
  filter(options: LogFilter): LogEntry[] {
    let result = [...this.entries];

    // Filter by levels
    if (options.levels?.length) {
      result = result.filter((e) => options.levels!.includes(e.level));
    }

    // Filter by categories
    if (options.categories?.length) {
      result = result.filter((e) => options.categories!.includes(e.category));
    }

    // Filter by tags (any match)
    if (options.tags?.length) {
      result = result.filter((e) => e.tags?.some((t) => options.tags!.includes(t)));
    }

    // Filter by time range
    if (options.since !== undefined) {
      result = result.filter((e) => e.timestamp >= options.since!);
    }
    if (options.until !== undefined) {
      result = result.filter((e) => e.timestamp <= options.until!);
    }

    // Search in message
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.message.toLowerCase().includes(searchLower) || JSON.stringify(e.data).toLowerCase().includes(searchLower)
      );
    }

    // Limit results
    if (options.limit !== undefined && options.limit > 0) {
      result = result.slice(-options.limit);
    }

    return result;
  }

  /** Get recent entries */
  recent(count = 50): LogEntry[] {
    return this.entries.slice(-count);
  }

  /** Get errors only */
  errors(): LogEntry[] {
    return this.filter({ levels: ["error"] });
  }

  /** Get warnings and errors */
  issues(): LogEntry[] {
    return this.filter({ levels: ["warn", "error"] });
  }

  // ============================================================================
  // Subscription
  // ============================================================================

  /** Subscribe to log events */
  onLog(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Create a console logger subscriber */
  toConsole(options?: { minLevel?: LogLevel; categories?: LogCategory[] }): () => void {
    return this.onLog((entry) => {
      // Check level
      if (options?.minLevel && AgentLog.levelPriority[entry.level] < AgentLog.levelPriority[options.minLevel]) {
        return;
      }

      // Check category
      if (options?.categories?.length && !options.categories.includes(entry.category)) {
        return;
      }

      const time = new Date(entry.timestamp).toISOString().slice(11, 23);
      const prefix = `[${time}] [${entry.level.toUpperCase().padEnd(5)}] [${entry.category}]`;
      const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : "";

      switch (entry.level) {
        case "debug":
          console.debug(`${prefix} ${entry.message}${dataStr}`);
          break;
        case "info":
          console.info(`${prefix} ${entry.message}${dataStr}`);
          break;
        case "warn":
          console.warn(`${prefix} ${entry.message}${dataStr}`);
          break;
        case "error":
          console.error(`${prefix} ${entry.message}${dataStr}`);
          if (entry.error?.stack) {
            console.error(entry.error.stack);
          }
          break;
      }
    });
  }

  // ============================================================================
  // Clear / Trim
  // ============================================================================

  /** Clear all entries and notifications */
  clear(): void {
    this.entries = [];
    this.notifications = [];
    this.notifyIndex = 0;
  }

  /** Trim entries to max limit */
  private trimEntries(): void {
    if (this.maxEntries > 0 && this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /** Export logs to JSON */
  toJSON(): { entries: LogEntry[]; exported: number } {
    return {
      entries: this.entries,
      exported: Date.now(),
    };
  }

  /** Import logs from JSON */
  static fromJSON(data: { entries: LogEntry[] }): AgentLog {
    const log = new AgentLog();
    log.entries = data.entries || [];
    return log;
  }

  /** Export to string (for file/clipboard) */
  toString(): string {
    return this.entries
      .map((e) => {
        const time = new Date(e.timestamp).toISOString();
        const dataStr = e.data ? ` | data: ${JSON.stringify(e.data)}` : "";
        const errorStr = e.error ? ` | error: ${e.error.message}` : "";
        return `[${time}] [${e.level.toUpperCase()}] [${e.category}] ${e.message}${dataStr}${errorStr}`;
      })
      .join("\n");
  }
}

// ============================================================================
// Zod Schemas
// ============================================================================

const logLevels = ["debug", "info", "warn", "error"] as const;
export const logLevelSchema = z.enum(logLevels);

const logCategories = [
  "agent",
  "connection",
  "chat",
  "tool",
  "approval",
  "stream",
  "middleware",
  "todo",
  "skill",
  "memory",
  "error",
  "system",
  "custom",
] as const;
export const logCategorySchema = z.enum(logCategories);

export const logEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  level: logLevelSchema,
  category: logCategorySchema,
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      name: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
  tags: z.array(z.string()).optional(),
});

export const logFilterSchema = z.object({
  levels: z.array(logLevelSchema).optional(),
  categories: z.array(logCategorySchema).optional(),
  tags: z.array(z.string()).optional(),
  since: z.number().optional(),
  until: z.number().optional(),
  search: z.string().optional(),
  limit: z.number().optional(),
});
