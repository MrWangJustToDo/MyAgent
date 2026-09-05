/**
 * Validates quick-open fuzzy matcher scoring/ranking.
 *
 * Run: node packages/app/test/workspace-file-search.test.mjs
 */
import assert from "node:assert/strict";

const { fuzzyFilterFiles, fuzzyMatch } = await import("../dist/utils/workspace-file-search.mjs");

// Subsequence matching + case-insensitivity.
{
  assert.ok(fuzzyMatch("wdt", "src/utils/workspace-diff-tree.ts") !== null);
  assert.ok(fuzzyMatch("WDT", "src/utils/workspace-diff-tree.ts") !== null);
  assert.equal(fuzzyMatch("zzz", "src/utils/workspace-diff-tree.ts"), null);
  assert.equal(fuzzyMatch("util", "src.ts"), null); // out of order / missing
}

// Consecutive runs score higher than scattered matches.
{
  const consecutive = fuzzyMatch("ab", "ab");
  const scattered = fuzzyMatch("ab", "axb");
  assert.ok(consecutive !== null && scattered !== null && consecutive > scattered);
}

// Basename matches score higher than same-length dir-prefix matches.
{
  const dirMatch = fuzzyMatch("util", "utils/a.ts");
  const baseMatch = fuzzyMatch("util", "a/utils.ts");
  assert.ok(dirMatch !== null && baseMatch !== null && baseMatch > dirMatch);
}

// Ranking: boundary matches first, then name order for ties.
{
  const paths = ["src/other/file.ts", "README.md", "src/file-icons.ts"];
  const results = fuzzyFilterFiles("file", paths);
  assert.deepEqual(
    results.map((r) => r.path),
    ["src/file-icons.ts", "src/other/file.ts"]
  );
}

// Empty query returns the leading slice.
{
  const paths = ["a.ts", "b.ts", "c.ts"];
  assert.deepEqual(
    fuzzyFilterFiles("", paths, 2).map((r) => r.path),
    ["a.ts", "b.ts"]
  );
}

// Results expose matched indices (for match highlighting).
{
  const [hit] = fuzzyFilterFiles("wdt", ["src/utils/workspace-diff-tree.ts"]);
  assert.ok(hit !== undefined);
  assert.ok(hit.indices.length === 3);
  const chars = hit.indices.map((i) => hit.path[i]).join("");
  assert.equal(chars.toLowerCase(), "wdt");
}

console.log("workspace-file-search validation passed");
