import { getEnv } from "@my-agent/core";

/** Join paths using CoreEnv path utilities (POSIX-safe). */
export function joinWorkspacePath(...parts: string[]): string {
  const env = getEnv();
  return env.path?.join(...parts) ?? parts.join("/");
}

/** Convert an absolute workspace path to a root-relative path for git status lookup. */
export function workspaceRelativePath(rootPath: string, fullPath: string): string {
  const root = rootPath.endsWith("/") ? rootPath.slice(0, -1) : rootPath;
  if (fullPath === root) return ".";
  const prefix = `${root}/`;
  if (fullPath.startsWith(prefix)) return fullPath.slice(prefix.length);
  return fullPath;
}
