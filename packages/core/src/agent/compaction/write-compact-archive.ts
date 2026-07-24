/**
 * Persist greppable pre-compaction transcripts under `.agents/transcripts/`.
 *
 * Archive write failures are non-fatal — callers should omit the summary pointer.
 */

import { getEnv } from "../../env.js";

import { serializeConversation } from "./serialize-conversation.js";

import type { ModelMessage } from "@tanstack/ai";

/** Workspace-relative root for compact transcript archives. */
export const COMPACT_TRANSCRIPT_ROOT = ".agents/transcripts";

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
 * Format the summary section that points the agent at a written archive.
 */
export function formatCompactArchivePointer(relativePath: string): string {
  return `

## Compact archive

\`${relativePath}\`

When details are missing from this summary, search this archive with grep (or read a small offset/limit slice). Do not read the whole file — it can be large.`;
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

> Prefer grep (or small offset/limit reads). Do not load this entire transcript into context.

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

export async function maybeAppendCompactArchive(summary: string, options: WriteCompactArchiveOptions): Promise<string> {
  const archive = await writeCompactArchive(options);
  if (!archive) return summary;
  return summary + formatCompactArchivePointer(archive.relativePath);
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
