/**
 * Session-retrieval guidance: where past conversation lives and how each shape is read.
 *
 * This is the **single source of truth** for how to search conversation history.
 * The knowledge used to sit in four places that aged differently:
 *
 * - `formatCompactArchivesSection` — the compaction summary (live)
 * - `buildCompactArchiveMarkdown` — the archive file header (frozen at write time)
 * - `AGENTS.md` — ships with the repo (and its byte budget is already exhausted)
 * - `ARCHITECTURE.md` — developer docs, never loaded by the model
 *
 * Two of those are frozen or near-frozen, so a wording change reached only some of
 * them. The archive header had **already drifted** (it never carried the
 * "newest → oldest" rule) and could never be corrected for archives already on
 * disk. The guidance therefore lives here only; the other sites carry either data
 * (the summary's path list) or nothing.
 *
 * Discovery is deliberately **static text behind a one-time existence gate**: no
 * counts and no per-turn directory walks. A count would change the section hash
 * whenever a session was created or pruned, re-injecting the whole block and
 * invalidating the prompt-cache prefix after it — for a figure that does not
 * change what the model should do.
 */

import { getEnv } from "../../env.js";
import { COMPACT_TRANSCRIPT_ROOT } from "../compaction/write-compact-archive.js";
import { SESSION_DIR } from "../persistence/types.js";

import { TURN_CONTEXT_KINDS, type TurnContextKind } from "./turn-context-message.js";

/** Archive files are named `compact-<N>.md`, N ascending with each compaction. */
const COMPACT_ARCHIVE_RE = /^compact-(\d+)\.md$/;

/** Semantic tag for the retrieval section. */
export const SESSION_RETRIEVAL_OPEN = "<session_retrieval>";
export const SESSION_RETRIEVAL_CLOSE = "</session_retrieval>";

/**
 * Section kind for the retrieval section.
 *
 * Typed against the shared catalog so a rename that misses one site fails to
 * compile instead of silently splitting the kind into two independently-admitted
 * ones.
 */
export const SESSION_RETRIEVAL_KIND: TurnContextKind = TURN_CONTEXT_KINDS.sessionRetrieval;

/** Rendered retrieval section, or the empty string when there is no history. */
export type SessionRetrievalSection = string;

/**
 * Whether this workspace has any conversation history at all.
 *
 * Evaluated once per agent, not per turn. A workspace with nothing on disk (a
 * fresh clone, a project that never ran an agent) gets no section rather than
 * guidance pointing at directories that do not exist.
 */
export async function hasSessionHistory(): Promise<boolean> {
  const env = getEnv();

  try {
    const sessionsDir = env.path.join(env.rootPath, SESSION_DIR);
    if (await env.fs.exists(sessionsDir)) {
      const entries = await env.fs.readdir(sessionsDir);
      if (entries.length > 0) return true;
    }
  } catch {
    // Unreadable sessions directory — fall through to the transcript check.
  }

  try {
    const transcriptsDir = env.path.join(env.rootPath, COMPACT_TRANSCRIPT_ROOT);
    if (!(await env.fs.exists(transcriptsDir))) return false;
    const dirs = await env.fs.readdir(transcriptsDir);
    return dirs.length > 0;
  } catch {
    return false;
  }
}

/**
 * This session's compacted slices, oldest → newest, as workspace-relative paths.
 *
 * Kept out of the injected section on purpose: the compaction summary already
 * appends `## Compact archives` with this session's paths, so the section is
 * constant (it depends only on whether history exists) and its hash settles after
 * a single admission. Naming the paths here as well would re-inject the whole
 * block on every compaction, for information the summary already carries.
 *
 * Best-effort and read-only: a missing or unreadable directory yields an empty
 * list rather than failing the turn.
 */
export async function listCompactArchives(sessionId: string | undefined): Promise<string[]> {
  if (!sessionId) return [];
  const env = getEnv();
  const relativeDir = env.path.join(COMPACT_TRANSCRIPT_ROOT, sessionId);

  let names: string[];
  try {
    const absoluteDir = env.path.join(env.rootPath, relativeDir);
    if (!(await env.fs.exists(absoluteDir))) return [];
    const entries = await env.fs.readdir(absoluteDir);
    names = entries.map((entry) => entry.name).filter((name) => COMPACT_ARCHIVE_RE.test(name));
  } catch {
    return [];
  }

  return names.sort((a, b) => compactSequence(a) - compactSequence(b)).map((name) => env.path.join(relativeDir, name));
}

/** Numeric sequence encoded in a `compact-<N>.md` filename. */
function compactSequence(filename: string): number {
  return Number(COMPACT_ARCHIVE_RE.exec(filename)?.[1] ?? 0);
}

/**
 * The constant guidance body, without any per-session path list.
 *
 * Exposed so the drift guard can assert the single source of truth directly, and
 * so the section renderer and any future consumer share one definition rather than
 * re-describing the file shapes.
 */
export function renderStaticRetrievalBody(): string {
  return [
    "Past conversations with this workspace are on disk. Search them when the task depends " +
      "on something discussed in an earlier session — a decision, a reason, or a detail that " +
      "is no longer in this context.",
    "",
    "Two shapes, read differently:",
    `- **Compacted slices** — \`${COMPACT_TRANSCRIPT_ROOT}/<sessionId>/compact-<N>.md\`: plain ` +
      "text, greppable directly. N ascends with each compaction, so the highest N holds the most " +
      "recent details — search newest → oldest, and prefer grep or small offset/limit reads over " +
      "loading a whole file.",
    `- **Uncompacted sessions** — \`${SESSION_DIR}/*.session.json\`: each holds a whole ` +
      "conversation as one long JSON line, so grep only tells you *which* session matched. To read " +
      "one, parse the JSON and filter `uiMessages[]` by `role`; message text is in `parts[].content`.",
    "",
    "The current session's own files are already represented by this conversation — re-reading " +
      "them just duplicates what you already have.",
  ].join("\n");
}

/**
 * Render the `<session_retrieval>` section.
 *
 * Returns `undefined` when the workspace has no history, so the section is absent
 * rather than empty. The body is **entirely static** — no counts, no paths — so a
 * single admission settles the section for the session; see
 * {@link listCompactArchives} for why this session's own paths are not listed.
 */
export function formatSessionRetrievalSection(options: { hasHistory: boolean }): SessionRetrievalSection | undefined {
  if (!options.hasHistory) return undefined;

  return [SESSION_RETRIEVAL_OPEN, renderStaticRetrievalBody(), SESSION_RETRIEVAL_CLOSE].join("\n");
}
