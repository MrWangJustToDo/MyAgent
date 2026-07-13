import { workspaceRelativePath } from "./workspace-path.js";

export type WorkspaceFileDiff = {
  relativePath: string;
  fileName: string;
  oldContent: string;
  newContent: string;
  hasChanges: boolean;
};

const diffCache = new Map<string, Promise<WorkspaceFileDiff>>();

/** Shell-safe single-quoted argument for git commands. */
export function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function clearWorkspaceDiffCache(): void {
  diffCache.clear();
}

export function fetchWorkspaceFileDiff(rootPath: string, filePath: string): Promise<WorkspaceFileDiff> {
  const key = `${rootPath}\0${filePath}`;
  const cached = diffCache.get(key);
  if (cached) return cached;

  const promise = loadWorkspaceFileDiff(rootPath, filePath).catch((error: unknown) => {
    diffCache.delete(key);
    throw error;
  });
  diffCache.set(key, promise);
  return promise;
}

async function loadWorkspaceFileDiff(rootPath: string, filePath: string): Promise<WorkspaceFileDiff> {
  const relativePath = workspaceRelativePath(rootPath, filePath);
  const fileName = filePath.split("/").pop() || filePath;
  const { getEnv } = await import("@my-agent/core");
  const env = getEnv();

  let oldContent = "";
  const quoted = quoteShellArg(relativePath);
  try {
    const head = await env.runCommand(`git show HEAD:${quoted}`, { cwd: rootPath });
    if (head.exitCode === 0) oldContent = head.stdout;
  } catch {
    oldContent = "";
  }

  let newContent = "";
  try {
    newContent = await env.fs.readFile(filePath);
  } catch {
    newContent = "";
  }

  let hasChanges = oldContent !== newContent;
  try {
    const diff = await env.runCommand(`git diff HEAD -- ${quoted}`, { cwd: rootPath });
    if (diff.exitCode === 0 && diff.stdout.trim().length > 0) {
      hasChanges = true;
    }
  } catch {
    // Fall back to content comparison above.
  }

  return {
    relativePath,
    fileName,
    oldContent,
    newContent,
    hasChanges,
  };
}
