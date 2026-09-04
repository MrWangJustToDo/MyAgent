import { getEnv } from "../../env.js";
import { Emitter } from "../../utils/emitter.js";
import { createSequentialIdGenerator } from "../../utils/generate-id.js";

import type { AgentLogFileSinkOptions, LogCategory, LogEntry, LogFilter, LogLevel } from "./types.js";

type AgentLogEvents = {
  entry: LogEntry;
};

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
  private readonly events = new Emitter<AgentLogEvents>();
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
    this.events.emit("entry", entry);

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

  /** Subscribe to typed log events (`entry` carries each new LogEntry). */
  on<K extends keyof AgentLogEvents>(type: K, listener: (payload: AgentLogEvents[K]) => void): () => void {
    return this.events.on(type, listener);
  }

  toConsole(options?: { minLevel?: LogLevel; categories?: LogCategory[] }): () => void {
    return this.on("entry", (entry) => {
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
  // File Sink (disk persistence)
  // ============================================================================

  private fileSinkDir: string | null = null;

  /** Directory the active file sink writes to, or null when none is attached. */
  getFileSinkDir(): string | null {
    return this.fileSinkDir;
  }

  /**
   * Persist log entries to a JSONL file (one LogEntry per line) with size-based
   * rotation. Silent no-op when the env fs lacks `appendFile`. Existing in-memory
   * entries (logged before attach, e.g. session bootstrap events) are backfilled
   * first, then new entries stream in. Returns an unsubscribe function.
   */
  attachFileSink(options: AgentLogFileSinkOptions): () => void {
    let fs: ReturnType<typeof getEnv>["fs"];
    try {
      fs = getEnv().fs;
    } catch {
      return () => {}; // CoreEnv not registered — degrade silently
    }
    if (!fs.appendFile) return () => {}; // no append support — degrade silently

    const appendFile = fs.appendFile;
    if (!appendFile) return () => {};
    const dir = options.dir;
    const filename = options.filename ?? "agent.log";
    const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    const maxFiles = options.maxFiles ?? 5;
    const flushIntervalMs = options.flushIntervalMs ?? 250;
    const filePath = `${dir}/${filename}`;

    let buffer: string[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    /** Shift segments `{file}.{maxFiles-1}` → drop, ..., `{file}` → `{file}.1`, then truncate. */
    const rotate = async (): Promise<void> => {
      const oldest = `${filePath}.${maxFiles - 1}`;
      if (await fs.exists(oldest)) await fs.remove(oldest);
      for (let i = maxFiles - 2; i >= 1; i--) {
        const from = `${filePath}.${i}`;
        const to = `${filePath}.${i + 1}`;
        if (await fs.exists(from)) {
          const content = await fs.readFile(from);
          await fs.writeFile(to, content);
          await fs.remove(from);
        }
      }
      if (await fs.exists(filePath)) {
        const content = await fs.readFile(filePath);
        await fs.writeFile(`${filePath}.1`, content);
      }
      await fs.writeFile(filePath, "");
    };

    const flush = async (): Promise<void> => {
      if (buffer.length === 0) return;
      const lines = buffer;
      buffer = [];
      try {
        await fs.mkdir(dir);
        if (!(await fs.exists(filePath))) {
          await fs.writeFile(filePath, "");
        }
        const content = lines.join("\n") + "\n";
        const contentBytes = new TextEncoder().encode(content).length;
        // Rotate when the active file already meets maxBytes, or when the pending
        // batch would push it past the limit — so a large batch never leaves the
        // active file over budget. Size comes from stat (restart-safe).
        let currentBytes = 0;
        try {
          currentBytes = (await fs.stat(filePath)).size;
        } catch {
          currentBytes = 0;
        }
        if (currentBytes > 0 && currentBytes + contentBytes >= maxBytes) {
          await rotate();
        }
        await appendFile(filePath, content);
      } catch {
        // Non-fatal: log persistence must never break agent execution.
      }
    };

    const schedule = (): void => {
      if (timer || disposed) return;
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, flushIntervalMs);
    };

    // Subscribe first so entries emitted during backfill are not missed, then
    // prepend the already-logged entries (older entries must sort first).
    const unsubscribe = this.on("entry", (entry) => {
      buffer.push(JSON.stringify(entry));
      schedule();
    });
    const existing = this.entries.map((e) => JSON.stringify(e));
    buffer.unshift(...existing);
    if (buffer.length > 0) schedule();

    this.fileSinkDir = dir;

    return () => {
      disposed = true;
      unsubscribe();
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void flush(); // best-effort final flush
    };
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
