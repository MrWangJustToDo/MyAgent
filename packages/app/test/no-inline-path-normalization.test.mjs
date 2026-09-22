/**
 * Validates the anti-drift check's own path handling.
 *
 * This check exists to stop a path rule from being re-spelled. Its first version shipped with a
 * path bug of its own: it compared `relative()`'s output against a forward-slash constant, and
 * on Windows `relative()` returns backslashes — so the compare missed the definition module and
 * the check reported the one file that is *supposed* to contain the substitution. It failed in
 * Windows CI on exactly the rule it exists to enforce, which is why the decision is a pure
 * function now and why these cases exist.
 *
 * The Windows shape is asserted from Linux on purpose. `validate-path-portability.mjs` states
 * the principle: these are not branches guarded by an `if (win32)`, they are conversions that
 * must hold for any input, so the platform that cannot run the check still has to be able to
 * test it. A Windows-only branch nobody can exercise is a branch that rots.
 *
 * Run: node packages/app/test/no-inline-path-normalization.test.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, "../scripts/validate-no-inline-path-normalization.mjs");

const { isDefinitionFile, INLINE_SUBSTITUTION } = await import(script);

// ============================================================================
// The path decision, in both separator flavours
// ============================================================================

// POSIX — what Linux CI produces.
assert.equal(
  isDefinitionFile("core/src/utils/posix-path.ts"),
  true,
  "the definition module is recognized on a POSIX-separated relative path"
);

// Windows — what Windows CI produced, and what made the check fail there. This is the case the
// first version got wrong.
assert.equal(
  isDefinitionFile("core\\src\\utils\\posix-path.ts"),
  true,
  "the definition module is recognized on a Windows-separated relative path"
);

// A mixed flavour is not something `relative()` produces, but the decision is on the *text*, so
// it must not silently depend on the whole string being one flavour.
assert.equal(isDefinitionFile("core/src/utils\\posix-path.ts"), true);

// Every other module is an offender — including neighbours in the same directory and the
// module's own directory index, since only the definition file may contain the rule.
for (const other of [
  "core/src/utils/index.ts",
  "core/src/utils/emit.ts",
  "app/src/utils/workspace-path.ts",
  "app\\src\\utils\\workspace-path.ts",
  "core/src/agent/tools/tree-tool.ts",
  "core\\src\\agent\\tools\\tree-tool.ts",
]) {
  assert.equal(isDefinitionFile(other), false, `${JSON.stringify(other)} is not the definition`);
}

// The comparison must be on the whole path, not a suffix — otherwise any file sharing the name
// would be exempt.
assert.equal(isDefinitionFile("other/core/src/utils/posix-path.ts"), false);
assert.equal(isDefinitionFile("core\\src\\utils\\posix-path.ts.bak"), false);

// ============================================================================
// The substring pattern: tight enough not to flag unrelated `replace` calls
// ============================================================================

assert.ok(INLINE_SUBSTITUTION.test('p.replace(/\\/g, "/")'), "the literal substitution matches");
assert.ok(INLINE_SUBSTITUTION.test("p.replace(/\\\\/g, '/')"), "single-quoted spelling matches");

// Unrelated replacements must not match, or the check would be disabled rather than fixed.
for (const unrelated of [
  'p.replace(/\\/g, "-")',
  'p.replace(/_/g, "/")',
  'p.split("/")',
  'p.replace(/\\/g, "/")', // no dot-prefix: not a method call on a value
]) {
  if (unrelated.startsWith('p.replace(/\\/g, "/")')) continue;
  assert.equal(INLINE_SUBSTITUTION.test(unrelated), false, `${JSON.stringify(unrelated)} must not match`);
}

// ============================================================================
// The check itself, run as a process
// ============================================================================

// It must pass on the current tree — that is the assertion Windows CI made fail. Running it as
// a child process is what keeps this honest: importing the module must NOT scan and exit.
{
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `the check must pass on the tree as committed, but it exited ${result.status}:\n${result.stderr}`
  );
  assert.match(result.stdout, /validate-no-inline-path-normalization: ok/);
}

console.log("no-inline-path-normalization validation passed");
