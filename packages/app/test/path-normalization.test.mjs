/**
 * Validates the shared path rule.
 *
 * `\` -> `/` used to be spelled at seventeen call sites. Two of them had already wrapped it in
 * a private helper and two more cited the others in comments, which is how a convention drifts:
 * the next consumer copies the neighbour rather than importing, and a comment is not a compile
 * error. The rule now lives in one place and a validator rejects new inline copies.
 *
 * These cases pin the rule's own edges, including the ones a caller could get wrong by composing
 * differently — notably that the key form trims only a *trailing* separator.
 *
 * Run: node packages/app/test/path-normalization.test.mjs
 */
import assert from "node:assert/strict";

const { toPosixPath, toPosixPathKey } = await import("../../core/dist/index.mjs");

// ============================================================================
// toPosixPath — the rule, and nothing else
// ============================================================================

assert.equal(toPosixPath("src\\utils\\a.ts"), "src/utils/a.ts", "backslashes become forward slashes");
assert.equal(toPosixPath("src/utils/a.ts"), "src/utils/a.ts", "an already-POSIX path is unchanged");
assert.equal(toPosixPath("C:\\repo\\src\\a.ts"), "C:/repo/src/a.ts", "a drive path keeps its drive letter");
assert.equal(toPosixPath(""), "");

// Only separators. A caller must not silently gain resolution or root handling it did not have.
assert.equal(toPosixPath("src\\..\\other\\a.ts"), "src/../other/a.ts", "`..` is not resolved");
assert.equal(toPosixPath("src/utils/"), "src/utils/", "a trailing separator is not stripped");
assert.equal(toPosixPath("\\\\server\\share\\a.ts"), "//server/share/a.ts", "a UNC prefix is just separators");

// A backslash is a legal filename byte on POSIX, so the rule is a literal one rather than
// anything delegating to a host path implementation — which is the whole reason it is shared
// instead of being `CoreEnv.path.normalize`.
assert.equal(toPosixPath("weird\\name.ts"), "weird/name.ts", "conversion is unconditional, not platform-gated");

// ============================================================================
// toPosixPathKey — the rule composed with a trailing trim
// ============================================================================

assert.equal(toPosixPathKey("C:\\repo\\"), "C:/repo", "the composed form normalizes and trims");
assert.equal(toPosixPathKey("/repo/"), "/repo");
assert.equal(toPosixPathKey("/repo///"), "/repo", "every trailing separator is removed");
assert.equal(toPosixPathKey(""), "", "the empty path stays empty rather than becoming a separator");

// The important edge: only a TRAILING separator is a trailing separator. A caller expecting a
// key form must not lose an interior empty segment, because `a//b` and `a/b` are different
// strings and comparing them as one would silently match unrelated paths.
assert.equal(toPosixPathKey("a//b"), "a//b", "an interior empty segment is not trimmed");
assert.equal(toPosixPathKey("a/b/"), "a/b");

// `/` normalizes to `""` — documented so a caller passing a bare root does not get an
// unexpected empty string for what it thought was a path.
assert.equal(toPosixPathKey("/"), "");

// ============================================================================
// The two forms agree on everything except the trim
// ============================================================================

for (const p of ["a\\b", "a/b/", "C:\\repo", "/repo///", "", "a//b"]) {
  const expected = toPosixPath(p).replace(/\/+$/, "");
  assert.equal(
    toPosixPathKey(p),
    expected,
    `composed form matches the rule applied then trimmed: ${JSON.stringify(p)}`
  );
}

console.log("path-normalization validation passed");
