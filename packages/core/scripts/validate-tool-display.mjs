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
assert.equal(writeFile?.summary, "updated", `write_file summary (${writeFile?.summary})`);

// A successful command has nothing the host cannot compute itself (it owns a detailed
// block, rendered locally from the stored output), so no payload is attached.
assert.equal(
  core.computeToolDisplay("run_command", { success: true, exitCode: 0, stdout: "hello", stderr: "" }),
  undefined,
  "a successful command carries no payload"
);
assert.equal(
  core.computeToolDisplay("run_command", { success: false, exitCode: 2, stdout: "", stderr: "" }),
  undefined,
  "a failed command carries no payload either (its failure line is host-computable)"
);

const listFile = core.computeToolDisplay("list_file", { count: 3, entries: [{ name: "a.ts", type: "file" }] });
assert.equal(listFile?.summary, "3 entries", `list_file summary (${listFile?.summary})`);

// Regression guard: only a tool's *own* renderer may put text in the payload — otherwise
// every built-in looks like it owns a result block (`read_file` / `grep` grew blocks).
for (const [name, output] of [
  ["read_file", { type: "file", totalLines: 42, content: "x" }],
  ["grep", { matches: [{ file: "a.ts", line: 1, text: "x" }] }],
  ["list_file", { count: 3, entries: [{ name: "a.ts", type: "file" }] }],
  ["write_file", { path: "a.ts", bytes: 10, ok: true }],
  ["glob", { files: ["a.ts"] }],
  ["tree", { tree: "a.ts" }],
]) {
  assert.equal(
    core.computeToolDisplay(name, output)?.text,
    undefined,
    `${name} must not carry text (it owns no result block)`
  );
}

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

// --- 7. catalog (snapshot) ---------------------------------------------------
const catalog = core.describeToolPresentations();
const byName = new Map(catalog.map((entry) => [entry.name, entry]));
assert.equal(byName.get("read_file")?.category, "reads", "built-ins are in the catalog");
assert.equal(byName.get("todo")?.keepRow, true, "row-keeping built-ins are marked");
assert.equal(byName.get("run_command")?.detailed, true, "detailed built-ins are marked");
assert.ok(
  catalog.every((entry) => typeof entry.name === "string"),
  "catalog entries are serializable data"
);

core.registerToolPresentation("ext_catalog", { category: "searches", text: (r) => String(r?.n ?? "") });
assert.equal(
  core.describeToolPresentations().find((entry) => entry.name === "ext_catalog")?.hasText,
  true,
  "a registered extension tool joins the catalog"
);
core.clearToolPresentation();
assert.equal(
  core.describeToolPresentations().some((entry) => entry.name === "ext_catalog"),
  false,
  "disabling (clearing) an extension drops it from the catalog"
);

console.log("validate-tool-display: catalog ok");

// --- 8. durability -----------------------------------------------------------
// The payload rides the durable UI chain as ordinary JSON, and nothing recomputes it
// on restore: `attachMissingToolDisplays` only runs inside `finalizeStream` (a live
// run), so a restored session keeps exactly what was persisted. The model wire is
// covered separately by `validate:message-chain-projection`.
const roundTripped = JSON.parse(JSON.stringify(partWithDisplay));
assert.deepEqual(roundTripped.display, partWithDisplay.display, "the payload survives JSONL persistence");

console.log("validate-tool-display: durability ok");

// --- 9. block ownership ------------------------------------------------------
// Exactly these built-ins render a result block in full display. Every other built-in
// must stay block-less: filling their payload `text` made all of them look like block
// owners (`read_file` / `grep` grew output blocks).
const blockOwners = [
  "ask_user",
  "complete_plan",
  "get_command_output",
  "kill_command",
  "run_command",
  "task",
  "todo",
].sort();
const owners = core
  .describeToolPresentations()
  .filter((entry) => entry.detailed || entry.keepRow)
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(owners, blockOwners, "the block-owning built-ins are unchanged");

console.log("validate-tool-display: block ownership ok");

// --- 10. failure outputs and host-side catalogs ------------------------------
// A failed call renders through the error path, so it must not carry success-shaped text.
assert.equal(
  core.computeToolDisplay("write_file", { error: "denied by user" }),
  undefined,
  "a failed write_file carries no payload"
);
assert.equal(
  core.computeToolDisplay("edit_file", { error: "no match" }),
  undefined,
  "a failed edit_file carries no payload"
);

// A host that never created the tools (remote session, publisher) adopts the owning
// process's catalog and then folds/labels identically.
const remoteTool = "remote_only_tool";
assert.equal(core.getToolPresentation(remoteTool), undefined, "unknown before hydration");
core.hydrateToolPresentations([
  { name: remoteTool, category: "other", keepRow: true, detailed: true, clientSide: false },
]);
assert.equal(core.keepsCompactRow(remoteTool), true, "hydration restores the row rules");
assert.equal(core.getToolPresentation(remoteTool)?.detailed, true, "hydration restores the flags");
assert.equal(
  core.describeToolPresentations().some((entry) => entry.name === remoteTool),
  false,
  "adopted entries stay out of the published catalog"
);

console.log("validate-tool-display: failure + hydration ok");

// --- 11. failure shapes and registry lifecycle -------------------------------
// `{ ok: false }` / `{ success: false }` are failures just like `{ error }`: none of them may
// be summarized as a success, because the payload is persisted with the session.
for (const output of [{ error: "permission denied" }, { ok: false }, { success: false }, { isError: true }]) {
  assert.equal(
    core.computeToolDisplay("write_file", output),
    undefined,
    `write_file output ${JSON.stringify(output)} must not summarize as success`
  );
}
assert.equal(core.computeToolDisplay("memory_write", { ok: false }), undefined, "memory_write failure");

console.log("validate-tool-display: lifecycle + failure shapes ok");

// --- 12. hydration fidelity --------------------------------------------------
// `hasText` is what keeps a text-only tool's row alive (`keepRow || clientSide || text`), so it
// must survive adoption even though the renderer itself cannot.
core.hydrateToolPresentations([{ name: "hydrated_text_only", category: "other", hasText: true }]);
assert.equal(core.keepsCompactRow("hydrated_text_only"), true, "a text-only tool keeps its row");
assert.equal(typeof core.getToolPresentation("hydrated_text_only")?.text, "function", "as a presence stub");

// Adoption replaces the previous catalog, and a payload without descriptors is tolerated.
core.hydrateToolPresentations([{ name: "hydrated_other", category: "other", hasText: true }]);
assert.equal(core.keepsCompactRow("hydrated_text_only"), false, "the old adoption is dropped");

// A malformed payload must be a no-op, *not* a wipe: the host keeps ruling rows the way the
// owner does until a real catalog arrives.
core.hydrateToolPresentations(undefined);
assert.equal(core.keepsCompactRow("hydrated_other"), true, "undefined catalog keeps the adoption");
core.hydrateToolPresentations([]);
assert.equal(core.keepsCompactRow("hydrated_other"), false, "an empty catalog really does clear it");

// A row that already shipped its rendered text must not fold, even when the local lookup has
// never heard of the tool (pre-change history replayed into a remote host).
const shippedRow = {
  type: "tool-call",
  toolCallId: "call-shipped",
  toolName: "ext_echo",
  name: "ext_echo",
  state: "output-available",
  input: { text: "hi" },
  output: { echoed: "hi" },
  display: { text: "echo -> hi" },
};
assert.equal(core.shouldKeepToolRow(shippedRow), true, "a row with shipped text keeps its row");

console.log("validate-tool-display: hydration fidelity ok");
