/**
 * Persist greppable pre-compaction transcripts under `.agents/transcripts/`.
 *
 * Archive write failures are non-fatal. Archive path lists are merged in code
 * across successive compactions so the LLM need not preserve them.
 */

import { getEnv } from "../../env.js";

import { serializeConversation } from "./serialize-conversation.js";

import type { ModelMessage } from "@tanstack/ai";

/** Workspace-relative root for compact transcript archives. */
export const COMPACT_TRANSCRIPT_ROOT = ".agents/transcripts";

/** Match workspace-relative compact archive paths (ignore bare `compact-N.md` examples). */
const ARCHIVE_PATH_RE = /`(\.agents\/transcripts\/[^`\n]*compact-\d+\.md)`/g;

export interface WriteCompactArchiveOptions {
  sessionId: string;
  messages: ModelMessage[];
  /** Cut index metadata recorded in the archive header. */
  cutIndex: number;
}

export interface CompactArchiveWriteResult {
  relativePath: string;
  absolutePath: string;
  sequence: number;
}

/**
 * Extract archive paths previously listed in a summary (singular or plural section).
 * Dedupes and sorts oldest → newest by `compact-N` so instructional "start with newest"
 * mentions do not scramble merge order on the next compaction.
 */
export function extractCompactArchivePaths(...texts: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const text of texts) {
    if (!text) continue;
    ARCHIVE_PATH_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ARCHIVE_PATH_RE.exec(text)) !== null) {
      const path = match[1]?.trim();
      if (!path || seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
    }
  }

  return paths.sort((a, b) => {
    const seqA = parseCompactSequence(a.split("/").pop() ?? "") ?? 0;
    const seqB = parseCompactSequence(b.split("/").pop() ?? "") ?? 0;
    return seqA - seqB;
  });
}

/**
 * Remove any LLM-emitted Compact archive(s) section so the runtime can re-attach a merged list.
 */
export function stripCompactArchiveSections(text: string): string {
  return text.replace(/\n*## Compact archives?\b[\s\S]*?(?=\n## [^#]|\s*$)/gi, "").trimEnd();
}

/**
 * Format the summary section listing all known compact archives for this session.
 *
 * Holds **path data plus scope only** — no guidance for how to search archives.
 * That lives in the session-retrieval turn-context section, the single place usage
 * instructions belong: the copy that used to sit here had already drifted from the
 * archive header's copy, and neither could be corrected for archives already on
 * disk.
 *
 * The list stays attached to the summary because it is the summary's natural
 * neighbour — the summary states which turns were compacted, this states where they
 * went. The scope line is required: this list is current-session only, while the
 * retrieval section covers all sessions, and the two must not be conflated.
 *
 * Paths are listed oldest → newest.
 */
export function formatCompactArchivesSection(paths: string[]): string {
  if (paths.length === 0) return "";

  const list = paths
    .map((path, index) => {
      const suffix = index === paths.length - 1 ? " ← newest slice" : "";
      return `- \`${path}\`${suffix}`;
    })
    .join("\n");

  return `\n\n## Compact archives\n\nThis session's compacted turns, oldest → newest (current session only — other sessions' history is covered by the \`session_retrieval\` turn-context section):\n\n${list}`;
}

/**
 * Parse `compact-<n>.md` filenames. Returns null when the name does not match.
 */
export function parseCompactSequence(filename: string): number | null {
  const match = /^compact-(\d+)\.md$/.exec(filename);
  if (!match) return null;
  const sequence = Number(match[1]);
  return Number.isFinite(sequence) && sequence > 0 ? sequence : null;
}

/**
 * Build markdown archive body (header + serialized conversation).
 */
/**
 * Build an archive as a self-describing artifact: metadata header, then the body.
 *
 * Deliberately carries no guidance about how to search or read it. A model only
 * opens an archive after following the session-retrieval turn-context guidance,
 * so repeating "prefer grep / do not load this file" here would contradict the
 * action it just took — and as prose frozen at write time it could never be
 * revised for archives already on disk.
 */
export function buildCompactArchiveMarkdown(options: {
  sessionId: string;
  sequence: number;
  cutIndex: number;
  messages: ModelMessage[];
  timestamp?: string;
}): string {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const body = serializeConversation(options.messages);
  return `# Compact archive

- session: ${options.sessionId}
- sequence: ${options.sequence}
- timestamp: ${timestamp}
- cutIndex: ${options.cutIndex}

---

${body}
`;
}

/**
 * Next compact-<n> sequence for a session directory (1 if empty / missing).
 */
export async function resolveNextCompactSequence(dirPath: string): Promise<number> {
  const env = getEnv();
  if (!(await env.fs.exists(dirPath))) return 1;

  const entries = await env.fs.readdir(dirPath);
  let max = 0;
  for (const entry of entries) {
    const sequence = parseCompactSequence(entry.name);
    if (sequence != null && sequence > max) max = sequence;
  }
  return max + 1;
}

/**
 * Write a new archive (if any) and attach a merged ## Compact archives section.
 *
 * @param previousSummary - Prior conversation summary (used to recover older archive paths)
 */
export async function maybeAppendCompactArchive(
  summary: string,
  options: WriteCompactArchiveOptions,
  previousSummary?: string
): Promise<string> {
  const priorPaths = extractCompactArchivePaths(previousSummary, summary);
  const withoutSection = stripCompactArchiveSections(summary);
  const archive = await writeCompactArchive(options);

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const path of [...priorPaths, ...(archive ? [archive.relativePath] : [])]) {
    if (seen.has(path)) continue;
    seen.add(path);
    ordered.push(path);
  }

  if (ordered.length === 0) return withoutSection;
  return withoutSection + formatCompactArchivesSection(ordered);
}

/**
 * Write a plain-text archive of the compressed conversation segment.
 *
 * @returns write result, or null when there is nothing to write / I/O fails
 */
export async function writeCompactArchive(
  options: WriteCompactArchiveOptions
): Promise<CompactArchiveWriteResult | null> {
  if (options.messages.length === 0) return null;

  try {
    const env = getEnv();
    const relativeDir = env.path.join(COMPACT_TRANSCRIPT_ROOT, options.sessionId);
    const absoluteDir = env.path.join(env.rootPath, relativeDir);
    await env.fs.mkdir(absoluteDir);

    const sequence = await resolveNextCompactSequence(absoluteDir);
    const filename = `compact-${sequence}.md`;
    const relativePath = env.path.join(relativeDir, filename);
    const absolutePath = env.path.join(env.rootPath, relativePath);
    const content = buildCompactArchiveMarkdown({
      sessionId: options.sessionId,
      sequence,
      cutIndex: options.cutIndex,
      messages: options.messages,
    });

    await env.fs.writeFile(absolutePath, content);
    return { relativePath, absolutePath, sequence };
  } catch {
    return null;
  }
}
