/**
 * SessionStore - File-based session persistence.
 *
 * Stores sessions as individual JSON files in `.sessions/{id}.json`.
 * Provides save/load/list/delete/getLatest operations.
 */

import { generateId } from "../../base/utils.js";

import { SESSION_DIR, SESSION_VERSION } from "./types.js";

import type { SessionData, SessionMeta } from "./types.js";
import type { SandboxFileSystem } from "../../environment/types.js";

// ============================================================================
// SessionStore Class
// ============================================================================

export class SessionStore {
  private fs: SandboxFileSystem;

  constructor(filesystem: SandboxFileSystem) {
    this.fs = filesystem;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Create a new empty session and return its ID.
   */
  async create(options: { provider: string; model: string; name?: string }): Promise<SessionData> {
    const id = generateId("ses");
    const now = Date.now();

    const session: SessionData = {
      id,
      name: options.name || "New Session",
      version: SESSION_VERSION,
      provider: options.provider,
      model: options.model,
      uiMessages: [],
      compactMessages: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      todos: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.save(session);
    return session;
  }

  /**
   * Save a session to disk. Creates the directory if needed.
   */
  async save(session: SessionData): Promise<void> {
    await this.ensureDir();
    session.updatedAt = Date.now();
    const filePath = this.getFilePath(session.id);
    const content = JSON.stringify(session);
    await this.fs.writeFile(filePath, content);
  }

  /**
   * Load a full session by ID.
   */
  async load(id: string): Promise<SessionData | null> {
    const filePath = this.getFilePath(id);
    const exists = await this.fs.exists(filePath);
    if (!exists) return null;

    const content = await this.fs.readFile(filePath);
    return JSON.parse(content) as SessionData;
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
      if (entry.type !== "file" || !entry.name.endsWith(".json")) continue;

      try {
        const filePath = `${SESSION_DIR}/${entry.name}`;
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
   * Find a session by name (partial match, case-insensitive).
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
    if (!exists) return false;
    await this.fs.remove(filePath);
    return true;
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

  // ==========================================================================
  // Private
  // ==========================================================================

  private getFilePath(id: string): string {
    return `${SESSION_DIR}/${id}.json`;
  }

  private async ensureDir(): Promise<void> {
    const exists = await this.fs.exists(SESSION_DIR);
    if (!exists) {
      await this.fs.mkdir(SESSION_DIR);
    }
  }
}
