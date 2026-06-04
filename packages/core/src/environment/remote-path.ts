/**
 * Path resolution for remote sandboxes.
 *
 * The agent's config rootPath is often the local machine cwd; remote APIs
 * expect paths inside the remote workspace (e.g. "/" or "/workspace").
 */

import * as path from "node:path";

/**
 * Resolve a tool/agent path to a remote sandbox path.
 *
 * - Relative paths resolve under `workspacePath`
 * - Absolute paths pass through (already remote)
 * - Paths under `localRootPath` are rewritten into the remote workspace
 */
export function createRemotePathResolver(workspacePath: string, localRootPath?: string): (inputPath: string) => string {
  const workspace = normalizeRemoteRoot(workspacePath);
  const localRoot = localRootPath ? normalizeRemoteRoot(localRootPath) : undefined;

  return (inputPath: string): string => {
    if (!inputPath || inputPath === ".") {
      return workspace;
    }

    if (localRoot && inputPath.startsWith(localRoot)) {
      const relative = inputPath.slice(localRoot.length).replace(/^\/+/, "");
      return relative ? path.posix.join(workspace, relative) : workspace;
    }

    if (path.posix.isAbsolute(inputPath)) {
      return inputPath;
    }

    return path.posix.join(workspace, inputPath);
  };
}

function normalizeRemoteRoot(p: string): string {
  const normalized = path.posix.normalize(p.replace(/\\/g, "/"));
  return normalized === "" ? "/" : normalized;
}
