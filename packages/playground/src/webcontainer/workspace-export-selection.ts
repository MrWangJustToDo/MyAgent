import type { FileSystemAPI } from "@webcontainer/api";

export type WorkspaceEntry = {
  /** Absolute path within the WebContainer (POSIX, starts with `/`). */
  path: string;
  type: "file" | "directory";
};

function joinPath(parent: string, name: string): string {
  if (parent === "/") return `/${name}`;
  return `${parent}/${name}`;
}

/**
 * Recursively list workspace entries (directories before their children, sorted by path).
 */
export async function listWorkspaceEntries(
  fs: FileSystemAPI,
  rootPath = "/",
  options?: { maxEntries?: number }
): Promise<WorkspaceEntry[]> {
  const maxEntries = options?.maxEntries ?? 5000;
  const out: WorkspaceEntry[] = [];

  async function walk(dir: string): Promise<void> {
    if (out.length >= maxEntries) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of sorted) {
      if (out.length >= maxEntries) return;
      const path = joinPath(dir, entry.name);
      if (entry.isDirectory()) {
        out.push({ path, type: "directory" });
        await walk(path);
      } else {
        out.push({ path, type: "file" });
      }
    }
  }

  if (rootPath === "/") {
    await walk("/");
  } else {
    out.push({ path: rootPath, type: "directory" });
    await walk(rootPath);
  }

  return out;
}

/** True if `path` is `ancestor` or nested under it. */
export function isUnderPath(path: string, ancestor: string): boolean {
  if (ancestor === "/") return path !== "/";
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

/** Depth for indentation (root children = 0). */
export function pathDepth(path: string): number {
  if (path === "/") return 0;
  return path.split("/").filter(Boolean).length - 1;
}

/**
 * Toggle a path in the selection set.
 * Checking a directory selects all known descendants; unchecking clears them.
 */
export function togglePathSelection(
  selected: Set<string>,
  entries: WorkspaceEntry[],
  path: string,
  checked: boolean
): Set<string> {
  const next = new Set(selected);
  const related = entries.filter((e) => e.path === path || isUnderPath(e.path, path));

  if (checked) {
    for (const e of related) {
      next.add(e.path);
    }
  } else {
    for (const e of related) {
      next.delete(e.path);
    }
    // Also clear ancestors that are no longer fully selected? Keep simple: only clear related.
  }

  return next;
}

/** File paths to include in the zip (directories alone are not zip entries). */
export function selectedFilePaths(selected: Set<string>, entries: WorkspaceEntry[]): string[] {
  return entries.filter((e) => e.type === "file" && selected.has(e.path)).map((e) => e.path);
}

/** Uncheck anything under matching directory names (e.g. node_modules). */
export function deselectByDirName(selected: Set<string>, entries: WorkspaceEntry[], dirName: string): Set<string> {
  const next = new Set(selected);
  for (const e of entries) {
    const parts = e.path.split("/").filter(Boolean);
    if (parts.includes(dirName)) {
      next.delete(e.path);
    }
  }
  return next;
}
