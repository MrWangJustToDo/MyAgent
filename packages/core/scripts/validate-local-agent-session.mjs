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
    childIds: [],
    usage,
    log: null,
    todoManager,
    summaryStreams: new SummaryStreamHub(),
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
      clearMessages: () => {},
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
assert.equal(snap.status, "idle");
assert.deepEqual(snap.messages, []);
assert.ok(Array.isArray(snap.todos));
assert.equal(snap.plan.phase, "off");

const stopResult = await session.dispatch({ type: "stop" });
assert.equal(stopResult.ok, true);
assert.equal(managed.status, "aborted");

const rename = await session.dispatch({ type: "rename", name: "renamed" });
assert.equal(rename.ok, true);
assert.equal(managed.name, "renamed");

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

const manager = {
  getAgent: (id) => (id === child.id ? child : undefined),
  getSubagents: () => [child],
  on: () => () => {},
};
const opened = sessionForSubagent(manager, child.id);
assert.ok(opened);
assert.equal(opened.id, child.id);

console.log("local-agent-session validation passed");
