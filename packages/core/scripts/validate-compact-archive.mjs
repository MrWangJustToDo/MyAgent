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
  formatCompactArchivePointer,
  maybeAppendCompactArchive,
  parseCompactSequence,
  registerCoreEnv,
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

const pointer = formatCompactArchivePointer(".agents/transcripts/ses_test/compact-1.md");
assert.match(pointer, /## Compact archive/);
assert.match(pointer, /\.agents\/transcripts\/ses_test\/compact-1\.md/);
assert.match(pointer, /search this archive with grep/);
assert.match(pointer, /Do not read the whole file/);

const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "compact-archive-"));
const files = new Map();

registerCoreEnv({
  rootPath,
  getPlatform: async () => "linux",
  getArch: async () => "x64",
  getEnv: async () => ({}),
  homedir: async () => rootPath,
  fs: {
    readFile: async (p) => {
      const content = files.get(p);
      if (content == null) throw new Error(`ENOENT: ${p}`);
      return content;
    },
    writeFile: async (p, content) => {
      files.set(p, content);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, content, "utf8");
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

  const withPointer = await maybeAppendCompactArchive("## Goal\n\nShip it", {
    sessionId: "ses_abc",
    messages,
    cutIndex: 2,
  });
  assert.match(withPointer, /## Goal/);
  assert.match(withPointer, /## Compact archive/);
  assert.match(withPointer, /compact-3\.md/);

  // Empty messages → no archive / no pointer
  const empty = await writeCompactArchive({ sessionId: "ses_abc", messages: [], cutIndex: 0 });
  assert.equal(empty, null);
  const unchanged = await maybeAppendCompactArchive("summary only", {
    sessionId: "ses_abc",
    messages: [],
    cutIndex: 0,
  });
  assert.equal(unchanged, "summary only");
} finally {
  clearCoreEnv();
  await fs.rm(rootPath, { recursive: true, force: true });
}

console.log("compact-archive validation passed");
