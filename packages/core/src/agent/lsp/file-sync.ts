/**
 * File Sync — keeps LSP servers informed of file changes.
 *
 * Hooks into tool:after:read_file/write_file/edit_file and sends
 * didOpen/didChange notifications to the appropriate LSP server.
 *
 * Maintains an LRU-bounded set of tracked documents. When the limit is
 * reached, the least-recently-used document is closed via didClose to
 * prevent unbounded memory growth in the LSP server during long sessions.
 */

import { MAX_TRACKED_DOCUMENTS } from "./shared/constants.js";
import { syntheticDotLocks } from "./shared/synthetic-dot.js";
import { AUTO_DIAG_SERVER_WAIT_MS } from "./shared/timing.js";

import type { LspManager } from "./lsp-manager.js";

interface TrackedDocument {
  uri: string;
  languageId: string;
  version: number;
}

export class FileSync {
  /** LRU map: most-recently-used documents are at the end (Map preserves insertion order). */
  private tracked: Map<string, TrackedDocument> = new Map();
  private maxTracked: number;
  private readFile: (absPath: string) => Promise<string>;
  private exists: (p: string) => Promise<boolean>;
  private manager: LspManager;

  constructor(
    manager: LspManager,
    fs: { readFile: (absPath: string) => Promise<string>; exists: (p: string) => Promise<boolean> },
    maxTracked?: number
  ) {
    this.manager = manager;
    this.maxTracked = maxTracked ?? MAX_TRACKED_DOCUMENTS;
    this.readFile = fs.readFile;
    this.exists = fs.exists;
  }

  /** Re-point at a new manager (used when session:start rebuilds the manager). */
  setManager(manager: LspManager): void {
    this.manager = manager;
    this.tracked.clear();
  }

  /**
   * Touch a URI in the LRU — moves it to the end (most-recently-used position).
   * If the map exceeds maxTracked, evicts the oldest entry and sends didClose.
   */
  private touchAndEvict(uri: string): void {
    const doc = this.tracked.get(uri);
    if (doc) {
      this.tracked.delete(uri);
      this.tracked.set(uri, doc);
    }

    while (this.tracked.size > this.maxTracked) {
      const oldest = this.tracked.entries().next();
      if (oldest.done) break;
      const [evictUri, evictDoc] = oldest.value;
      this.tracked.delete(evictUri);
      const client = this.manager.getRunningClient(evictDoc.languageId);
      if (client) {
        client.connection.didClose(evictUri);
      }
    }
  }

  /** Handle a file being read — sends didOpen if not yet tracked. */
  async handleFileRead(filePath: string): Promise<void> {
    const absPath = this.manager.resolvePath(filePath);
    const uri = this.manager.getFileUri(absPath);

    if (this.tracked.has(uri)) {
      this.touchAndEvict(uri);
      return;
    }

    const languageId = this.manager.getLanguageId(absPath);
    if (!languageId) return;

    const client = this.manager.getRunningClient(languageId);
    if (!client) return;

    try {
      const content = await this.readFile(absPath);
      const doc: TrackedDocument = { uri, languageId, version: 1 };
      this.tracked.set(uri, doc);
      client.connection.didOpen(uri, languageId, doc.version, content);
      this.touchAndEvict(uri);
    } catch {
      // File might not exist or be unreadable — ignore
    }
  }

  /** Handle a file being written/edited — sends didOpen or didChange. */
  async handleFileWrite(filePath: string): Promise<void> {
    const absPath = this.manager.resolvePath(filePath);
    const uri = this.manager.getFileUri(absPath);
    const languageId = this.manager.getLanguageId(absPath);

    if (!languageId) return;

    // Wait for the server to become ready (kicks off lazy startup if needed) so
    // the very first write/edit in a session still syncs the file and produces
    // diagnostics, instead of silently dropping didOpen/didChange.
    const client = await this.manager.waitForClient(languageId, AUTO_DIAG_SERVER_WAIT_MS).catch(() => null);
    if (!client) return;

    try {
      const content = await this.readFile(absPath);
      const existing = this.tracked.get(uri);

      if (existing) {
        if (syntheticDotLocks.has(uri)) {
          this.touchAndEvict(uri);
          return;
        }
        existing.version++;
        client.connection.didChange(uri, existing.version, content);
      } else {
        const doc: TrackedDocument = { uri, languageId, version: 1 };
        this.tracked.set(uri, doc);
        client.connection.didOpen(uri, languageId, doc.version, content);
      }
      this.touchAndEvict(uri);
    } catch {
      // File might not exist or be unreadable — ignore
    }
  }

  /** Get the current tracked version for a URI, or null if not tracked. */
  getTrackedVersion(uri: string): number | null {
    const doc = this.tracked.get(uri);
    return doc ? doc.version : null;
  }

  /** Override tracked version (used by synthetic-dot completion coordination). */
  setTrackedVersion(uri: string, version: number): void {
    const doc = this.tracked.get(uri);
    if (doc) doc.version = version;
  }

  /** True while a synthetic-dot completion temporarily mutates document text. */
  isSyntheticDotActive(uri: string): boolean {
    return syntheticDotLocks.has(uri);
  }

  /** Get the number of tracked documents. */
  get trackedCount(): number {
    return this.tracked.size;
  }
}
