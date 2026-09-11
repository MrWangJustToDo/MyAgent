/**
 * Validation for the `extension-ui` session channel end-to-end (core → session).
 *
 * Covers:
 * - `ctx.ui.notify(message, level)` reaches the channel as `{ type: "notify", message, level }`
 *   (the exact shape the host bridge switches on — a mismatched shape is silently dropped)
 * - `ctx.ui.render(surface, key, payload)` reaches the channel as a `render` event
 * - a late subscriber replays retained slots
 * - disabling the extension clears its slot through the channel
 *
 * Run: pnpm --filter @my-agent/core run validate:extension-ui-channel
 */

import assert from "node:assert/strict";

import { ExtensionRunner, createAgentEventBus, createLocalAgentSession } from "../dist/dev.mjs";

// --- Minimal managed-agent stub: only what `subscribe` / `getEventBus` touch ---
const bus = createAgentEventBus("agent-1");
const runner = new ExtensionRunner({ getEnvVar: () => undefined, eventBus: bus, cwd: "/workspace" });

const managed = {
  id: "agent-1",
  parentId: undefined,
  name: "agent-1",
  getEventBus: () => bus,
  extensionRunner: runner,
  log: null,
  status: "idle",
  error: "",
  pendingApprovalCount: 0,
  childIds: [],
  chatController: { getMessages: () => [], getQueuedMessages: () => ({ steer: [], followUp: [] }) },
  planMode: {
    getState: () => ({
      phase: "off",
      planMarkdown: null,
      steps: [],
      enabledAt: null,
      todosSeeded: false,
      preservedExistingTodos: false,
      planFilePath: null,
    }),
  },
  isAutoModeEnabled: () => false,
  getL1State: () => ({ status: "idle", name: "agent-1", error: "", pendingApprovalCount: 0 }),
  readInteractions: () => ({ approvals: [], askUser: [] }),
  readIteration: () => ({ current: 0, max: 0 }),
  getLastStreamDurationMs: () => 0,
  getAgentMode: () => "normal",
  usage: { snapshot: () => null },
  todoManager: { snapshot: () => ({ items: [], title: null }) },
  mcpManager: null,
};

const session = createLocalAgentSession({ managed });

const events = [];
session.subscribe(
  (event) => {
    if (event.channel === "extension-ui") events.push(event.payload);
  },
  { channels: ["extension-ui"] }
);

await runner.loadExtension({
  id: "probe",
  name: "probe",
  version: "1.0.0",
  activate(ctx) {
    ctx.ui.notify("LSP: typescript ready", "success");
    ctx.ui.render("footer", "k", "v");
  },
});
await new Promise((resolve) => setTimeout(resolve, 60));

// 1. Live delivery: the notify payload shape must match the host bridge exactly.
assert.deepEqual(
  events.find((e) => e.type === "notify"),
  { type: "notify", message: "LSP: typescript ready", level: "success" },
  "notify reaches the extension-ui channel with { type, message, level }"
);
assert.deepEqual(
  events.find((e) => e.type === "render"),
  { type: "render", surface: "footer", key: "k", payload: "v" },
  "render reaches the extension-ui channel"
);

// 2. Late subscriber: retained slots are replayed per subscription.
const replayed = [];
session.subscribe(
  (event) => {
    if (event.channel === "extension-ui") replayed.push(event.payload);
  },
  { channels: ["extension-ui"] }
);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.ok(
  replayed.some((e) => e.type === "render" && e.key === "k" && e.payload === "v"),
  "late subscriber replays retained render slots"
);

// 3. Owner teardown travels the channel as a null payload (remove signal).
await runner.setEnabled("probe", false);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.deepEqual(
  events.at(-1),
  { type: "render", surface: "footer", key: "k", payload: null },
  "disable clears the slot"
);

console.log("extension-ui-channel validation passed");
