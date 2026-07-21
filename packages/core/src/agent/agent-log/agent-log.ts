import { createSequentialIdGenerator } from "../utils.js";

import type { LogCategory, LogEntry, LogFilter, LogLevel } from "./types.js";

// ============================================================================
// Log ID Generator
// ============================================================================

export const generateLogId = createSequentialIdGenerator("log");

// ============================================================================
// AgentLog Class
// ============================================================================

/**
 * AgentLog - Debug logging for agent operations.
 *
 * Features:
 * 1. **Structured logs** - LogEntry with level, category, data
 * 2. **Filtering** - Filter by level, category, tags, time range
 * 3. **Real-time** - Subscribe to log events
 */
export class AgentLog {
  private entries: LogEntry[] = [];
  private listeners: Set<(entry: LogEntry) => void> = new Set();
  private enabled = true;
  private minLevel: LogLevel = "debug";
  private maxEntries = 10000;

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

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  setMaxEntries(max: number): void {
    this.maxEntries = max;
    this.trimEntries();
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;
    return AgentLog.levelPriority[level] >= AgentLog.levelPriority[this.minLevel];
  }

  // ============================================================================
  // Logging Methods
  // ============================================================================

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

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // Ignore listener errors
      }
    }

    return entry;
  }

  debug(category: LogCategory, message: string, data?: Record<string, unknown>, tags?: string[]): LogEntry | null {
    return this.log("debug", category, message, { data, tags });
  }

  info(category: LogCategory, message: string, data?: Record<string, unknown>, tags?: string[]): LogEntry | null {
    return this.log("info", category, message, { data, tags });
  }

  warn(category: LogCategory, message: string, data?: Record<string, unknown>, tags?: string[]): LogEntry | null {
    return this.log("warn", category, message, { data, tags });
  }

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

  agent(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.info("agent", message, data);
  }

  chat(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.debug("chat", message, data);
  }

  tool(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.info("tool", message, data);
  }

  approval(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.info("approval", message, data);
  }

  todo(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.debug("todo", message, data);
  }

  skill(message: string, data?: Record<string, unknown>): LogEntry | null {
    return this.debug("skill", message, data);
  }

  // ============================================================================
  // Querying
  // ============================================================================

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getCount(): number {
    return this.entries.length;
  }

  filter(options: LogFilter): LogEntry[] {
    let result = [...this.entries];

    if (options.levels?.length) {
      result = result.filter((e) => options.levels!.includes(e.level));
    }
    if (options.categories?.length) {
      result = result.filter((e) => options.categories!.includes(e.category));
    }
    if (options.tags?.length) {
      result = result.filter((e) => e.tags?.some((t) => options.tags!.includes(t)));
    }
    if (options.since !== undefined) {
      result = result.filter((e) => e.timestamp >= options.since!);
    }
    if (options.until !== undefined) {
      result = result.filter((e) => e.timestamp <= options.until!);
    }
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.message.toLowerCase().includes(searchLower) || JSON.stringify(e.data).toLowerCase().includes(searchLower)
      );
    }
    if (options.limit !== undefined && options.limit > 0) {
      result = result.slice(-options.limit);
    }

    return result;
  }

  recent(count = 50): LogEntry[] {
    return this.entries.slice(-count);
  }

  errors(): LogEntry[] {
    return this.filter({ levels: ["error"] });
  }

  issues(): LogEntry[] {
    return this.filter({ levels: ["warn", "error"] });
  }

  // ============================================================================
  // Subscription
  // ============================================================================

  onLog(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toConsole(options?: { minLevel?: LogLevel; categories?: LogCategory[] }): () => void {
    return this.onLog((entry) => {
      if (options?.minLevel && AgentLog.levelPriority[entry.level] < AgentLog.levelPriority[options.minLevel]) {
        return;
      }
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

  clear(): void {
    this.entries = [];
  }

  private trimEntries(): void {
    if (this.maxEntries > 0 && this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  toJSON(): { entries: LogEntry[]; exported: number } {
    return {
      entries: this.entries,
      exported: Date.now(),
    };
  }

  static fromJSON(data: { entries: LogEntry[] }): AgentLog {
    const log = new AgentLog();
    log.entries = data.entries || [];
    return log;
  }

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
