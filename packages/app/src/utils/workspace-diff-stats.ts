import { splitStreamingLines } from "./streaming-output-lines.js";
import { joinWorkspacePath } from "./workspace-path.js";

// ============================================================================
// Diff stats (per-file +/− line counts vs HEAD, plus untracked file lines)
//
// Powers the GitHub-PR-style "+N −M" labels in the file tree and the
// "N files · +X −Y" header summary. Tracked changes come from
// `git diff HEAD --numstat`; untracked (`??`) files are not part of any git
// diff, so their line count is measured directly from the working tree file.
// ============================================================================

export interface WorkspaceFileDiffStat {
  added: number;
  deleted: number;
}

export interface WorkspaceDiffStats {
  /** relative path → line counts */
  files: Map<string, WorkspaceFileDiffStat>;
  totalAdded: number;
  totalDeleted: number;
}

const MAX_UNTRACKED_STAT_CHARS = 200_000;

/**
 * Extract the destination path from `git diff --numstat` rename notation:
 * `old => new` and `dir/{old.ts => new.ts}` both resolve to the new path.
 */
export function numstatPath(path: string): string {
  const arrow = path.indexOf(" => ");
  if (arrow === -1) return path.replace(/\\/g, "/");
  let newPath = path.slice(arrow + 4);
  const brace = path.lastIndexOf("{", arrow);
  if (brace !== -1) {
    const prefix = path.slice(0, brace);
    newPath = prefix + newPath.replace(/\}$/, "");
  }
  return newPath.replace(/\\/g, "/");
}

/**
 * Parse `git diff --numstat` output into a path → line-counts map.
 * Binary files report `-\t-` and are treated as 0/0.
 */
export function parseDiffNumstat(raw: string): Map<string, WorkspaceFileDiffStat> {
  const map = new Map<string, WorkspaceFileDiffStat>();
  for (const line of splitStreamingLines(raw)) {
    if (!line.trim()) continue;
    const [addedRaw, deletedRaw, ...rest] = line.split("\t");
    const path = numstatPath(rest.join("\t").trim());
    if (!path) continue;
    const added = Number(addedRaw);
    const deleted = Number(deletedRaw);
    map.set(path, {
      added: Number.isFinite(added) && added > 0 ? added : 0,
      deleted: Number.isFinite(deleted) && deleted > 0 ? deleted : 0,
    });
  }
  return map;
}

const statsCache = new Map<string, Promise<WorkspaceDiffStats>>();

export function clearWorkspaceDiffStatsCache(): void {
  statsCache.clear();
}

export function fetchWorkspaceDiffStats(rootPath: string, untracked: string[]): Promise<WorkspaceDiffStats> {
  const key = `${rootPath}\0${untracked.join("\n")}`;
  const cached = statsCache.get(key);
  if (cached) return cached;

  const promise = loadWorkspaceDiffStats(rootPath, untracked).catch((error: unknown) => {
    statsCache.delete(key);
    throw error;
  });
  statsCache.set(key, promise);
  return promise;
}

async function loadWorkspaceDiffStats(rootPath: string, untracked: string[]): Promise<WorkspaceDiffStats> {
  const { getEnv } = await import("@my-agent/core");
  const env = getEnv();

  const files = new Map<string, WorkspaceFileDiffStat>();
  let totalAdded = 0;
  let totalDeleted = 0;

  try {
    const result = await env.runCommand("git diff HEAD --numstat", { cwd: rootPath });
    if (result.exitCode === 0) {
      for (const [path, stat] of parseDiffNumstat(result.stdout)) {
        files.set(path, stat);
        totalAdded += stat.added;
        totalDeleted += stat.deleted;
      }
    }
  } catch {
    // Not a git worktree / unborn HEAD — untracked-only stats below.
  }

  for (const rel of untracked) {
    const stat = await countUntrackedLines(rootPath, rel);
    if (!stat) continue;
    const key = rel.replace(/\\/g, "/");
    files.set(key, stat);
    totalAdded += stat.added;
    totalDeleted += stat.deleted;
  }

  return { files, totalAdded, totalDeleted };
}

async function countUntrackedLines(rootPath: string, rel: string): Promise<WorkspaceFileDiffStat | null> {
  try {
    const { getEnv } = await import("@my-agent/core");
    const content = await getEnv().fs.readFile(joinWorkspacePath(rootPath, rel));
    const capped = content.slice(0, MAX_UNTRACKED_STAT_CHARS);
    const added = capped.split("\n").length;
    return { added, deleted: 0 };
  } catch {
    return null;
  }
}
