/**
 * Validates compact transcript archive helpers (format, pointer, write/omit).
 *
 * Run: pnpm --filter @my-agent/core run validate:compact-archive
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildCompactArchiveMarkdown,
  clearCoreEnv,
  COMPACT_TRANSCRIPT_ROOT,
  extractCompactArchivePaths,
  formatCompactArchivesSection,
  maybeAppendCompactArchive,
  parseCompactSequence,
  registerCoreEnv,
  stripCompactArchiveSections,
  writeCompactArchive,
} from "../dist/dev.mjs";

assert.equal(parseCompactSequence("compact-1.md"), 1);
assert.equal(parseCompactSequence("compact-12.md"), 12);
assert.equal(parseCompactSequence("other.md"), null);

const messages = [
  { role: "user", content: "Investigate login bug" },
  { role: "assistant", content: "Found null check issue" },
];

const markdown = buildCompactArchiveMarkdown({
  sessionId: "ses_test",
  sequence: 3,
  cutIndex: 4,
  messages,
  timestamp: "2026-01-01T00:00:00.000Z",
});
assert.match(markdown, /session: ses_test/);
assert.match(markdown, /sequence: 3/);
assert.match(markdown, /cutIndex: 4/);
assert.match(markdown, /\[User\]: Investigate login bug/);

const section = formatCompactArchivesSection([
  ".agents/transcripts/ses_test/compact-1.md",
  ".agents/transcripts/ses_test/compact-2.md",
]);
assert.match(section, /## Compact archives/);
assert.match(section, /Cold storage for compacted turns/);
assert.match(section, /newest → oldest/);
assert.match(section, /File shape:/);
assert.match(section, /compact-1\.md/);
assert.match(section, /compact-2\.md/);
assert.match(section, /newest slice/);
assert.match(section, /Do \*\*not\*\* load whole archive files/);

// Instructional prose must not be mistaken for real archive paths on the next compact.
assert.deepEqual(extractCompactArchivePaths(section), [
  ".agents/transcripts/ses_test/compact-1.md",
  ".agents/transcripts/ses_test/compact-2.md",
]);
assert.deepEqual(extractCompactArchivePaths("- `compact-1.md` = earliest compressed slice"), []);

const stripped = stripCompactArchiveSections(`## Goal\n\nShip it${section}`);
assert.match(stripped, /## Goal/);
assert.doesNotMatch(stripped, /## Compact archives/);

const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "compact-archive-"));
const files = new Map();

registerCoreEnv({
  rootPath,
  getPlatform: async () => "linux",
  getArch: async () => "x64",
  getEnv: async () => ({}),
  homedir: async () => rootPath,
  fs: {
    readFile: async (p, encoding) => {
      const content = files.get(p);
      if (content == null) throw new Error(`ENOENT: ${p}`);
      if (encoding === "buffer") {
        return typeof content === "string" ? new TextEncoder().encode(content) : content;
      }
      return typeof content === "string" ? content : new TextDecoder().decode(content);
    },
    writeFile: async (p, content) => {
      const text = typeof content === "string" ? content : new TextDecoder().decode(content);
      files.set(p, text);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, text, "utf8");
    },
    mkdir: async (p) => {
      await fs.mkdir(p, { recursive: true });
    },
    exists: async (p) => {
      try {
        await fs.access(p);
        return true;
      } catch {
        return files.has(p);
      }
    },
    readdir: async (p) => {
      try {
        const entries = await fs.readdir(p, { withFileTypes: true });
        return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));
      } catch {
        return [];
      }
    },
    stat: async () => ({ isDirectory: false, isFile: true, size: 0, mtime: new Date() }),
    remove: async () => {},
  },
  runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
  exec: async () => ({ stdout: "", stderr: "", code: 0 }),
  fetch: async () => new Response(),
});

try {
  const first = await writeCompactArchive({
    sessionId: "ses_abc",
    messages,
    cutIndex: 2,
  });
  assert.ok(first);
  assert.equal(first.sequence, 1);
  assert.equal(first.relativePath, `${COMPACT_TRANSCRIPT_ROOT}/ses_abc/compact-1.md`);
  assert.match(await fs.readFile(first.absolutePath, "utf8"), /Investigate login bug/);

  const second = await writeCompactArchive({
    sessionId: "ses_abc",
    messages,
    cutIndex: 2,
  });
  assert.ok(second);
  assert.equal(second.sequence, 2);

  const prevSummary = `## Goal\n\nOld work${formatCompactArchivesSection([first.relativePath])}`;
  const withPointer = await maybeAppendCompactArchive(
    "## Goal\n\nShip it\n\n## Compact archives\n\nLLM should not keep this",
    {
      sessionId: "ses_abc",
      messages,
      cutIndex: 2,
    },
    prevSummary
  );
  assert.match(withPointer, /## Goal/);
  assert.match(withPointer, /## Compact archives/);
  assert.match(withPointer, /compact-1\.md/);
  assert.match(withPointer, /compact-3\.md/);
  assert.equal((withPointer.match(/## Compact archives/g) ?? []).length, 1);
  assert.doesNotMatch(withPointer, /LLM should not keep this/);

  // Empty messages → keep prior paths, no new write
  const priorOnly = await maybeAppendCompactArchive(
    "summary only",
    {
      sessionId: "ses_abc",
      messages: [],
      cutIndex: 0,
    },
    prevSummary
  );
  assert.match(priorOnly, /compact-1\.md/);
  assert.doesNotMatch(priorOnly, /compact-3\.md/);

  const empty = await writeCompactArchive({ sessionId: "ses_abc", messages: [], cutIndex: 0 });
  assert.equal(empty, null);
} finally {
  clearCoreEnv();
  await fs.rm(rootPath, { recursive: true, force: true });
}

console.log("compact-archive validation passed");
