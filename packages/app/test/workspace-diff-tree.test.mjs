/**
 * Validates diff-mode tree preprocessing (changed-files-only tree with
 * GitHub-PR-style single-subdirectory chain compression).
 *
 * Run: node packages/app/test/workspace-diff-tree.test.mjs
 */
import assert from "node:assert/strict";

// joinWorkspacePath() resolves through CoreEnv — a minimal stub is enough.
const { registerCoreEnv } = await import(new URL("../../core/dist/index.mjs", import.meta.url).href);
registerCoreEnv({ rootPath: "/repo" });

const { buildDiffTreeItems, orderedChangedFiles } = await import("../dist/utils/workspace-diff-tree.mjs");

const status = (entries) => new Map(entries);

const names = (items) => items.map((i) => `${i.name}${i.type === "directory" ? "/" : ""}@${i.indent}`);

// Single deep chain: first level kept, deeper single-subdir chains merged.
{
  const items = buildDiffTreeItems(status([["app/src/utils/generateDir.ts", "M"]]), "/repo", new Set());
  assert.deepEqual(names(items), ["app/@0", "src/utils/@1", "generateDir.ts@2"]);
}

// Several files sharing a directory: no merge, normal nesting.
{
  const items = buildDiffTreeItems(
    status([
      ["src/a.ts", "M"],
      ["src/b.ts", "??"],
    ]),
    "/repo",
    new Set()
  );
  assert.deepEqual(names(items), ["src/@0", "a.ts@1", "b.ts@1"]);
}

// Mixed: file + subdir inside the same dir prevents merging that chain.
{
  const items = buildDiffTreeItems(
    status([
      ["src/x.ts", "M"],
      ["src/lib/y.ts", "D"],
    ]),
    "/repo",
    new Set()
  );
  assert.deepEqual(names(items), ["src/@0", "lib/@1", "y.ts@2", "x.ts@1"]);
}

// Top-level files stay at indent 0 (directories sort first).
{
  const items = buildDiffTreeItems(
    status([
      ["README.md", "M"],
      ["z.md", "??"],
    ]),
    "/repo",
    new Set()
  );
  assert.deepEqual(names(items), ["README.md@0", "z.md@0"]);
}

// Empty / no-root inputs.
{
  assert.deepEqual(buildDiffTreeItems(new Map(), "/repo", new Set()), []);
  assert.deepEqual(buildDiffTreeItems(status([["a.ts", "M"]]), "", new Set()), []);
}

// Collapsed directories hide their subtree.
{
  const items = buildDiffTreeItems(
    status([
      ["a/b/c.ts", "M"],
      ["a/b/d.ts", "M"],
      ["e.ts", "M"],
    ]),
    "/repo",
    new Set(["a/b"])
  );
  assert.deepEqual(names(items), ["a/@0", "b/@1", "e.ts@0"]);
}

// Windows-style backslash keys normalize to "/".
{
  const items = buildDiffTreeItems(status([["src\\win.ts", "M"]]), "/repo", new Set());
  assert.deepEqual(names(items), ["src/@0", "win.ts@1"]);
}

// Renamed paths (old -> new) render both sides as rows.
{
  const items = buildDiffTreeItems(
    status([
      ["old/name.ts", "R"],
      ["new/name.ts", "R"],
    ]),
    "/repo",
    new Set()
  );
  assert.deepEqual(names(items), ["new/@0", "name.ts@1", "old/@0", "name.ts@1"]);
}

// orderedChangedFiles: `[` / `]` order must match the rendered tree
// (directories first, case-insensitive) — NOT a plain lexicographic path sort.
{
  const map = status([
    ["src/z.ts", "M"],
    ["src/components/Foo.tsx", "M"],
    ["src/components/bar.tsx", "M"],
    ["src/utils/a.ts", "M"],
    ["README.md", "M"],
  ]);
  const ordered = orderedChangedFiles(map, "/repo").map((p) => p.replace("/repo/", ""));
  // dirs first (components, utils), then files; case-insensitive within a dir.
  assert.deepEqual(ordered, [
    "src/components/bar.tsx",
    "src/components/Foo.tsx",
    "src/utils/a.ts",
    "src/z.ts",
    "README.md",
  ]);

  // And it must differ from the old plain-sort behaviour in exactly these cases.
  const plainSorted = [...map.keys()].map((rel) => `/repo/${rel}`).sort();
  assert.notDeepEqual(ordered, plainSorted, "tree order differs from plain path sort");
}

// Same-name file vs directory: directory subtree sorts before the sibling file.
{
  const ordered = orderedChangedFiles(
    status([
      ["src/foo.ts", "M"],
      ["src/foo/bar.ts", "M"],
      ["src/foo.tsx", "M"],
    ]),
    "/repo"
  ).map((p) => p.replace("/repo/", ""));
  assert.deepEqual(ordered, ["src/foo/bar.ts", "src/foo.ts", "src/foo.tsx"]);
}

// No root / empty map => empty order.
{
  assert.deepEqual(orderedChangedFiles(new Map(), "/repo"), []);
  assert.deepEqual(orderedChangedFiles(status([["a.ts", "M"]]), ""), []);
}

console.log("workspace-diff-tree validation passed");
