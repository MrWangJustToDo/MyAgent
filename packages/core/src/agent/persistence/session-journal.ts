/**
 * session-journal.ts - Append-only session journal (write-ahead log).
 *
 * Each session is journaled to `.agents/sessions/{id}.session.log` as one JSONL
 * record per line. Slice 1 writes whole-state `checkpoint` records; the journal
 * is the crash-safe source of truth and `.session.json` is a materialized cache.
 *
 * A torn trailing line (crash mid-append) is dropped on read. Truncation runs
 * only after a snapshot write, so a crash during truncation still leaves a
 * valid snapshot to fall back on.
 */

import { SESSION_DIR, SESSION_JOURNAL_KIND, SESSION_LOG_SUFFIX } from "./types.js";

import type { SessionData, SessionJournalRecord } from "./types.js";
import type { CoreEnvFs } from "../../env.js";

/** Journal format version for the record envelope. */
export const SESSION_JOURNAL_VERSION = 1;

export function getJournalPath(id: string): string {
  return `${SESSION_DIR}/${id}${SESSION_LOG_SUFFIX}`;
}

/**
 * Append a whole-state checkpoint for `session` as one JSONL line.
 * Returns false (no-op) when the env fs does not implement appendFile, letting
 * callers fall back to snapshot-only persistence.
 */
export async function appendCheckpoint(
  fs: CoreEnvFs,
  path: string,
  seq: number,
  session: SessionData
): Promise<boolean> {
  if (!fs.appendFile) return false;
  // Ensure the file exists before appending (some fs impls create it on
  // append, but we make it explicit so every CoreEnvFs is safe). Saves are
  // serialized per session, so this cannot race another append.
  if (!(await fs.exists(path))) {
    await fs.writeFile(path, "");
  }
  const record: SessionJournalRecord = {
    v: SESSION_JOURNAL_VERSION,
    seq,
    kind: SESSION_JOURNAL_KIND,
    ts: Date.now(),
    data: session,
  };
  await fs.appendFile(path, JSON.stringify(record) + "\n");
  return true;
}

/**
 * Read all valid records from the journal, sorted by seq ascending.
 * Lines that fail to parse (a torn trailing line after a crash mid-append, or
 * any corruption) are skipped.
 */
export async function readJournal(fs: CoreEnvFs, path: string): Promise<SessionJournalRecord[]> {
  if (!(await fs.exists(path))) return [];
  const content = await fs.readFile(path);
  const records: SessionJournalRecord[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as SessionJournalRecord;
      if (parsed && typeof parsed.seq === "number") {
        records.push(parsed);
      }
    } catch {
      // Skip torn/corrupt line.
    }
  }
  return records.sort((a, b) => a.seq - b.seq);
}

/** Newest record by seq, or null when the journal is empty. */
export function lastRecord(records: SessionJournalRecord[]): SessionJournalRecord | null {
  return records.length === 0 ? null : records[records.length - 1];
}

/**
 * Rewrite the journal keeping only records with `seq > seq` (the snapshot seq).
 * Removes the file entirely when nothing newer than the snapshot remains.
 * Runs only after a snapshot write, so a crash here leaves a valid snapshot.
 */
export async function truncateAfter(fs: CoreEnvFs, path: string, seq: number): Promise<void> {
  if (!(await fs.exists(path))) return;
  const keep = (await readJournal(fs, path)).filter((r) => r.seq > seq);
  if (keep.length === 0) {
    await fs.remove(path);
    return;
  }
  await fs.writeFile(path, keep.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
