/**
 * Smoke-test LocalAgentSession snapshot / dispatch / subscribe / child session.
 *
 * Run: pnpm --filter @my-agent/core run validate:local-agent-session
 */
import assert from "node:assert/strict";

import {
  SummaryStreamHub,
  TodoManager,
  UsageTracker,
  createLocalAgentSession,
  sessionForSubagent,
} from "../dist/dev.mjs";

function createFake(id, parentId) {
  const usage = new UsageTracker();
  const todoManager = new TodoManager();
  /** @type {any} */
  const managed = {
    id,
    name: id,
    parentId,
    status: "idle",
    error: "",
    pendingApprovalCount: 0,
    lastStreamDurationMs: 0,
    getRetry: () => null,
    childIds: [],
    usage,
    log: null,
    todoManager,
    summaryStreams: new SummaryStreamHub(),
    mcpManager: null,
    extensionRunner: null,
    planMode: {
      on: () => () => {},
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
    autoModeEnabled: false,
    manager: null,
    ui: undefined,
    chatController: {
      getMessages: () => [],
      getQueuedMessages: () => ({ steer: [], followUp: [] }),
      sendMessage: async () => {},
      steer: () => {},
      followUp: () => {},
      stop: () => {
        managed.status = "aborted";
      },
      clearMessages: () => {
        managed.cleared = true;
      },
      respondToToolApproval: async () => {},
      addToolResult: async () => {},
      on: (_type, listener) => {
        listener({ steer: [], followUp: [] });
        return () => {};
      },
    },
    getL1State() {
      return {
        status: managed.status,
        error: managed.error,
        pendingApprovalCount: managed.pendingApprovalCount,
      };
    },
    getError() {
      return managed.error;
    },
    getPendingApprovalCount() {
      return managed.pendingApprovalCount;
    },
    getLastStreamDurationMs() {
      return managed.lastStreamDurationMs;
    },
    getAgentMode() {
      return managed.autoModeEnabled ? "auto" : "normal";
    },
    getMcpManager() {
      return managed.mcpManager;
    },
    getExtensionCommands() {
      return [];
    },
    on(type, listener) {
      if (type === "change") {
        listener(managed.getL1State());
      }
      return () => {};
    },
    getChatController() {
      return managed.chatController;
    },
    getPlanModeState() {
      return managed.planMode.getState();
    },
    isAutoModeEnabled() {
      return managed.autoModeEnabled;
    },
    setAutoModeEnabled(enabled) {
      managed.autoModeEnabled = enabled;
    },
    setClientToolWaiting() {},
    enablePlanMode() {},
    disablePlanMode() {},
    togglePlanMode() {
      return "planning";
    },
    beginPlanExecution() {
      return { ok: true };
    },
    cancelPlanExecution() {
      return true;
    },
    completePlan() {
      return { ok: true };
    },
    async savePlanToWorkspace(nameHint) {
      return { ok: true, path: `.agents/plans/${nameHint || "plan"}.md` };
    },
    async loadPlanFromWorkspace(name) {
      return { ok: true, path: `.agents/plans/${name}.md`, stepCount: 2 };
    },
    async listWorkspacePlans() {
      return ["alpha.md", "beta.md"];
    },
    async compact(opts) {
      managed.compactFocus = opts?.focus;
      return { ok: true, message: "Compacted: 10 → 5 tokens (50% reduction)", tokensBefore: 10, tokensAfter: 5 };
    },
    getSessionData() {
      return null;
    },
    getSessionStore() {
      return null;
    },
    toggleAutoMode() {
      managed.autoModeEnabled = !managed.autoModeEnabled;
      return managed.autoModeEnabled;
    },
    abort() {
      managed.status = "aborted";
    },
    async restoreSession() {
      return { id: "s1" };
    },
  };
  return managed;
}

const managed = createFake("agent_root");
const session = createLocalAgentSession({ managed, manager: null });
assert.equal(session.id, "agent_root");

const snap = session.getSnapshot();
assert.equal(snap.agentId, "agent_root");
assert.equal(snap.name, "agent_root");
assert.equal(snap.status, "idle");
assert.equal(snap.mode, "normal");
assert.equal(snap.lastStreamDurationMs, 0);
assert.deepEqual(snap.messages, []);
assert.ok(Array.isArray(snap.todos));
assert.equal(snap.plan.phase, "off");
assert.deepEqual(snap.mcp, { servers: [] });
assert.deepEqual(snap.extensions, { extensions: [] });
assert.deepEqual(snap.subagents, []);

const stopResult = await session.dispatch({ type: "stop" });
assert.equal(stopResult.ok, true);
assert.equal(managed.status, "aborted");
managed.status = "idle";

const rename = await session.dispatch({ type: "rename", name: "renamed" });
assert.equal(rename.ok, true);
assert.equal(managed.name, "renamed");
assert.equal(session.getSnapshot().name, "renamed");

const compact = await session.dispatch({ type: "compact", focus: "errors" });
assert.equal(compact.ok, true);
assert.equal(managed.compactFocus, "errors");
assert.match(String(compact.data?.message ?? ""), /Compacted/);

const planList = await session.dispatch({ type: "plan.list" });
assert.equal(planList.ok, true);
assert.deepEqual(planList.data?.files, ["alpha.md", "beta.md"]);

const planSave = await session.dispatch({ type: "plan.save", nameHint: "demo" });
assert.equal(planSave.ok, true);
assert.equal(planSave.data?.path, ".agents/plans/demo.md");

const planComplete = await session.dispatch({ type: "plan.complete" });
assert.equal(planComplete.ok, true);

const mcpRefresh = await session.dispatch({ type: "mcp.refresh" });
assert.equal(mcpRefresh.ok, true);
assert.deepEqual(mcpRefresh.data?.servers, []);

/** @type {string[]} */
const channels = [];
const unsub = session.subscribe((event) => {
  channels.push(event.channel);
});
managed.usage.updateWindowUsage({ inputTokens: 3, outputTokens: 1, totalTokens: 4 });
managed.todoManager.update([{ content: "x", status: "pending", priority: "medium" }], "work");
assert.ok(channels.includes("usage"));
assert.ok(channels.includes("todos"));
unsub();

const child = createFake("agent_child", "agent_root");
const childSession = createLocalAgentSession({ managed: child, manager: null });
const sendDenied = await childSession.dispatch({ type: "send", content: "nope" });
assert.equal(sendDenied.ok, false);
assert.equal(sendDenied.code, "unsupported");
const childStop = await childSession.dispatch({ type: "stop" });
assert.equal(childStop.ok, true);
const childClear = await childSession.dispatch({ type: "clear" });
assert.equal(childClear.ok, true);
assert.equal(child.cleared, true);
const childCompactDenied = await childSession.dispatch({ type: "compact" });
assert.equal(childCompactDenied.ok, false);
assert.equal(childCompactDenied.code, "unsupported");

const manager = {
  getAgent: (id) => (id === child.id ? child : undefined),
  getSubagents: () => [child],
  on: () => () => {},
};
const opened = sessionForSubagent(manager, child.id);
assert.ok(opened);
assert.equal(opened.id, child.id);

const rootWithChildren = createLocalAgentSession({ managed, manager });
const withSubs = rootWithChildren.getSnapshot();
assert.equal(withSubs.subagents.length, 1);
assert.equal(withSubs.subagents[0].id, "agent_child");
assert.ok(withSubs.subagents[0].usage);

console.log("local-agent-session validation passed");
