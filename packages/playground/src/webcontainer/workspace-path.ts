/**
 * Resolve a path against a WebContainer workspace root (POSIX).
 * Blocks traversal outside `rootPath`.
 *
 * When `rootPath` is not `"/"`, absolute paths like `/news/index.html` are
 * treated as **workspace-relative** (joined with rootPath), not filesystem-root
 * absolute.  This unifies the path namespace between file tools and the shell —
 * both see the same `/home/workspace/…` paths.
 */

export function resolveWorkspacePath(rootPath: string, inputPath: string): string {
  const root = normalizeAbsolute(rootPath);

  let resolved: string;

  if (isAbsolute(inputPath)) {
    const normalized = normalizeAbsolute(inputPath);
    if (isInsideRoot(root, normalized)) {
      // Already a full path under root — use as-is (e.g. /home/workspace/news)
      resolved = normalized;
    } else if (root === "/") {
      // root === "/" — everything absolute is inside "/"
      resolved = normalized;
    } else {
      // Absolute path outside root → treat as workspace-relative
      // e.g. "/news" → "/home/workspace/news"
      const relative = inputPath.replace(/^\//, "");
      resolved = relative ? normalizeAbsolute(joinPosix(root, relative)) : root;
    }
  } else {
    // Relative path — join with root
    resolved = normalizeAbsolute(joinPosix(root, inputPath));
  }

  if (!isInsideRoot(root, resolved)) {
    throw new Error(`Path traversal blocked: "${inputPath}" resolves outside workspace root`);
  }

  return resolved;
}

/**
 * Convert a resolved (root-absolute) workspace path back to a
 * **workdir-relative** path for `wc.fs` APIs.
 *
 * WebContainer's `wc.fs` treats `/` as the mounted project workdir
 * (`/home/workspace/` inside the container).  When `rootPath` is
 * `/home/workspace`, the resolver above produces paths like
 * `/home/workspace/news/index.html` — but `wc.fs.readFile` expects
 * `/news/index.html`.  This function strips the prefix.
 */
export function toWorkdirPath(rootPath: string, resolvedPath: string): string {
  if (rootPath === "/") return resolvedPath;
  if (resolvedPath === rootPath) return "/";
  if (resolvedPath.startsWith(`${rootPath}/`)) {
    return resolvedPath.slice(rootPath.length) || "/";
  }
  // Already workdir-relative
  return resolvedPath;
}

/**
 * Map CoreEnv workspace paths to WebContainer `spawn({ cwd })`.
 *
 * WebContainer's spawn `cwd` must be **relative to `wc.workdir`** (the mounted
 * project).  This function strips the rootPath prefix so `jsh` starts in the
 * correct project directory.
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
