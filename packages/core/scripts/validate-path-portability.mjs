/**
 * Validate Windows path conversions at the three boundaries that were POSIX-only.
 *
 * These are not Windows-only code paths guarded by an `if (win32)` — they are conversions that
 * must work for *any* input, which means the Windows cases are reachable and testable on
 * Linux. That is the point: a Windows branch nobody can exercise is a branch that rots, and
 * all three of these were written assuming `/`-separated, no-drive-letter paths.
 *
 * Covered:
 * - LSP file-URI round-trip (`agent/lsp/shared/format.ts`) — `file:///C:/x` must not become
 *   `/C:/x`, and converting back must reproduce the URI.
 * - Sandbox deny rules (`@codent/node`) — must resolve `~` rather than emit literal `~/.ssh`.
 *
 * NOT covered here: workspace-relative paths (`@codent/app`). That conversion is asserted in
 * `packages/app/test/workspace-path.test.mjs` instead, because `@codent/app` does not export
 * it from its barrel and reaching into a hashed chunk name from another package's validator
 * would break on any bundler-hash change.
 */

import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";

import { buildOsSandboxConfig } from "../../node/dist/index.mjs";
import { fileUriToPath, formatLocation, pathToFileUri } from "../dist/dev.mjs";

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`PASS  ${label}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  ${label}`);
    console.log(`      ${err.message.split("\n")[0]}`);
  }
}

// ---------------------------------------------------------------------------
// 5.1 — LSP file URI <-> path
// ---------------------------------------------------------------------------

check("file URI: Windows drive path keeps its drive letter", () => {
  assert.equal(fileUriToPath("file:///C:/dir/file.ts", "C:\\repo"), "C:/dir/file.ts");
});

check("file URI: Windows path under the root becomes relative", () => {
  assert.equal(fileUriToPath("file:///C:/repo/src/a.ts", "C:\\repo"), "src/a.ts");
});

check("file URI: Windows path equal to the root becomes '.'", () => {
  assert.equal(fileUriToPath("file:///C:/repo", "C:\\repo"), ".");
});

check("file URI: POSIX behaviour unchanged", () => {
  assert.equal(fileUriToPath("file:///repo/src/a.ts", "/repo"), "src/a.ts");
  assert.equal(fileUriToPath("file:///repo", "/repo"), ".");
});

check("file URI: traversal outside the root stays relative-first", () => {
  // Not under the root — must not be chopped into a bogus relative path.
  assert.equal(fileUriToPath("file:///elsewhere/a.ts", "/repo"), "/elsewhere/a.ts");
});

check("file URI: round-trips a Windows drive path", () => {
  const uri = "file:///C:/dir/file.ts";
  const back = pathToFileUri(fileUriToPath(uri, "C:\\repo"));
  assert.equal(back, uri);
});

check("file URI: round-trips a POSIX path", () => {
  // Round-tripping only holds for paths that stay absolute. A path *under* rootDir is
  // intentionally relativized (`/repo/src/a.ts` -> `src/a.ts`), and a relative path cannot
  // reproduce the original absolute URI — that is inherent to the conversion, not a defect.
  const uri = "file:///elsewhere/a.ts";
  const back = pathToFileUri(fileUriToPath(uri, "/repo"));
  assert.equal(back, uri);
});

check("file URI: a path under the root is relativized (so it cannot round-trip)", () => {
  assert.equal(fileUriToPath("file:///repo/src/a.ts", "/repo"), "src/a.ts");
});

check("file URI: formatLocation renders a Windows location", () => {
  const out = formatLocation(
    { uri: "file:///C:/repo/src/a.ts", range: { start: { line: 9, character: 4 }, end: { line: 9, character: 6 } } },
    "C:\\repo"
  );
  assert.equal(out, "src/a.ts:10:5");
});

// ---------------------------------------------------------------------------
// 5.3 — sandbox deny rules
// ---------------------------------------------------------------------------

check("sandbox: denyRead resolves the home directory", () => {
  const config = buildOsSandboxConfig("/repo");
  const deny = config.filesystem.denyRead;
  const home = homedir();
  assert.deepEqual(
    deny,
    [".ssh", ".aws", join(".config", "gcloud"), ".gnupg"].map((s) => join(home, s))
  );
});

check("sandbox: no literal tilde survives in denyRead", () => {
  const config = buildOsSandboxConfig("/repo");
  const withTilde = config.filesystem.denyRead.filter((p) => p.includes("~"));
  assert.deepEqual(withTilde, []);
});

check("sandbox: ssh key directory is still denied", () => {
  const config = buildOsSandboxConfig("/repo");
  assert.ok(config.filesystem.denyRead.includes(join(homedir(), ".ssh")));
});

if (failures > 0) {
  console.error(`\nvalidate:path-portability FAILED (${failures} case(s))`);
  process.exit(1);
}
console.log("\nvalidate-path-portability: ok");
