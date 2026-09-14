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
  core.describeToolPresentations().some((entry) => entry.name === "owner_only_tool"),
  false,
  "adopted entries are never re-published"
);

console.log("validate-remote-tool-catalog: ok");
