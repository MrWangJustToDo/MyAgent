/**
 * Validates the session-retrieval turn-context section.
 *
 * Guards the contract that makes this the single home for "how to search past
 * conversation" — the knowledge previously spread across the compaction summary,
 * the archive file header, `AGENTS.md`, and `ARCHITECTURE.md`, two of which are
 * frozen and had already drifted apart:
 *
 *   1. Gated on history existing; absent entirely on a fresh workspace
 *   2. Both on-disk shapes described, with the reading difference stated
 *      (compacted slices are greppable text; uncompacted sessions are one long
 *      JSON line, so grep only locates the session)
 *   3. The current session's own files called out as redundant
 *   4. No volatile content (counts/versions), so the section hash is stable
 *   5. The body is fully static — no per-session paths — so one admission settles
 *      it; this session's paths come from the compaction summary instead
 *   6. The kind is NOT in SUBAGENT_ALLOWED_KINDS (root-agent decision)
 *
 * Run: pnpm --filter @codent/core run validate:session-retrieval
 */

import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SUBAGENT_ALLOWED_KINDS,
  SESSION_RETRIEVAL_KIND,
  formatSessionRetrievalSection,
  hasSessionHistory,
  listCompactArchives,
  registerCoreEnv,
  renderStaticRetrievalBody,
} from "../dist/dev.mjs";

// ---------------------------------------------------------------------------
// Disk-backed CoreEnv over a temp workspace
// ---------------------------------------------------------------------------

let workspace = "";
let rootPath = join(tmpdir(), `instr-retrieval-${Date.now()}`);

registerCoreEnv({
  rootPath,
  getPlatform: async () => "test",
  getArch: async () => "arm64",
  getEnv: async () => ({}),
  homedir: async () => "/home/test",
  fs: {
    readFile: async (p) => (await import("node:fs")).readFileSync(p, "utf-8"),
    stat: async (p) => {
      const s = (await import("node:fs")).statSync(p);
      return { isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size, mtime: s.mtime };
    },
    readdir: async (p) =>
      (await import("node:fs")).readdirSync(p, { withFileTypes: true }).map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : "file",
      })),
    writeFile: async (p, c) => writeFileSync(p, String(c)),
    mkdir: async (p) => mkdirSync(p, { recursive: true }),
    exists: async (p) => (await import("node:fs")).existsSync(p),
    remove: async (p) => (await import("node:fs")).rmSync(p, { recursive: true, force: true }),
  },
  byteLength: (s) => Buffer.byteLength(s, "utf-8"),
  runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
  exec: async () => ({ stdout: "", stderr: "", code: 0 }),
  fetch: async () => ({ ok: true, status: 200 }),
});

function resetWorkspace() {
  rmSync(rootPath, { recursive: true, force: true });
  mkdirSync(rootPath, { recursive: true });
  workspace = rootPath;
}

// ---------------------------------------------------------------------------
// 1. Gating: no history → no section
// ---------------------------------------------------------------------------
await (async () => {
  resetWorkspace();
  assert.equal(await hasSessionHistory(), false, "empty workspace has no history");
  assert.equal(
    formatSessionRetrievalSection({ hasHistory: false }),
    undefined,
    "no history → no section (absent, not empty)"
  );

  // A sessions directory that exists but is empty is still not history.
  mkdirSync(join(workspace, ".agents", "sessions"), { recursive: true });
  assert.equal(await hasSessionHistory(), false, "empty sessions dir is not history");

  // A single session is history.
  writeFileSync(join(workspace, ".agents", "sessions", "ses_a.session.json"), "{}");
  assert.equal(await hasSessionHistory(), true, "one session counts as history");

  console.log("✓ the section is gated on history existing");
})();

// ---------------------------------------------------------------------------
// 2. Both shapes described, with the reading difference
// ---------------------------------------------------------------------------
await (async () => {
  resetWorkspace();
  const section = formatSessionRetrievalSection({ hasHistory: true });
  assert.ok(section, "section renders when history exists");
  assert.ok(section.startsWith("<session_retrieval>"), "opens with its tag");
  assert.ok(section.endsWith("</session_retrieval>"), "closes with its tag");

  assert.match(section, /compact-<N>\.md/, "names the compacted-slice shape");
  assert.match(section, /plain\s+text|plain text/, "states slices are plain text");
  assert.match(section, /newest → oldest/, "states the newest-first search order");

  assert.match(section, /\.session\.json/, "names the uncompacted shape");
  assert.match(section, /JSON line/, "states a session is one long JSON line");
  assert.match(section, /uiMessages/, "says to filter uiMessages");
  assert.match(section, /parts\[\]\.content/, "says where message text lives");

  console.log("✓ both on-disk shapes and their reading difference are stated");
})();

// ---------------------------------------------------------------------------
// 3. The current session is called out as redundant
// ---------------------------------------------------------------------------
await (async () => {
  const section = formatSessionRetrievalSection({ hasHistory: true });
  assert.match(
    section,
    /current session's own files/i,
    "warns that the current session's own files duplicate the live conversation"
  );

  console.log("✓ the current session's own files are called out as redundant");
})();

// ---------------------------------------------------------------------------
// 4. No volatile content
// ---------------------------------------------------------------------------
await (async () => {
  const first = formatSessionRetrievalSection({ hasHistory: true });
  const second = formatSessionRetrievalSection({ hasHistory: true });
  assert.equal(first, second, "identical inputs → byte-identical rendering (hash stable)");

  // Counts are the specific hazard: they change as sessions are created/pruned.
  assert.doesNotMatch(first, /\b\d+\s+sessions?\b/, "no session counts");
  assert.doesNotMatch(first, /\b\d+\s+files?\b/, "no file counts");
  assert.doesNotMatch(first, /\bas of\b|\bcurrently\b/i, "no time-relative wording");

  console.log("✓ the body carries no volatile content");
})();

// ---------------------------------------------------------------------------
// 5. The body is fully static — one admission settles it (no per-session paths)
// ---------------------------------------------------------------------------
await (async () => {
  // The section must not vary with this session's compaction state: paths are
  // delivered by the compaction summary's `## Compact archives` block, so listing
  // them here too would change the hash on every compaction and re-inject the whole
  // block for information the summary already carries.
  const beforeCompacting = formatSessionRetrievalSection({ hasHistory: true });

  resetWorkspace();
  const dir = join(workspace, ".agents", "transcripts", "ses_x");
  mkdirSync(dir, { recursive: true });
  for (const n of [1, 2, 3]) writeFileSync(join(dir, `compact-${n}.md`), "x");

  const afterCompacting = formatSessionRetrievalSection({ hasHistory: true });
  assert.equal(
    afterCompacting,
    beforeCompacting,
    "the section does not change when this session gains archives (hash must settle)"
  );
  assert.doesNotMatch(afterCompacting, /\.agents\/transcripts\/ses_/, "no concrete session path in the section");
  assert.doesNotMatch(afterCompacting, /This session's compacted slices/, "no per-session path list in the section");

  // Discovery still works for anything that needs it, and degrades safely.
  const found = await listCompactArchives("ses_x");
  assert.deepEqual(
    found,
    [1, 2, 3].map((n) => `.agents/transcripts/ses_x/compact-${n}.md`),
    `paths are numeric-ascending, got ${JSON.stringify(found)}`
  );
  assert.deepEqual(await listCompactArchives("ses_missing"), [], "missing session dir → empty list");
  assert.deepEqual(await listCompactArchives(undefined), [], "no session id → empty list");

  console.log("✓ the section is fully static; archive paths come from the summary");
})();

// ---------------------------------------------------------------------------
// 6. Root-agent only
// ---------------------------------------------------------------------------
{
  assert.equal(
    SUBAGENT_ALLOWED_KINDS.has(SESSION_RETRIEVAL_KIND),
    false,
    "subagents must not receive cross-session retrieval guidance"
  );
  console.log("✓ the kind is excluded from SUBAGENT_ALLOWED_KINDS");
}

// ---------------------------------------------------------------------------
// 7. The static body is the section minus paths (used by the drift guard)
// ---------------------------------------------------------------------------
await (async () => {
  const body = renderStaticRetrievalBody();
  assert.ok(body.length > 0, "static body is non-empty");
  assert.doesNotMatch(body, /transcripts\/ses_/, "static body names no concrete session path");

  console.log("✓ the static body is available and path-free");
})();

resetWorkspace();
rmSync(rootPath, { recursive: true, force: true });

console.log("session-retrieval validation passed");
