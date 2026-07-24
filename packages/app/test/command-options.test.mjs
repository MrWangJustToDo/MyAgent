import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

const { COMMAND_FREEFORM_VALUE, typedArgsAfterCommand, withFreeformOption } = await import(
  new URL("../dist/index.mjs", import.meta.url).href
);

test("withFreeformOption appends freeform sentinel", () => {
  const opts = withFreeformOption([{ label: "a", value: "a" }]);
  assert.equal(opts.length, 2);
  assert.equal(opts[1].freeform, true);
  assert.equal(opts[1].value, COMMAND_FREEFORM_VALUE);
});

test("typedArgsAfterCommand extracts suffix", () => {
  assert.equal(typedArgsAfterCommand("/theme", "theme"), "");
  assert.equal(typedArgsAfterCommand("/theme ", "theme"), "");
  assert.equal(typedArgsAfterCommand("/theme gemini", "theme"), "gemini");
  assert.equal(typedArgsAfterCommand("/rename  My Title ", "rename"), "My Title");
  assert.equal(typedArgsAfterCommand("/other x", "theme"), "");
});
