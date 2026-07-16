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
