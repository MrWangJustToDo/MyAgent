import { useCallback, useEffect, useRef, useState } from "react";

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
 *
 * Refreshes are generation-guarded: only the **latest** call may write state.
 * Without the guard, a slow in-flight interval fetch that started before the
 * user's manual `r` would resolve *after* it and overwrite the fresh result —
 * the manual refresh visibly did nothing (and with a remote env, where each git
 * call is an HTTP round trip, the window is wide). A remount never loses this
 * race because the stale closure's setState lands on an unmounted component;
 * the generation guard gives the mounted hook the same property.
 */
export const useWorkspaceGit = (rootPath: string) => {
  const [gitStatus, setGitStatus] = useState<Map<string, string>>(new Map());
  const [gitInfo, setGitInfo] = useState<WorkspaceGitInfo | null>(null);
  const [diffStats, setDiffStats] = useState<WorkspaceDiffStats | null>(null);
  const generationRef = useRef(0);

  const refresh = useCallback(async (path: string) => {
    if (!path) return;
    const generation = ++generationRef.current;
    try {
      clearGitStatusCache();
      clearWorkspaceDiffStatsCache();
      const status = await fetchGitStatus(path);
      const untracked = [...status.entries()].filter(([, s]) => s.trim() === "??").map(([rel]) => rel);
      const [info, stats] = await Promise.all([fetchWorkspaceGitInfo(path), fetchWorkspaceDiffStats(path, untracked)]);
      // A newer refresh was started while this one was in flight — its results
      // are the ones the user asked for. Discard ours entirely (state AND the
      // module cache the newer call already cleared and repopulated).
      if (generation !== generationRef.current) return;
      setGitStatus(status);
      setGitInfo(info);
      setDiffStats(stats);
    } catch {
      if (generation !== generationRef.current) return;
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
