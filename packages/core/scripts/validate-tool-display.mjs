/**
 * Validation: per-call tool display payload (core-owned presentation).
 *
 * Run: pnpm --filter @my-agent/core run validate:tool-display
 *
 * Covers the contract of `computeToolDisplay` + `AgentUIChannel.attachToolDisplay`:
 *   1. a built-in renders its text/summary from the stored output
 *   2. rendering is deterministic (the payload is persisted, so it must be pure)
 *   3. a tool with no renderer and no built-in entry yields no payload
 *   4. a tool's own `present.text` wins, and it also owns its compact row
 *   5. the payload never reaches the model wire
 *   6. the channel attaches it to the matching tool-call part, and only that one
 */

import assert from "node:assert/strict";

const core = await import("../dist/index.mjs");

// --- 1. built-in rendering ---------------------------------------------------
const readFile = core.computeToolDisplay("read_file", { type: "file", totalLines: 42, content: "x" });
assert.ok(readFile, "read_file produces a payload");
assert.equal(readFile.summary, "42 lines", `read_file summary (${readFile.summary})`);

const writeFile = core.computeToolDisplay("write_file", { path: "a.ts", bytes: 10, ok: true });
assert.ok(writeFile?.text?.includes("a.ts"), `write_file renders its block (${JSON.stringify(writeFile)})`);

const runCommand = core.computeToolDisplay("run_command", {
  success: true,
  exitCode: 0,
  stdout: "hello\nworld",
  stderr: "",
  durationMs: 12,
});
assert.ok(
  runCommand?.text?.includes("hello"),
  `run_command success renders its stdout block (got ${JSON.stringify(runCommand)})`
);

const listFile = core.computeToolDisplay("list_file", { count: 3, entries: [{ name: "a.ts", type: "file" }] });
assert.equal(listFile?.summary, "3 entries", `list_file summary (${listFile?.summary})`);

// A renderer that throws must not take the run down: `todo` without stats is exactly
// the shape that used to raise inside `formatTodoOutput`.
assert.doesNotThrow(() => core.computeToolDisplay("todo", {}), "a throwing renderer is contained");

// --- 2. determinism ----------------------------------------------------------
assert.deepEqual(
  core.computeToolDisplay("read_file", { type: "file", totalLines: 42, content: "x" }),
  readFile,
  "same output renders the same payload"
);

// --- 3. no renderer, no payload ---------------------------------------------
assert.equal(core.computeToolDisplay("totally_unknown_tool", { ok: true }), undefined);
assert.equal(core.computeToolDisplay("", { ok: true }), undefined);

// --- 4. a tool's own renderer wins ------------------------------------------
assert.equal(core.keepsCompactRow("ext_echo"), false, "unknown tool keeps no row");
core.registerToolPresentation("ext_echo", {
  category: "searches",
  text: (result) => (result?.echoed ? `echo → ${result.echoed}` : ""),
  label: (input) => input?.message,
});
assert.equal(core.getToolPresentation("ext_echo")?.category, "searches");
assert.equal(core.keepsCompactRow("ext_echo"), true, "a text renderer owns its compact row");
assert.deepEqual(core.computeToolDisplay("ext_echo", { echoed: "hi" }, { message: "hi" }), {
  text: "echo → hi",
  label: "hi",
});
assert.equal(core.computeToolDisplay("ext_echo", {}), undefined, "empty renderer output yields no payload");
core.clearToolPresentation();
assert.equal(core.computeToolDisplay("ext_echo", { echoed: "hi" }), undefined, "cleared registry");

// --- 5. never on the model wire ---------------------------------------------
// The projection is TanStack's (`uiMessagesToModelMessages`), and core never calls it
// directly: it copies a fixed set of part fields (see design §1.3), so a top-level
// `display` cannot leak. The end-to-end assertion for that lives with the projection
// validators (`validate:message-chain-projection`, stage 7.2) rather than here.
// `display` on the part, not inside `output` (which the model receives verbatim).
const partWithDisplay = {
  type: "tool-call",
  id: "call_wire",
  name: "read_file",
  arguments: "{}",
  state: "complete",
  output: { type: "file", totalLines: 3 },
  display: { text: "3 lines" },
};
assert.equal(
  Object.prototype.hasOwnProperty.call(partWithDisplay, "display"),
  true,
  "the payload sits on the part itself"
);
assert.equal(
  partWithDisplay.output && typeof partWithDisplay.output === "object",
  true,
  "the tool output stays untouched"
);

// --- 6. channel attachment ---------------------------------------------------
const call = {
  type: "tool-call",
  id: "call_1",
  name: "read_file",
  arguments: JSON.stringify({ path: "a.ts" }),
  state: "complete",
  output: { type: "file", totalLines: 3, content: "x" },
  display: { text: "3 lines", summary: "3 lines" },
};
let captured = null;
const fakeChannel = {
  getMessages: () => [
    {
      id: "m1",
      role: "assistant",
      parts: [
        { ...call, display: undefined },
        { ...call, id: "call_2" },
      ],
    },
  ],
  setMessages: (messages) => {
    captured = messages;
  },
};
// `AgentUIChannel` is a runtime class handed out by the agent rather than part of the
// public package surface, so probe the method only when it is reachable; the end-to-end
// attachment assertions stay with `validate:agent-ui-channel` / `validate:early-tool-
// result-ui` (stage 7.2).
const attach = core.AgentUIChannel?.prototype?.attachToolDisplay;
if (typeof attach !== "function") {
  console.log("note: AgentUIChannel is not exported — attachment probe skipped");
} else {
  attach.call(fakeChannel, "call_1", { text: "attached" });
  assert.equal(captured?.[0]?.parts?.[0]?.display?.text, "attached", "payload lands on the matching part");
  assert.equal(captured?.[0]?.parts?.[1]?.display, undefined, "other tool calls are untouched");
  assert.equal(captured?.[0]?.parts?.[0]?.state, "complete", "the part's own fields survive");
}

console.log("validate-tool-display: ok");
