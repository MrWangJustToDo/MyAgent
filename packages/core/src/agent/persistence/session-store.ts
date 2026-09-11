/**
 * SessionStore - Append-only incremental session persistence.
 *
 * Each session is one JSONL log `.agents/sessions/{id}.session.jsonl` (source of
 * truth). Every line is one message plus the full non-message state snapshot at
 * that point. `save()` appends only what changed: one line per new/changed
 * UIMessage, or a re-emit of the last message when only state changed. `load()`
 * folds the log by message id (later line wins).
 *
 * Binary assets (images, audio, PDFs) are extracted from inline base64 and
 * stored as content-addressed files under `.agents/media/<hash>.<ext>`. The
 * session log stores only `media://<hash>` references in `source.value` and
 * a `MediaRef` in `metadata.mediaRef`. Hydrate/Dehydrate happens in
 * SessionService via `media-utils.ts`.
 */

import { getEnv } from "../../env.js";
import { generateId } from "../../utils/generate-id.js";
import { isToolCallPart } from "../stream/message-parts.js";

import { appendLogLines, foldLog, hasUserMessage, readLastState, readLog, writeLog } from "./session-journal.js";
import { fingerprintUIMessage } from "./session-sync-tracker.js";
import {
  SESSION_DIR,
  SESSION_LOG_MESSAGE,
  SESSION_LOG_SUFFIX,
  SESSION_VERSION,
  isSupportedSessionVersion,
} from "./types.js";

import type { SessionData, SessionLogLine, SessionMeta, SessionStateFields } from "./types.js";
import type { UIMessage } from "@tanstack/ai";

// ============================================================================
// Constants
// ============================================================================

/** Default empty token usage */
const EMPTY_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/**
 * How long a startup-reused empty session stays reserved before another
 * process may select it again. Cross-process live ownership is not shared, so
 * the reservation is the only cross-process signal; the window must cover
 * "launch two terminals back-to-back" while still releasing itself after a
 * crash (no stale locks to clean up).
 */
const EMPTY_SESSION_RESERVE_MS = 5 * 60_000;

/** What we remember about the last durable write, to compute the next delta. */
interface LastSaved {
  /** Message ids in order at the last write (prefix check for append-only). */
  ids: string[];
  /** id → fingerprint at the last write. */
  fingerprints: Map<string, string>;
  /** Content signature at the last write (state sans `updatedAt` + fingerprints). */
  signature: string;
}

// ============================================================================
// SessionStore Class
// ============================================================================

export class SessionStore {
  /** Last durable write per session — drives delta computation and no-op dedupe. */
  private lastSaved: Map<string, LastSaved> = new Map();

  /** Known approval decision times per session (toolCallId → epoch ms). */
  private approvalTimes: Map<string, Record<string, number>> = new Map();

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
   * Does NOT write to disk — the first call to save() writes the log.
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
      usage: { ...EMPTY_USAGE },
      todos: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Save a session: append only the messages whose content changed since the
   * last write, plus a full state snapshot on each appended line. State-only
   * changes re-emit the last message line. Skips all IO when nothing changed.
   * Serializes concurrent saves per session.
   */
  async save(session: SessionData): Promise<void> {
    const prev = this.saveLocks.get(session.id) ?? Promise.resolve();
    // Run doSave after the previous lock; return the rejecting promise to callers
    // so failures surface (session:save-error). Keep the stored lock chain
    // non-rejecting so one failure does not permanently stall later saves.
    const run = prev.then(() => this.doSave(session));
    this.saveLocks.set(
      session.id,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  }

  /**
   * Load a full session by ID by folding its log. Returns null when the log is
   * missing or holds no usable lines.
   */
  async load(id: string): Promise<SessionData | null> {
    const logPath = this.getLogPath(id);
    if (!(await this.fs.exists(logPath))) return null;

    const lines = await readLog(this.fs, logPath);
    if (lines.length === 0) return null;

    const { state, uiMessages, approvalAt } = foldLog(lines);
    if (!state) return null;
    // A log written by a newer schema may fold into a wrong session, so treat it as
    // unreadable (same as a legacy/corrupt file) rather than guessing.
    if (!isSupportedSessionVersion(state.version)) return null;

    const data: SessionData = { ...state, uiMessages };
    if (Object.keys(approvalAt).length > 0) data.approvalTimes = approvalAt;
    // The log's file name is the session identity (what list/delete/rename address),
    // so take it over a stale `state.id` — otherwise a later save would write a
    // second file under the embedded id and leave this one behind.
    if (data.id !== id) data.id = id;
    // Prime the delta baseline so the first save after a resume appends only
    // what actually changed instead of re-appending the whole history.
    this.primeCache(data);
    return data;
  }

  /**
   * List all sessions (metadata only, sorted by updatedAt descending). Reads only
   * the newest line's state of each log, so message bodies are never folded. Logs
   * written by a newer schema version are skipped (not listed as resumable).
   */
  async list(): Promise<SessionMeta[]> {
    const dirExists = await this.fs.exists(SESSION_DIR);
    if (!dirExists) return [];

    const entries = await this.fs.readdir(SESSION_DIR);
    const sessions: SessionMeta[] = [];

    for (const entry of entries) {
      if (entry.type !== "file" || !entry.name.endsWith(SESSION_LOG_SUFFIX)) continue;

      // The file name IS the session identity: `load`/`delete`/`rename` all address
      // the log by it, so listing must not substitute a possibly-stale `state.id`
      // (a copied/renamed log would then be un-loadable).
      const id = entry.name.slice(0, -SESSION_LOG_SUFFIX.length);
      if (!id) continue;

      try {
        const state = await readLastState(this.fs, `${SESSION_DIR}/${entry.name}`);
        if (!state || !isSupportedSessionVersion(state.version)) continue;

        sessions.push({
          id,
          name: state.name,
          version: state.version,
          modelStyle: state.modelStyle,
          model: state.model,
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
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
   * Find the most recently updated session that has never been used (contains
   * no user messages) and is not currently reserved by a concurrent live agent.
   * Lets hosts reuse the leftover empty session from a previous startup instead
   * of creating a fresh one, without racing another process onto the same id.
   */
  async getLatestEmpty(): Promise<SessionData | null> {
    const metas = await this.list();
    const now = Date.now();
    for (const meta of metas) {
      // Cheap check first: scan the log from the top for a user message instead of
      // folding every message of every candidate.
      if ((await hasUserMessage(this.fs, this.getLogPath(meta.id))) !== false) continue;
      const state = await readLastState(this.fs, this.getLogPath(meta.id));
      if (!state) continue;
      if (state.reservedAt && now - state.reservedAt < EMPTY_SESSION_RESERVE_MS) continue;
      // Only the chosen candidate is folded in full.
      const data = await this.load(meta.id);
      if (!data || data.uiMessages.some((m) => m.role === "user")) continue;
      return data;
    }
    return null;
  }

  /**
   * Mark a still-empty session as taken by this live agent so a second
   * process/agent does not select the same id during startup reuse. The mark
   * persists to disk and expires after {@link EMPTY_SESSION_RESERVE_MS},
   * self-healing if the reserving process crashes. No-op when the session is
   * no longer empty (then it is simply never selected again).
   */
  async reserveSession(id: string): Promise<void> {
    const session = await this.load(id);
    if (!session || session.uiMessages.some((m) => m.role === "user")) return;
    session.reservedAt = Date.now();
    await this.save(session);
  }

  /**
   * Clear a still-empty session's startup reservation so a later launch can
   * reuse it again. Called on graceful agent teardown; a crash instead leaves
   * the reservation to expire on its own ({@link EMPTY_SESSION_RESERVE_MS}).
   * No-op when the session is no longer empty (it is never selected again) or
   * was never reserved.
   */
  async releaseReservation(id: string): Promise<void> {
    const session = await this.load(id);
    if (!session || session.uiMessages.some((m) => m.role === "user")) return;
    if (session.reservedAt === undefined) return;
    delete session.reservedAt;
    await this.save(session);
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
   * Delete a session by ID (its log; there is no separate snapshot file).
   */
  async delete(id: string): Promise<boolean> {
    const logPath = this.getLogPath(id);
    if (!(await this.fs.exists(logPath))) return false;
    await this.fs.remove(logPath);
    this.lastSaved.delete(id);
    this.approvalTimes.delete(id);
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

  /**
   * Clear in-memory delta/approval bookkeeping for a session.
   */
  clearCache(id: string): void {
    this.lastSaved.delete(id);
    this.approvalTimes.delete(id);
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private async doSave(session: SessionData): Promise<void> {
    const prev = this.lastSaved.get(session.id);

    // Snapshot the message list (and everything derived from it) before the first
    // await: a concurrent persist may swap `session.uiMessages` while we wait on
    // IO, which would desync the fingerprints from the lines we append.
    const messages = session.uiMessages;
    const fingerprints = new Map(messages.map((m) => [m.id, fingerprintUIMessage(m)]));
    const { uiMessages: _uiMessages, approvalTimes: _approvalTimes, ...stateFields } = session;
    const signature = contentSignature(stateFields, messages, fingerprints);

    // Fingerprint BEFORE stamping `updatedAt`, so an unchanged save is a true
    // no-op (no IO, no timestamp bump).
    if (prev && prev.signature === signature) return;

    await this.ensureDir();
    session.updatedAt = Date.now();
    stateFields.updatedAt = session.updatedAt;

    // Track newly-decided approvals so their timestamps survive a later rewrite.
    // Runs after the stamp so a freshly decided approval records this save's
    // line time (which is what a reader would infer anyway).
    const knownTimes = this.approvalTimes.get(session.id) ?? {};
    if (collectNewApprovalTimes(messages, session.updatedAt, knownTimes)) {
      this.approvalTimes.set(session.id, knownTimes);
    }

    const ids = messages.map((m) => m.id);
    const structuralChange = prev !== undefined && !isAppendOnlyCompatible(prev.ids, ids);

    if (structuralChange || messages.length === 0) {
      // Non-empty → empty, partial truncation, or the initial empty save:
      // rewrite the file (one line per message; a single `message: null` when empty).
      await this.rewriteLog(messages, session.updatedAt, stateFields, knownTimes);
    } else {
      const lines: SessionLogLine[] = [];
      for (const message of messages) {
        if (prev?.fingerprints.get(message.id) === fingerprints.get(message.id)) continue;
        lines.push(buildLine(message, session.updatedAt, stateFields, knownTimes));
      }
      // State-only change: re-emit the last message line with the new state.
      if (lines.length === 0) {
        const last = messages[messages.length - 1];
        if (last) lines.push(buildLine(last, session.updatedAt, stateFields, knownTimes));
      }
      if (lines.length > 0) {
        const appended = await appendLogLines(this.fs, this.getLogPath(session.id), lines);
        if (!appended) {
          // Env fs has no `appendFile` (optional primitive). Degrade to a full
          // rewrite so this save is not silently lost — otherwise the delta
          // baseline below would dedupe every later save into nothing.
          await this.rewriteLog(messages, session.updatedAt, stateFields, knownTimes);
        }
      }
    }

    this.lastSaved.set(session.id, { ids, fingerprints, signature });
  }

  /** Rewrite the log to its compacted form: one line per message (or a single null line). */
  private async rewriteLog(
    messages: UIMessage[],
    updatedAt: number,
    stateFields: SessionStateFields,
    knownTimes: Record<string, number>
  ): Promise<void> {
    const lines: SessionLogLine[] =
      messages.length === 0
        ? [buildLine(null, updatedAt, stateFields, knownTimes)]
        : messages.map((message) => buildLine(message, updatedAt, stateFields, knownTimes));
    await writeLog(this.fs, this.getLogPath(stateFields.id), lines);
  }

  /** Seed the delta baseline from a loaded session (resume path). */
  private primeCache(session: SessionData): void {
    const fingerprints = new Map(session.uiMessages.map((m) => [m.id, fingerprintUIMessage(m)]));
    const { uiMessages: _uiMessages, approvalTimes, ...stateFields } = session;
    this.lastSaved.set(session.id, {
      ids: session.uiMessages.map((m) => m.id),
      fingerprints,
      signature: contentSignature(stateFields, session.uiMessages, fingerprints),
    });
    if (approvalTimes) {
      this.approvalTimes.set(session.id, { ...approvalTimes });
    }
  }

  private getLogPath(id: string): string {
    return `${SESSION_DIR}/${id}${SESSION_LOG_SUFFIX}`;
  }

  private async ensureDir(): Promise<void> {
    if (!(await this.fs.exists(SESSION_DIR))) {
      await this.fs.mkdir(SESSION_DIR);
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Content signature used for no-op detection: state (timestamp-normalized) + messages. */
function contentSignature(
  stateFields: SessionStateFields,
  messages: UIMessage[],
  fingerprints: Map<string, string>
): string {
  const state = JSON.stringify({ ...stateFields, updatedAt: 0 });
  return `${state}\u0000${messages.map((m) => `${m.id}:${fingerprints.get(m.id)}`).join("\u0001")}`;
}

/** Whether `ids` preserves `prevIds` as an in-order prefix (pure append). */
function isAppendOnlyCompatible(prevIds: string[], ids: string[]): boolean {
  if (ids.length < prevIds.length) return false;
  for (let i = 0; i < prevIds.length; i++) {
    if (ids[i] !== prevIds[i]) return false;
  }
  return true;
}

/** Build one log line for `message` (or `null` for the initial empty-session line). */
function buildLine(
  message: UIMessage | null,
  messageUpdatedAt: number,
  state: SessionStateFields,
  knownTimes: Record<string, number>
): SessionLogLine {
  const approvalAt = message ? approvalTimesForMessage(message, knownTimes) : undefined;
  const line: SessionLogLine = { t: SESSION_LOG_MESSAGE, message, messageUpdatedAt, state };
  if (approvalAt && Object.keys(approvalAt).length > 0) line.approvalAt = approvalAt;
  return line;
}

/** Decided approval timestamps carried by one message (from the known times map). */
function approvalTimesForMessage(message: UIMessage, knownTimes: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  if (message.role !== "assistant") return out;
  for (const part of message.parts) {
    if (!isToolCallPart(part)) continue;
    const approval = part.approval;
    if (!approval?.id || approval.approved === undefined) continue;
    const at = knownTimes[approval.id];
    if (at !== undefined) out[approval.id] = at;
  }
  return out;
}

/**
 * Record decision times for approvals that are newly decided in `messages`.
 * Returns true when the map gained a new entry.
 */
function collectNewApprovalTimes(messages: UIMessage[], now: number, knownTimes: Record<string, number>): boolean {
  let changed = false;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolCallPart(part)) continue;
      const approval = part.approval;
      if (!approval?.id || approval.approved === undefined) continue;
      if (knownTimes[approval.id] === undefined) {
        knownTimes[approval.id] = now;
        changed = true;
      }
    }
  }
  return changed;
}
