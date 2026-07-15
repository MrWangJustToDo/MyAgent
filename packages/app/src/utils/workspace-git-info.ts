/**
 * Resolve lightweight git workspace metadata for header display.
 */

export type WorkspaceGitInfo = {
  /** Current branch, or a detached label */
  branch: string;
  /** Short HEAD sha when available */
  shortSha: string;
  /** Whether the worktree has uncommitted changes */
  dirty: boolean;
};

/**
 * Return git branch/sha/dirty for `rootPath`, or null when not a git worktree.
 */
export async function fetchWorkspaceGitInfo(rootPath: string): Promise<WorkspaceGitInfo | null> {
  if (!rootPath) return null;

  const { getEnv } = await import("@my-agent/core");
  const env = getEnv();

  try {
    const inside = await env.runCommand("git rev-parse --is-inside-work-tree", { cwd: rootPath });
    if (inside.exitCode !== 0 || inside.stdout.trim() !== "true") {
      return null;
    }

    const [branchResult, shaResult, statusResult] = await Promise.all([
      env.runCommand("git rev-parse --abbrev-ref HEAD", { cwd: rootPath }),
      env.runCommand("git rev-parse --short HEAD", { cwd: rootPath }),
      env.runCommand("git status --porcelain", { cwd: rootPath }),
    ]);

    const shortSha = shaResult.exitCode === 0 ? shaResult.stdout.trim() : "";
    let branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : "";
    if (!branch || branch === "HEAD") {
      branch = shortSha ? `detached@${shortSha}` : "detached";
    }

    const dirty = statusResult.exitCode === 0 && statusResult.stdout.trim().length > 0;
    return { branch, shortSha, dirty };
  } catch {
    return null;
  }
}

/** Compact single-line label, e.g. `main* abc1234`. */
export function formatWorkspaceGitInfo(info: WorkspaceGitInfo): string {
  const dirty = info.dirty ? "*" : "";
  const head = `${info.branch}${dirty}`;
  if (info.shortSha && !info.branch.includes(info.shortSha)) {
    return `${head} ${info.shortSha}`;
  }
  return head;
}
