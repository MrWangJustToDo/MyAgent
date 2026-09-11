import { useCallback, useEffect, useState } from "react";

import { clearWorkspaceDiffStatsCache, fetchWorkspaceDiffStats } from "../utils/workspace-diff-stats.js";
import { fetchWorkspaceGitInfo } from "../utils/workspace-git-info.js";
import { clearGitStatusCache, fetchGitStatus } from "../utils/workspace-git-status.js";

import type { WorkspaceDiffStats } from "../utils/workspace-diff-stats.js";
import type { WorkspaceGitInfo } from "../utils/workspace-git-info.js";

const GIT_REFRESH_INTERVAL_MS = 10_000;

/**
 * Git status / branch info / diff stats for a workspace root.
 *
 * Loads once when the root resolves, then re-fetches on an interval so external
 * edits show up without a manual refresh. `refresh` clears the caches first, so
 * callers can also force a fresh read (the `r` key in the file browser).
 */
export const useWorkspaceGit = (rootPath: string) => {
  const [gitStatus, setGitStatus] = useState<Map<string, string>>(new Map());
  const [gitInfo, setGitInfo] = useState<WorkspaceGitInfo | null>(null);
  const [diffStats, setDiffStats] = useState<WorkspaceDiffStats | null>(null);

  const refresh = useCallback(async (path: string) => {
    if (!path) return;
    try {
      clearGitStatusCache();
      clearWorkspaceDiffStatsCache();
      const status = await fetchGitStatus(path);
      const untracked = [...status.entries()].filter(([, s]) => s.trim() === "??").map(([rel]) => rel);
      const [info, stats] = await Promise.all([fetchWorkspaceGitInfo(path), fetchWorkspaceDiffStats(path, untracked)]);
      setGitStatus(status);
      setGitInfo(info);
      setDiffStats(stats);
    } catch {
      setGitStatus(new Map());
      setGitInfo(null);
      setDiffStats(null);
    }
  }, []);

  useEffect(() => {
    if (!rootPath) return;
    void refresh(rootPath);
  }, [rootPath, refresh]);

  useEffect(() => {
    if (!rootPath) return;
    const interval = setInterval(() => {
      void refresh(rootPath);
    }, GIT_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [rootPath, refresh]);

  return { gitStatus, gitInfo, diffStats, refreshGit: refresh };
};
