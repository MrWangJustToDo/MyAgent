/**
 * Validates diff-stats helpers (per-file +/− line counts parsing).
 *
 * Run: node packages/app/test/workspace-diff-stats.test.mjs
 */
import assert from "node:assert/strict";

const { numstatPath, parseDiffNumstat } = await import("../dist/utils/workspace-diff-stats.mjs");

// Plain numstat lines.
{
  const m = parseDiffNumstat("12\t3\tsrc/foo.ts\n1\t0\tREADME.md\n");
  assert.deepEqual(m.get("src/foo.ts"), { added: 12, deleted: 3 });
  assert.deepEqual(m.get("README.md"), { added: 1, deleted: 0 });
}

// Binary files report `-\t-` → counted as 0/0.
{
  const m = parseDiffNumstat("-\t-\tbin/data.bin\n");
  assert.deepEqual(m.get("bin/data.bin"), { added: 0, deleted: 0 });
}

// Paths with spaces survive tab splitting.
{
  const m = parseDiffNumstat("2\t1\tmy file.txt\n");
  assert.deepEqual(m.get("my file.txt"), { added: 2, deleted: 1 });
}

// Rename notation resolves to the destination path.
{
  assert.equal(numstatPath("src/{old.ts => new.ts}"), "src/new.ts");
  assert.equal(numstatPath("old.ts => new.ts"), "new.ts");
  assert.equal(numstatPath("plain/path.ts"), "plain/path.ts");
  const m = parseDiffNumstat("0\t0\tdir/{a.ts => b.ts}\n");
  assert.deepEqual([...m.keys()], ["dir/b.ts"]);
}

console.log("workspace-diff-stats validation passed");
