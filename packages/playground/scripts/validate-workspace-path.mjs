/* global process */
import assert from "node:assert/strict";

/** Mirrors packages/playground/src/webcontainer/workspace-path.ts for Node validation. */
function resolveWorkspacePath(rootPath, inputPath) {
  const root = normalizeAbsolute(rootPath);
  const resolved = isAbsolute(inputPath) ? normalizeAbsolute(inputPath) : normalizeAbsolute(joinPosix(root, inputPath));

  if (!isInsideRoot(root, resolved)) {
    throw new Error(`Path traversal blocked: "${inputPath}" resolves outside workspace root`);
  }

  return resolved;
}

function isInsideRoot(root, resolved) {
  if (root === "/") return resolved.startsWith("/");
  return resolved === root || resolved.startsWith(`${root}/`);
}

function isAbsolute(p) {
  return p.startsWith("/");
}

function joinPosix(...parts) {
  const joined = parts
    .filter((p) => p.length > 0)
    .join("/")
    .replace(/\/+/g, "/");
  return joined || "/";
}

function normalizeAbsolute(p) {
  const absolute = isAbsolute(p) ? p : `/${p}`;
  const segments = absolute.split("/");
  const out = [];

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

assert.equal(resolveWorkspacePath("/", "src/a.ts"), "/src/a.ts");
assert.equal(resolveWorkspacePath("/", "/src/a.ts"), "/src/a.ts");
assert.equal(resolveWorkspacePath("/home/project", "pkg/x"), "/home/project/pkg/x");
assert.equal(resolveWorkspacePath("/home/project", "/home/project/pkg/x"), "/home/project/pkg/x");
assert.throws(() => resolveWorkspacePath("/home/project", "../escape"), /traversal/i);
assert.throws(() => resolveWorkspacePath("/home/project", "/etc/passwd"), /traversal/i);

process.stdout.write("validate-workspace-path: ok\n");
