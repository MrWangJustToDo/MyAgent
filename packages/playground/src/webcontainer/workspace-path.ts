/**
 * Resolve a path against a WebContainer workspace root (POSIX).
 * Blocks traversal outside `rootPath`.
 */

export function resolveWorkspacePath(rootPath: string, inputPath: string): string {
  const root = normalizeAbsolute(rootPath);
  const resolved = isAbsolute(inputPath) ? normalizeAbsolute(inputPath) : normalizeAbsolute(joinPosix(root, inputPath));

  if (!isInsideRoot(root, resolved)) {
    throw new Error(`Path traversal blocked: "${inputPath}" resolves outside workspace root`);
  }

  return resolved;
}

/**
 * Map CoreEnv workspace paths to WebContainer `spawn({ cwd })`.
 *
 * WebContainer's spawn `cwd` is **relative to `wc.workdir`** (the mounted project).
 * Passing a Linux absolute path like `"/"` starts jsh at the container FS root
 * (`/bin`, `/home`, …) — not the project — so shell and `write_file` diverge.
 */
export function toWebContainerSpawnCwd(rootPath: string, cwd?: string): string {
  const root = normalizeAbsolute(rootPath);
  const resolved = cwd ? resolveWorkspacePath(root, cwd) : root;

  if (root === "/") {
    if (resolved === "/") return ".";
    return resolved.replace(/^\//, "") || ".";
  }

  if (resolved === root) return ".";
  if (resolved.startsWith(`${root}/`)) {
    return resolved.slice(root.length + 1) || ".";
  }

  return ".";
}

function isInsideRoot(root: string, resolved: string): boolean {
  if (root === "/") return resolved.startsWith("/");
  return resolved === root || resolved.startsWith(`${root}/`);
}

function isAbsolute(p: string): boolean {
  return p.startsWith("/");
}

function joinPosix(...parts: string[]): string {
  const joined = parts
    .filter((p) => p.length > 0)
    .join("/")
    .replace(/\/+/g, "/");
  return joined || "/";
}

function normalizeAbsolute(p: string): string {
  const absolute = isAbsolute(p) ? p : `/${p}`;
  const segments = absolute.split("/");
  const out: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }

  return `/${out.join("/")}`;
}
