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
 * Paths are listed oldest → newest. Guidance steers the agent to grep newest first
 * so it knows which file holds the most recently compacted details.
 */
export function formatCompactArchivesSection(paths: string[]): string {
  if (paths.length === 0) return "";

  const newest = paths[paths.length - 1]!;
  const list = paths
    .map((path, index) => {
      const suffix = index === paths.length - 1 ? " ← newest slice (search here first for recent details)" : "";
      return `- \`${path}\`${suffix}`;
    })
    .join("\n");

  return `

## Compact archives

Cold storage for compacted turns — details live in these files, not duplicated in the summary body above.

- Filenames are compact-N.md (N=1 earliest; higher N = later slices).
- Missing a detail? Grep **newest → oldest** (start with \`${newest}\`). Prefer the highest N for work done just before the latest compaction.
- Use grep or small offset/limit \`read_file\` reads. Do **not** load whole archive files into context.
- Cite the archive path when looking something up; do not paste large archive excerpts back into the conversation.

File shape: short header (\`session\`, \`sequence\`, \`timestamp\`, \`cutIndex\`) then a plain-text transcript (\`[User]\` / \`[Assistant]\` / tool calls / truncated tool results).

${list}`;
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
