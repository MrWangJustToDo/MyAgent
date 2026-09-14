/**
 * A remote host must fold, label and keep rows exactly like the process that owns the tools.
 *
 * The owner publishes its catalog on the session snapshot (`toolDescriptors`); the client adopts
 * it, so the host's `keepsCompactRow` / descriptors answer without a local tool registry. This
 * covers the constructor path (an initial snapshot); `doResync` and the
 * `session:tool-presentation` event go through the same `hydrateToolPresentations` call.
 *
 * Run via `pnpm --filter @my-agent/server validate:remote-tool-catalog`.
 */

import assert from "node:assert/strict";

const { RemoteSessionClient } = await import("../dist/remote-session-client.mjs");
const core = await import("@my-agent/core");

const ownerCatalog = [
  { name: "owner_only_tool", category: "read", keepRow: true, hasText: true },
  { name: "owner_command", category: "command", detailed: true, hasText: true },
  // The hard case: nothing but a renderer keeps this row alive (`keepRow || clientSide || text`).
  { name: "owner_text_only", category: "other", hasText: true },
];

assert.equal(core.keepsCompactRow("owner_only_tool"), false, "unknown before the snapshot arrives");

new RemoteSessionClient({
  agentId: "catalog-check",
  baseUrl: "http://127.0.0.1:1",
  fetchImpl: async () => {
    throw new Error("no network in this check");
  },
  initialSnapshot: {
    agentId: "catalog-check",
    messages: [],
    toolDescriptors: ownerCatalog,
  },
});

assert.equal(core.keepsCompactRow("owner_only_tool"), true, "the host adopts the owner's row rule");
assert.equal(core.getToolPresentation("owner_command")?.detailed, true, "and the owner's block ownership");
assert.equal(
  core.keepsCompactRow("owner_text_only"),
  true,
  "a text-only tool keeps its row on the host too (the owner has a renderer for it)"
);
assert.equal(
  core.describeToolPresentations().some((entry) => entry.name === "owner_only_tool"),
  false,
  "adopted entries are never re-published"
);

// A later catalog is the complete set: a tool the owner dropped must stop ruling rows here.
new RemoteSessionClient({
  agentId: "catalog-check",
  baseUrl: "http://127.0.0.1:1",
  fetchImpl: async () => {
    throw new Error("no network in this check");
  },
  initialSnapshot: {
    agentId: "catalog-check",
    messages: [],
    toolDescriptors: [ownerCatalog[1]],
  },
});
assert.equal(
  core.keepsCompactRow("owner_only_tool"),
  false,
  "re-adopting a catalog drops entries the owner no longer publishes"
);
core.hydrateToolPresentations(undefined);
assert.equal(
  core.keepsCompactRow("owner_command"),
  true,
  "a catalog-less payload is a no-op, not a wipe of what this host already adopted"
);

console.log("validate-remote-tool-catalog: ok");
