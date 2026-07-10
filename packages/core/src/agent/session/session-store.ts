/**
 * SessionStore - Single-file JSON session persistence.
 *
 * Stores sessions as `.session.json` files in `.sessions/` directory.
 * Each file contains a single JSON object with the full SessionData.
 * Writes are full overwrites — simple, correct, and produces exactly
 * one copy of uiMessages regardless of how many saves occur.
 */

import { getEnv } from "../../env.js";
import { generateId } from "../utils.js";

import { SESSION_DIR, SESSION_FILE_SUFFIX, SESSION_VERSION } from "./types.js";

import type { SessionData, SessionMeta } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default empty token usage */
const EMPTY_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

// ============================================================================
// SessionStore Class
// ============================================================================

export class SessionStore {
  /**
   * Hash of the last saved JSON string per session.
   * Used to skip writes when nothing changed.
   */
  private lastSavedHash: Map<string, string> = new Map();

  /**
   * Per-session write lock to prevent concurrent saves from racing.
   */
  private saveLocks: Map<string, Promise<void>> = new Map();

  private get fs() {
    return getEnv().fs;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Create a new empty session and return its SessionData.
   * Does NOT write to disk — the first call to save() writes the file.
   */
  create(options: { modelStyle: string; model: string; name?: string }): SessionData {
    const id = generateId("ses");
    const now = Date.now();

    return {
      id,
      name: options.name || "New Session",
      version: SESSION_VERSION,
      modelStyle: options.modelStyle === "anthropic" ? "anthropic" : "openai",
      model: options.model,
      uiMessages: [],
      summaryMessage: null,
      compactIndex: 0,
      usage: { ...EMPTY_USAGE },
      todos: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Save a session to disk as a single JSON file (full overwrite).
   * Skips the write if the content hasn't changed since the last save.
   * Serializes concurrent saves per session to prevent race conditions.
   */
  async save(session: SessionData): Promise<void> {
    const prev = this.saveLocks.get(session.id) ?? Promise.resolve();
    const current = prev.then(() => this.doSave(session)).catch(() => {});
    this.saveLocks.set(session.id, current);
    return current;
  }

  /**
   * Load a full session by ID from disk.
   */
  async load(id: string): Promise<SessionData | null> {
    const session = await this.tryLoadJson(this.getFilePath(id));
    if (!session) return null;

    if (session.id !== id && id.startsWith("ses_")) {
      session.id = id;
    }
    return session;
  }

  /**
   * List all sessions (metadata only, sorted by updatedAt descending).
   */
  async list(): Promise<SessionMeta[]> {
    const dirExists = await this.fs.exists(SESSION_DIR);
    if (!dirExists) return [];

    const entries = await this.fs.readdir(SESSION_DIR);
    const sessions: SessionMeta[] = [];

    for (const entry of entries) {
      if (entry.type !== "file" || !entry.name.endsWith(SESSION_FILE_SUFFIX)) continue;

      const id = entry.name.slice(0, -SESSION_FILE_SUFFIX.length);

      try {
        const data = await this.tryLoadJson(`${SESSION_DIR}/${entry.name}`);
        if (!data) continue;

        sessions.push({
          id: data.id || id,
          name: data.name,
          version: data.version,
          modelStyle: data.modelStyle,
          model: data.model,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
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
    if (await this.fs.exists(filePath)) {
      await this.fs.remove(filePath);
      this.lastSavedHash.delete(id);
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
   * Clear in-memory cache for a session.
   */
  clearCache(id: string): void {
    this.lastSavedHash.delete(id);
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private async doSave(session: SessionData): Promise<void> {
    await this.ensureDir();

    session.updatedAt = Date.now();

    const json = JSON.stringify(session);

    // Skip write if content is identical to last save
    const lastHash = this.lastSavedHash.get(session.id);
    if (lastHash === json) return;

    const filePath = this.getFilePath(session.id);
    await this.fs.writeFile(filePath, json);
    this.lastSavedHash.set(session.id, json);
  }

  private async tryLoadJson(filePath: string): Promise<SessionData | null> {
    if (!(await this.fs.exists(filePath))) return null;
    try {
      const content = await this.fs.readFile(filePath);
      return JSON.parse(content) as SessionData;
    } catch {
      return null;
    }
  }

  private getFilePath(id: string): string {
    return `${SESSION_DIR}/${id}${SESSION_FILE_SUFFIX}`;
  }

  private async ensureDir(): Promise<void> {
    if (!(await this.fs.exists(SESSION_DIR))) {
      await this.fs.mkdir(SESSION_DIR);
    }
  }
}
