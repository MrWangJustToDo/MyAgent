/**
 * SessionStore - Append-only JSONL session persistence.
 *
 * Stores sessions as `.session.jsonl` files in `.sessions/` directory.
 * Uses an append-only format where:
 *   - Line 1 is a header entry with session metadata (written once)
 *   - Subsequent lines are event entries that update individual fields
 *   - On load, entries are replayed in order to reconstruct full state
 *
 * Benefits over single-file JSON:
 *   - O(1) writes per event — no full file rewrite
 *   - Survives partial writes — only the last (possibly partial) entry is lost
 *   - Enables future branching, time-travel, and auditing
 *   - Compaction is recorded as an entry type, not a destructive rewrite
 */

import { generateId } from "../../base/utils.js";

import { SESSION_DIR, SESSION_FILE_SUFFIX, SESSION_VERSION } from "./types.js";

import type { SessionData, SessionMeta, SessionEntry, SessionHeaderEntry } from "./types.js";
import type { SandboxFileSystem } from "../../environment/types.js";

// ============================================================================
// Constants
// ============================================================================

/** Legacy file suffix for backward compatibility */
const LEGACY_FILE_SUFFIX = ".json";

/** Default empty token usage */
const EMPTY_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

// ============================================================================
// SessionStore Class
// ============================================================================

export class SessionStore {
  private fs: SandboxFileSystem;

  /**
   * In-memory snapshot of the last saved state for each session.
   * Used for efficient diffing — only changed fields get written as entries.
   */
  private lastSavedState: Map<string, SessionData> = new Map();

  constructor(filesystem: SandboxFileSystem) {
    this.fs = filesystem;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Create a new empty session and return its SessionData.
   * Does NOT write to disk — the first call to save() writes the header + entries.
   */
  create(options: { provider: string; model: string; name?: string }): SessionData {
    const id = generateId("ses");
    const now = Date.now();

    const session: SessionData = {
      id,
      name: options.name || "New Session",
      version: SESSION_VERSION,
      provider: options.provider,
      model: options.model,
      uiMessages: [],
      summaryMessage: null,
      compactIndex: 0,
      usage: { ...EMPTY_USAGE },
      todos: [],
      createdAt: now,
      updatedAt: now,
    };

    return session;
  }

  /**
   * Save a session persistantly using append-only JSONL entries.
   *
   * Only writes entries for fields that have changed since the last save,
   * making writes O(1) for typical single-field updates.
   */
  async save(session: SessionData): Promise<void> {
    await this.ensureDir();

    session.updatedAt = Date.now();
    const filePath = this.getFilePath(session.id);
    const lastState = this.lastSavedState.get(session.id);

    // Collect entries to append
    const entries: string[] = [];

    if (!lastState) {
      // First save for this session — write header + all initial fields
      const header = this.buildHeader(session);
      entries.push(this.serializeEntry(header));
      entries.push(
        this.serializeEntry({
          type: "ui_messages" as const,
          id: generateId("ent"),
          timestamp: session.updatedAt,
          uiMessages: session.uiMessages,
        })
      );
      if (session.summaryMessage || session.compactIndex > 0) {
        entries.push(
          this.serializeEntry({
            type: "summary_message" as const,
            id: generateId("ent"),
            timestamp: session.updatedAt,
            summaryMessage: session.summaryMessage,
            compactIndex: session.compactIndex,
          })
        );
      }
      if (session.usage.inputTokens > 0 || session.usage.outputTokens > 0) {
        entries.push(
          this.serializeEntry({
            type: "usage" as const,
            id: generateId("ent"),
            timestamp: session.updatedAt,
            usage: session.usage,
          })
        );
      }
      if (session.todos.length > 0) {
        entries.push(
          this.serializeEntry({
            type: "todos" as const,
            id: generateId("ent"),
            timestamp: session.updatedAt,
            todos: session.todos,
          })
        );
      }
      if (session.name !== "New Session") {
        entries.push(
          this.serializeEntry({
            type: "name" as const,
            id: generateId("ent"),
            timestamp: session.updatedAt,
            name: session.name,
          })
        );
      }
    } else {
      // Subsequent save — write entries for changed fields only
      // Use JSON.stringify for deep content comparison (reference equality is unreliable
      // after JSON round-trip cloning in lastSavedState)
      if (JSON.stringify(session.uiMessages) !== JSON.stringify(lastState.uiMessages)) {
        entries.push(
          this.serializeEntry({
            type: "ui_messages" as const,
            id: generateId("ent"),
            timestamp: session.updatedAt,
            uiMessages: session.uiMessages,
          })
        );
      }
      if (
        JSON.stringify(session.summaryMessage) !== JSON.stringify(lastState.summaryMessage) ||
        session.compactIndex !== lastState.compactIndex
      ) {
        entries.push(
          this.serializeEntry({
            type: "summary_message" as const,
            id: generateId("ent"),
            timestamp: session.updatedAt,
            summaryMessage: session.summaryMessage,
            compactIndex: session.compactIndex,
          })
        );
      }
      if (JSON.stringify(session.usage) !== JSON.stringify(lastState.usage)) {
        entries.push(
          this.serializeEntry({
            type: "usage" as const,
            id: generateId("ent"),
            timestamp: session.updatedAt,
            usage: session.usage,
          })
        );
      }
      if (JSON.stringify(session.todos) !== JSON.stringify(lastState.todos)) {
        entries.push(
          this.serializeEntry({
            type: "todos" as const,
            id: generateId("ent"),
            timestamp: session.updatedAt,
            todos: session.todos,
          })
        );
      }
      if (session.name !== lastState.name) {
        entries.push(
          this.serializeEntry({
            type: "name" as const,
            id: generateId("ent"),
            timestamp: session.updatedAt,
            name: session.name,
          })
        );
      }
    }

    // If nothing changed, skip the write
    if (entries.length === 0) return;

    // Append all entries to the file
    const content = entries.join("\n") + "\n";

    if (this.fs.appendFile) {
      await this.fs.appendFile(filePath, content);
    } else {
      // Fallback for environments without native append support
      const existing = (await this.fs.exists(filePath)) ? await this.fs.readFile(filePath) : "";
      await this.fs.writeFile(filePath, existing + content);
    }

    // Update last saved state
    this.lastSavedState.set(session.id, JSON.parse(JSON.stringify(session)));
  }

  /**
   * Load a full session by ID from disk.
   * Replays all JSONL entries to reconstruct the in-memory SessionData.
   * Falls back to legacy `.json` format if `.session.jsonl` doesn't exist.
   */
  async load(id: string): Promise<SessionData | null> {
    // Try new format first
    const filePath = this.getFilePath(id);
    const exists = await this.fs.exists(filePath);

    if (exists) {
      try {
        const content = await this.fs.readFile(filePath);
        const session = this.replayEntries(content.trim().split("\n"));
        if (session) {
          this.lastSavedState.set(id, JSON.parse(JSON.stringify(session)));
        }
        return session;
      } catch {
        // Fall through to legacy format
      }
    }

    // Try legacy format
    const legacyPath = this.getLegacyFilePath(id);
    const legacyExists = await this.fs.exists(legacyPath);
    if (!legacyExists) return null;

    try {
      const content = await this.fs.readFile(legacyPath);
      const session = JSON.parse(content) as SessionData;
      // Upgrade to v2 on load
      session.version = SESSION_VERSION;
      this.lastSavedState.set(id, JSON.parse(JSON.stringify(session)));
      return session;
    } catch {
      return null;
    }
  }

  /**
   * List all sessions (metadata only, sorted by updatedAt descending).
   * Reads only the first line (header) of each session file for efficiency.
   */
  async list(): Promise<SessionMeta[]> {
    const dirExists = await this.fs.exists(SESSION_DIR);
    if (!dirExists) return [];

    const entries = await this.fs.readdir(SESSION_DIR);
    const sessions: SessionMeta[] = [];

    // Collect all session file names (new and legacy format)
    const sessionFiles: Array<{ name: string; isLegacy: boolean }> = [];
    for (const entry of entries) {
      if (entry.type !== "file") continue;
      if (entry.name.endsWith(SESSION_FILE_SUFFIX)) {
        sessionFiles.push({ name: entry.name, isLegacy: false });
      } else if (entry.name.endsWith(LEGACY_FILE_SUFFIX)) {
        // Only include legacy files that aren't already a .session.jsonl file
        const base = entry.name.slice(0, -LEGACY_FILE_SUFFIX.length);
        if (!sessionFiles.some((f) => f.name.startsWith(base))) {
          sessionFiles.push({ name: entry.name, isLegacy: true });
        }
      }
    }

    for (const { name, isLegacy } of sessionFiles) {
      try {
        const filePath = `${SESSION_DIR}/${name}`;

        if (isLegacy) {
          // Legacy format — read the whole file
          const content = await this.fs.readFile(filePath);
          const data = JSON.parse(content) as SessionData;
          sessions.push({
            id: data.id,
            name: data.name,
            version: data.version,
            provider: data.provider,
            model: data.model,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          });
        } else {
          // New format — read only the first line (header)
          const content = await this.fs.readFile(filePath);
          const firstNewline = content.indexOf("\n");
          const headerLine = firstNewline === -1 ? content : content.slice(0, firstNewline);
          const header = JSON.parse(headerLine) as SessionHeaderEntry;
          if (header.type !== "session") continue;
          sessions.push({
            id: header.id || idFromFileName(name),
            name: header.name,
            version: header.version,
            provider: header.provider,
            model: header.model,
            createdAt: header.createdAt,
            updatedAt: header.timestamp, // last entry timestamp approximates updatedAt
          });
        }
      } catch {
        // Skip corrupted files
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get the most recently updated session.
   */
  async getLatest(): Promise<SessionData | null> {
    const metas = await this.list();
    if (metas.length === 0) return null;
    return this.load(metas[0].id);
  }

  /**
   * Find sessions by name (partial match, case-insensitive).
   */
  async findByName(query: string): Promise<SessionMeta[]> {
    const all = await this.list();
    const lower = query.toLowerCase();
    return all.filter((s) => s.name.toLowerCase().includes(lower));
  }

  /**
   * Delete a session by ID.
   */
  async delete(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    const exists = await this.fs.exists(filePath);

    if (exists) {
      await this.fs.remove(filePath);
      this.lastSavedState.delete(id);
      return true;
    }

    // Try legacy format
    const legacyPath = this.getLegacyFilePath(id);
    const legacyExists = await this.fs.exists(legacyPath);
    if (legacyExists) {
      await this.fs.remove(legacyPath);
      this.lastSavedState.delete(id);
      return true;
    }

    return false;
  }

  /**
   * Update session name.
   */
  async rename(id: string, name: string): Promise<void> {
    const session = await this.load(id);
    if (!session) return;
    session.name = name;
    await this.save(session);
  }

  /**
   * Clear in-memory last saved state for a session.
   * Used when discarding cached state (e.g., after manual file edits).
   */
  clearCache(id: string): void {
    this.lastSavedState.delete(id);
  }

  // ==========================================================================
  // Private: JSONL Entry Operations
  // ==========================================================================

  /**
   * Build the header entry for a new session file.
   */
  private buildHeader(session: SessionData): SessionHeaderEntry {
    return {
      type: "session",
      id: generateId("ent"),
      version: SESSION_VERSION,
      name: session.name,
      provider: session.provider,
      model: session.model,
      createdAt: session.createdAt,
      timestamp: session.createdAt,
    };
  }

  /**
   * Serialize a session entry to a JSON line string.
   */
  private serializeEntry(entry: SessionEntry): string {
    return JSON.stringify(entry);
  }

  /**
   * Replay an array of JSON lines to reconstruct SessionData.
   */
  private replayEntries(lines: string[]): SessionData | null {
    if (lines.length === 0) return null;

    // Initialise with defaults
    const session: SessionData = {
      id: "",
      name: "New Session",
      version: SESSION_VERSION,
      provider: "",
      model: "",
      uiMessages: [],
      summaryMessage: null,
      compactIndex: 0,
      usage: { ...EMPTY_USAGE },
      todos: [],
      createdAt: 0,
      updatedAt: 0,
    };

    let headerParsed = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const entry = JSON.parse(trimmed);

        if (!entry.type) continue;

        switch (entry.type) {
          case "session": {
            const h = entry as SessionHeaderEntry;
            session.id = h.id || session.id;
            session.version = h.version ?? SESSION_VERSION;
            session.name = h.name ?? session.name;
            session.provider = h.provider ?? session.provider;
            session.model = h.model ?? session.model;
            session.createdAt = h.createdAt ?? session.createdAt;
            session.updatedAt = h.timestamp ?? session.updatedAt;
            headerParsed = true;
            break;
          }
          case "ui_messages": {
            session.uiMessages = entry.uiMessages ?? session.uiMessages;
            session.updatedAt = entry.timestamp ?? session.updatedAt;
            break;
          }
          case "summary_message": {
            session.summaryMessage = entry.summaryMessage ?? session.summaryMessage;
            session.compactIndex = entry.compactIndex ?? session.compactIndex;
            session.updatedAt = entry.timestamp ?? session.updatedAt;
            break;
          }
          case "usage": {
            session.usage = entry.usage ?? session.usage;
            session.updatedAt = entry.timestamp ?? session.updatedAt;
            break;
          }
          case "todos": {
            session.todos = entry.todos ?? session.todos;
            session.updatedAt = entry.timestamp ?? session.updatedAt;
            break;
          }
          case "name": {
            session.name = entry.name ?? session.name;
            session.updatedAt = entry.timestamp ?? session.updatedAt;
            break;
          }
          case "compaction": {
            // Compaction records are informational; no state changes needed
            // They can be used for recovery or auditing in the future
            session.updatedAt = entry.timestamp ?? session.updatedAt;
            break;
          }
        }
      } catch {
        // Skip malformed lines — this is the resilience benefit of JSONL
        continue;
      }
    }

    if (!headerParsed || !session.id) return null;

    return session;
  }

  // ==========================================================================
  // Private: File Paths
  // ==========================================================================

  private getFilePath(id: string): string {
    return `${SESSION_DIR}/${id}${SESSION_FILE_SUFFIX}`;
  }

  private getLegacyFilePath(id: string): string {
    return `${SESSION_DIR}/${id}${LEGACY_FILE_SUFFIX}`;
  }

  private async ensureDir(): Promise<void> {
    const exists = await this.fs.exists(SESSION_DIR);
    if (!exists) {
      await this.fs.mkdir(SESSION_DIR);
    }
  }
}

// ============================================================================
// Utility
// ============================================================================

/**
 * Extract session ID from a file name.
 * E.g., "ses_abc123.session.jsonl" -> "ses_abc123"
 */
function idFromFileName(fileName: string): string {
  const base = fileName.endsWith(SESSION_FILE_SUFFIX)
    ? fileName.slice(0, -SESSION_FILE_SUFFIX.length)
    : fileName.endsWith(LEGACY_FILE_SUFFIX)
      ? fileName.slice(0, -LEGACY_FILE_SUFFIX.length)
      : fileName;
  return base;
}
