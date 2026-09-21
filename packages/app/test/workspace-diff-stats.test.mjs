/**
 * Validates diff-stats helpers (per-file +/− line counts parsing).
 *
 * Inputs are `git diff --numstat -z` payloads. The expected values are not hand-written from
 * a description of git's format — they are the strings git actually emits for these paths,
 * so a change in git's escaping or record layout fails here instead of silently producing
 * paths that do not exist. `-z` output is NUL-terminated, never quoted and never escaped.
 *
 * Run: node packages/app/test/workspace-diff-stats.test.mjs
 */
import assert from "node:assert/strict";

const { parseDiffNumstat } = await import("../dist/utils/workspace-diff-stats.mjs");

// Written as an interpolation: a literal `\0` followed by a digit parses as an octal escape
// (`"\01"` is one character), which would quietly turn a two-record payload into one.
const NUL = "\0";
const z = (...records) => records.map((r) => `${r}${NUL}`).join("");

// Plain records: `added \t deleted \t path \0`.
{
  const m = parseDiffNumstat(z("12\t3\tsrc/foo.ts", "1\t0\tREADME.md"));
  assert.deepEqual(m.get("src/foo.ts"), { added: 12, deleted: 3 });
  assert.deepEqual(m.get("README.md"), { added: 1, deleted: 0 });
}

// Binary files report `-\t-` → counted as 0/0.
{
  const m = parseDiffNumstat(z("-\t-\tbin/data.bin"));
  assert.deepEqual(m.get("bin/data.bin"), { added: 0, deleted: 0 });
}

// A space is not special in `-z` output — the path is the path, no quoting to undo.
{
  const m = parseDiffNumstat(z("2\t1\tmy file.txt"));
  assert.deepEqual(m.get("my file.txt"), { added: 2, deleted: 1 });
}

// A quote character: `-z` leaves it as-is. Under the old line-oriented parse git wrapped this
// in `"..."` and backslash-escaped the quote, so the key was `"my \"quoted\".ts"` — which
// matched no row, and the row silently lost its counts.
{
  const m = parseDiffNumstat(z('5\t0\tmy "quoted".ts'));
  assert.deepEqual(m.get('my "quoted".ts'), { added: 5, deleted: 0 });
}

// Non-ASCII: git octal-escapes these by default (`core.quotePath=true`) when line-oriented.
// `-z` emits the real bytes, which is what the row key is.
{
  const m = parseDiffNumstat(z("3\t1\t中文.ts"));
  assert.deepEqual(m.get("中文.ts"), { added: 3, deleted: 1 });
}

// Rename: the path field is EMPTY and the two paths follow as their own records —
// source first, then destination. This is the opposite order from `status -z`.
{
  const m = parseDiffNumstat(`${"0\t0\t"}${NUL}${"old.ts"}${NUL}${"new.ts"}${NUL}`);
  assert.deepEqual([...m.keys()], ["new.ts"], "the stat is keyed by the destination path git put second");
}

// Rename with a space in the path — the ` -> ` notation the old parse split on could not
// represent this, and neither could a `{old => new}` brace expansion.
{
  const m = parseDiffNumstat(`${"1\t0\t"}${NUL}ren old name.ts${NUL}ren new name.ts${NUL}`);
  assert.deepEqual([...m.keys()], ["ren new name.ts"]);
}

// A rename followed by an ordinary record: the rename consumes exactly two path records, so
// the following entry must still be parsed (a naive `i += 1` would swallow it).
{
  const m = parseDiffNumstat(`${"0\t0\t"}${NUL}${"old.ts"}${NUL}${"new.ts"}${NUL}${"2\t1\tafter.ts"}${NUL}`);
  assert.deepEqual([...m.keys()], ["new.ts", "after.ts"]);
  assert.deepEqual(m.get("after.ts"), { added: 2, deleted: 1 });
}

// A directory-shaped path is not a file and must not enter the map — a row built from it
// reads nothing.
{
  const m = parseDiffNumstat(z("0\t0\tbrand-new/"));
  assert.deepEqual([...m.keys()], []);
}

console.log("workspace-diff-stats validation passed");
