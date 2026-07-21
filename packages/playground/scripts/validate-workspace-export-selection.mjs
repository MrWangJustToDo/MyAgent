/** @ts-nocheck */
/**
 * Validates workspace export selection helpers.
 * Mirrors packages/playground/src/webcontainer/workspace-export-selection.ts
 *
 * Run: pnpm --filter @my-agent/playground validate:workspace-export-selection
 */
import assert from "node:assert/strict";
/* global console: readonly */

function isUnderPath(path, ancestor) {
  if (ancestor === "/") return path !== "/";
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

function togglePathSelection(selected, entries, path, checked) {
  const next = new Set(selected);
  const related = entries.filter((e) => e.path === path || isUnderPath(e.path, path));
  if (checked) {
    for (const e of related) next.add(e.path);
  } else {
    for (const e of related) next.delete(e.path);
  }
  return next;
}

function selectedFilePaths(selected, entries) {
  return entries.filter((e) => e.type === "file" && selected.has(e.path)).map((e) => e.path);
}

function deselectByDirName(selected, entries, dirName) {
  const next = new Set(selected);
  for (const e of entries) {
    const parts = e.path.split("/").filter(Boolean);
    if (parts.includes(dirName)) next.delete(e.path);
  }
  return next;
}

const entries = [
  { path: "/src", type: "directory" },
  { path: "/src/a.ts", type: "file" },
  { path: "/node_modules", type: "directory" },
  { path: "/node_modules/x/index.js", type: "file" },
  { path: "/README.md", type: "file" },
];

let selected = togglePathSelection(new Set(), entries, "/src", true);
assert.ok(selected.has("/src"));
assert.ok(selected.has("/src/a.ts"));
assert.deepEqual(selectedFilePaths(selected, entries), ["/src/a.ts"]);

selected = togglePathSelection(selected, entries, "/src", false);
assert.equal(selected.has("/src"), false);
assert.equal(selected.has("/src/a.ts"), false);

selected = new Set(entries.map((e) => e.path));
selected = deselectByDirName(selected, entries, "node_modules");
assert.equal(selected.has("/node_modules"), false);
assert.equal(selected.has("/node_modules/x/index.js"), false);
assert.ok(selected.has("/README.md"));

console.log("validate-workspace-export-selection: ok");
