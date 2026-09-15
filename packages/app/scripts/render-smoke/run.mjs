/**
 * Headless render smoke for the long-session transcript (MessageList + StaticRender).
 *
 * Replaces the "manual TUI check" step: this environment has no interactive TTY (ink needs
 * raw mode, so `render()` against process.stdout throws headlessly), but ink accepts
 * injected stdin/stdout streams. This script mounts the REAL `MessageList` + `Content`
 * subtree into a fake terminal and asserts what the manual pass was for — the static row
 * set stays capped, the hidden-count marker matches reality and paints once, the row
 * count holds across window slides, and a compact->full switch leaves no residue.
 *
 * Everything is imported from ONE bundle (`scripts/render-smoke/dist`) so the stores and
 * the components that read them share an instance. Importing `src` through a second entry
 * would resolve two copies of each store and produce false failures.
 *
 * Run: pnpm --filter @my-agent/app run validate:render-smoke
 *      node scripts/render-smoke/run.mjs [session.jsonl]
 */

import { render } from "ink";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { Readable } from "node:stream";
import { createElement } from "react";

import { MessageList } from "./dist/components/MessageList.mjs";
import { useAgentStatus } from "./dist/hooks/use-agent-status.mjs";
import { useAgent } from "./dist/hooks/use-agent.mjs";
import { useDynamic } from "./dist/hooks/use-dynamic.mjs";
import { useFlattenCacheCleanup } from "./dist/hooks/use-flatten-cache-cleanup.mjs";
import { useSize } from "./dist/hooks/use-size.mjs";
import { useStatic } from "./dist/hooks/use-static.mjs";
import { useTheme } from "./dist/hooks/use-theme.mjs";
import { useTranscriptDisplay } from "./dist/hooks/use-transcript-display.mjs";
import { useWorkspaceInfo } from "./dist/hooks/use-workspace-info.mjs";
import { Content } from "./dist/layout/Content.mjs";
import { getMessages, countSourceMessages } from "./dist/utils/get-messages.mjs";
import { flattenNamespaceFor, getStaticFlattenSnapshot } from "./dist/utils/message-flat-cache.mjs";

// ── fake terminal ────────────────────────────────────────────────────────────

class FakeStdout extends EventEmitter {
  columns = 120;
  rows = 40;
  isTTY = true;
  chunks = [];
  write(chunk) {
    this.chunks.push(String(chunk));
    return true;
  }
  getColorDepth() {
    return 1;
  }
  get text() {
    return this.chunks.join("");
  }
}

function fakeStdin() {
  const stdin = new Readable({ read() {} });
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  stdin.ref = () => {};
  stdin.unref = () => {};
  return stdin;
}

// ── fixture ──────────────────────────────────────────────────────────────────

/**
 * Builds a long transcript on the shape that matters for this plan: many tool calls per
 * turn (so the static block is long enough to truncate and the window has to slide) plus
 * reasoning/text parts (so rows are not uniformly one line tall).
 *
 * A recorded session can be passed as argv[2] instead — recorded sessions live under the
 * gitignored `.agents/` tree, so the fixture is the default and keeps this check runnable
 * from a clean checkout.
 */
function buildFixture(turns, toolsPerTurn) {
  const messages = [{ id: "msg-user-0", role: "user", parts: [{ type: "text", content: "Start a long task" }] }];
  for (let turn = 1; turn <= turns; turn++) {
    messages.push({
      id: `msg-user-${turn}`,
      role: "user",
      parts: [{ type: "text", content: `Turn ${turn}: keep going` }],
    });
    for (let tool = 0; tool < toolsPerTurn; tool++) {
      messages.push({
        id: `call-${turn}-${tool}`,
        role: "assistant",
        parts: [
          { type: "text", content: `Checking file ${turn}-${tool}` },
          {
            type: "tool-call",
            id: `tool-${turn}-${tool}`,
            name: "read_file",
            state: "complete",
            arguments: JSON.stringify({ path: `packages/app/src/file-${turn}-${tool}.ts` }),
            output: { content: `export const value${turn}${tool} = ${turn * 100 + tool};` },
          },
        ],
      });
    }
    messages.push({
      id: `msg-assistant-${turn}`,
      role: "assistant",
      parts: [{ type: "text", content: `Turn ${turn} done.` }],
    });
    // Injected per turn by core, and often the trailing message when the agent stops after a
    // tool call. Including it makes the fixture exercise the ctx-filtered tail, which is the
    // shape that produced duplicated rows (see the static/dynamic overlap guard below).
    messages.push({
      id: `ctx-git_status-${turn}`,
      role: "user",
      parts: [{ type: "text", content: `<ctx kind="git_status">\nOn branch main\nnothing to commit\n</ctx>` }],
    });
  }
  return messages;
}

function loadSession(path, limit) {
  const messages = [];
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.t === "message" && entry.message) messages.push(entry.message);
    if (limit && messages.length >= limit) break;
  }
  return messages;
}

// ── harness ──────────────────────────────────────────────────────────────────

const sessionPath = process.argv[2] ?? null;
const all = sessionPath ? loadSession(sessionPath, 400) : buildFixture(60, 4);

const Screen = ({ messages }) => {
  // The real app initializes screen size in Agent.tsx (`useSize.getActions().useInitTerminalSize()`).
  // Without it `useSize.state.screenWidth` stays 0 and width-derived paddings go negative.
  useSize.getActions().useInitTerminalSize();
  return createElement("ink-box", { flexDirection: "column" }, [
    createElement(MessageList, { key: "list", messages }),
    createElement(Content, { key: "content" }),
  ]);
};

function mount() {
  const stdout = new FakeStdout();
  const stdin = fakeStdin();
  const instance = render(createElement(Screen, { messages: all }), {
    stdout,
    stdin,
    exitOnCtrlC: false,
    patchConsole: false,
    maxFps: 30,
  });
  return { instance, stdout };
}

/** Strip ANSI colour/cursor sequences from a captured frame.
 *  Built from a char code so the source carries no raw control character. */
const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, "g");

const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/**
 * Visible transcript lines for the current frame.
 *
 * Frames are parsed from the LAST substantial write, not the concatenated stream:
 * a repaint starts with `\x1b[2K\x1b[1A` erase/up sequences and contains no newlines of
 * its own beyond the rows it draws, so slicing at the last erase block yields exactly the
 * lines currently on screen (concatenating instead would count every historical frame).
 */
function frameLines(stdout) {
  const substantial = stdout.chunks.filter((c) => c.length > 20);
  const last = substantial.length ? substantial[substantial.length - 1] : "";
  return last
    .replace(ANSI, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);
}

const results = [];
const record = (name, pass, detail) => results.push({ name, pass, detail });

// React reports duplicate/missing keys through console.error. Capture it so a real
// row-identity regression (the React key remount the window boundary must avoid) fails
// the smoke instead of scrolling past in the terminal.
const consoleErrors = [];
const realConsoleError = console.error;
console.error = (...args) => {
  consoleErrors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
};

// ── 1. mount + no duplication / no crash ────────────────────────────────────

useWorkspaceInfo.getActions().setWorkspaceInfo({ path: "/workspace" });
useTheme.getActions().setTheme("gemini");
useAgentStatus.getActions().setStatus("idle");

const { instance, stdout } = mount();
await settle(250);

const lines = frameLines(stdout);
record("mounts without throwing and paints rows", lines.length > 0, { lineCount: lines.length });
record(
  "no ink render crash in the frame",
  !/Invalid count value|Cannot read propert|is not a function/i.test(lines.join("\n")),
  {
    head: lines.slice(0, 2),
  }
);
record("no React key/identity warnings", !consoleErrors.some((e) => /key|duplicate/i.test(e)), {
  consoleErrors: consoleErrors.slice(0, 3),
});

// Derive the expectation from the same pure function the component uses.
const { staticMessages, dynamicMessages, hiddenSourceMessages } = getMessages(all, {
  mode: useTranscriptDisplay.getState().mode,
  window: 120,
  namespace: "transcript",
});
const MAX_STATIC_PARTS = 100;

// What actually reaches <StaticRender> after the component's own truncation. The marker is
// prepended INSIDE the cached static block (that is where it belongs: it describes the rows
// the block dropped), so the store holds the capped rows plus one marker element.
const staticTruncated = staticMessages.length > MAX_STATIC_PARTS;
const markerExpected =
  hiddenSourceMessages + (staticTruncated ? countSourceMessages(staticMessages.slice(0, -MAX_STATIC_PARTS)) : 0);
const expectedStoreRows = Math.min(MAX_STATIC_PARTS, staticMessages.length) + (markerExpected > 0 ? 1 : 0);
record(
  "static store holds the capped rows plus the in-block marker (no unbounded growth)",
  useStatic.getState().list.length === expectedStoreRows &&
    Math.min(MAX_STATIC_PARTS, staticMessages.length) <= MAX_STATIC_PARTS,
  { storeRows: useStatic.getState().list.length, expectedStoreRows, staticMessages: staticMessages.length }
);
record("dynamic store holds the live rows", useDynamic.getState().list.length === Math.max(1, dynamicMessages.length), {
  storeRows: useDynamic.getState().list.length,
  dynamicMessages: dynamicMessages.length,
});

// ── 2. hidden-count marker: correct value, exactly once, not stale ───────────

// Count in the CURRENT frame only — `stdout.text` concatenates every frame, so the marker
// legitimately appears once per repaint there.
const visibleText = lines.join("\n");
const frameMarkerMatches = [...visibleText.matchAll(/\.\.\. (\d+) older messages? hidden/g)].map((m) => Number(m[1]));
record(
  "hidden marker value equals the component's own hidden total",
  markerExpected === 0 ? frameMarkerMatches.length === 0 : frameMarkerMatches.at(-1) === markerExpected,
  { markerExpected, frameMarkerMatches }
);
record("hidden marker rendered exactly once per frame", frameMarkerMatches.length <= 1, {
  occurrences: frameMarkerMatches.length,
});
// Architectural position: the marker belongs to the cached static block. Asserting it is the
// FIRST store element catches an accidental move back to a sibling element outside the block.
if (markerExpected > 0) {
  const head = useStatic.getState().list[0];
  record("truncation marker is the first element of the static block", Boolean(head?.props?.children), {
    hasHead: Boolean(head),
  });
}

// ── 3. row count stable across window slides (no drift / ghost rows) ─────────

const rowCounts = [];
for (const extra of [1, 2, 4]) {
  const grown = all.concat(
    Array.from({ length: extra }, (_, i) => ({
      id: `synthetic-${extra}-${i}`,
      role: "assistant",
      parts: [{ type: "text", content: `step ${extra}-${i}` }],
    }))
  );
  instance.rerender(createElement(Screen, { messages: grown }));
  await settle(80);
  rowCounts.push(useStatic.getState().list.length);
}
// The cap must keep holding as the window slides: growth here would mean the truncation
// (and therefore the static block) is unbounded, which is the jank this plan removes.
// Allow the one extra element the in-block marker occupies.
const stable = rowCounts.every((n) => n > 0 && n <= MAX_STATIC_PARTS + 1);
record("static row count stays capped as the window slides", stable, { rowCounts });
record("no React key/identity warning after slides", !consoleErrors.some((e) => /key|duplicate/i.test(e)), {
  consoleErrors: consoleErrors.slice(0, 3),
});

// ── 3b. mid-stream appends must not be dropped ─────────────────────────────────
//
// Regression guard: an earlier revision deferred static-block rebuilds until the agent
// reached an idle status edge. That lost rows — a message promoted out of the streaming
// tail belongs to neither the static block (deferred) nor the dynamic block (which holds
// only the newest message), so it rendered nowhere for the whole run. The smoke must
// therefore also drive a NON-idle status; with the gate in place this assertion fails.
{
  useAgentStatus.getActions().setStatus("running");
  const before = useStatic.getState().list.length;

  const streaming = all.concat(
    Array.from({ length: 40 }, (_, i) => ({
      id: `mid-stream-${i}`,
      role: "assistant",
      parts: [{ type: "text", content: `chunk ${i}` }],
    }))
  );
  instance.rerender(createElement(Screen, { messages: streaming }));
  await settle(120);

  const midStreamRows = useStatic.getState().list.length;
  const expectedMidStream = getMessages(streaming, {
    mode: useTranscriptDisplay.getState().mode,
    window: 120,
    namespace: "transcript",
  });
  // Store = capped rows + the in-block marker (when the block is truncated).
  const cappedRows = Math.min(MAX_STATIC_PARTS, expectedMidStream.staticMessages.length);
  const expectedRows = cappedRows + (expectedMidStream.hiddenSourceMessages > 0 ? 1 : 0);

  record(
    "mid-stream appends reach the static block (no dropped rows while running)",
    midStreamRows === expectedRows && midStreamRows >= before,
    { status: useAgentStatus.getState().status, before, midStreamRows, expectedRows }
  );

  // And the status must not be what governs publication: reaching an idle edge afterwards
  // must not be required for the rows to appear.
  useAgentStatus.getActions().setStatus("idle");
}

// ── 3c. static/dynamic split must not overlap ──────────────────────────────────
//
// Regression guard for a reported symptom: rows briefly rendering twice, then healing.
// `getMessages` resolved `lastMessage` against the ctx-filtered array but sliced
// `staticSource` from the pre-filter array, so when a synthetic `<ctx kind=…>` row trailed
// the turn the real last message was sliced away *and* emitted dynamically — it rendered
// twice. Only the trailing row was affected, so the next append healed it.
{
  const turnCtxRow = (id) => ({
    id,
    role: "user",
    parts: [{ type: "text", content: `<ctx kind="git_status">\nOn branch main\n${id}` }],
  });
  const toolTurn = (id, n = 2) => ({
    id,
    role: "assistant",
    parts: Array.from({ length: n }, (_, i) => ({
      type: "tool-call",
      id: `${id}t${i}`,
      name: "read_file",
      state: "complete",
      arguments: JSON.stringify({ path: `${id}-${i}.ts` }),
      output: { ok: true },
    })),
  });

  const cases = Math.max(0, all.length - 60);
  const offenders = [];
  for (let end = cases; end <= all.length; end += 3) {
    const messages = all.slice(0, end);
    const result = getMessages(messages, {
      mode: useTranscriptDisplay.getState().mode,
      window: 120,
      namespace: "transcript",
    });
    // Compare EXACT row ids, never stripped ones: a duplicated message flattens identically
    // in both lists, so the ids match literally. Stripping the part suffix would also
    // collapse distinct source ids that merely end in a number (msg-user-0 vs msg-user-1).
    const staticRowIds = new Set(result.staticMessages.map((m) => m.id));
    const shared = result.dynamicMessages.map((m) => m.id).filter((id) => staticRowIds.has(id));
    if (shared.length) offenders.push({ end, shared: shared.slice(0, 2) });
  }
  record("no message renders in both the static and dynamic lists", offenders.length === 0, {
    stepsChecked: Math.floor((all.length - cases) / 3) + 1,
    offenders: offenders.slice(0, 3),
  });

  // Same invariant with a synthetic ctx row trailing the turn — the exact shape that
  // triggered the original duplication.
  const trailing = [
    { id: "dup-u1", role: "user", parts: [{ type: "text", content: "go" }] },
    toolTurn("dup-a1"),
    turnCtxRow("dup-ctx1"),
  ];
  const trailingResult = getMessages(trailing, { mode: "full", namespace: "dup-guard" });
  const trailingStaticIds = new Set(trailingResult.staticMessages.map((m) => m.id));
  const trailingShared = trailingResult.dynamicMessages.map((m) => m.id).filter((id) => trailingStaticIds.has(id));
  record("trailing ctx row does not duplicate the last message", trailingShared.length === 0, {
    shared: trailingShared,
    dynamicRows: trailingResult.dynamicMessages.map((m) => m.id),
  });
}

// ── 5. per-agent flatten-snapshot namespaces + cleanup on destroy ────────────
//
// Namespaces are agent ids, so two subagent previews no longer evict each other's snapshot
// (the old shared "subagent" namespace did) and a preview can never thrash the main
// transcript. `useFlattenCacheCleanup` releases a destroyed agent's snapshots — everything
// else stays. The reuse guard is message IDENTITY, so this is a memory concern only.
{
  const subagentMessages = buildFixture(4, 2);
  const otherSubagentMessages = buildFixture(3, 5);
  const mainMessages = buildFixture(6, 3);
  const rootId = "ses_root";

  // Populate the three namespaces a live app would hold: main transcript + two previews.
  getMessages(mainMessages, { mode: "full", namespace: flattenNamespaceFor(rootId), window: 120 });
  getMessages(subagentMessages, { mode: "full", namespace: flattenNamespaceFor("sub_a") });
  getMessages(otherSubagentMessages, { mode: "full", namespace: flattenNamespaceFor("sub_b") });

  const held = (agentId) => Boolean(getStaticFlattenSnapshot(flattenNamespaceFor(agentId), "full"));
  record(
    "main transcript and two subagent previews hold snapshots simultaneously",
    held(rootId) && held("sub_a") && held("sub_b"),
    { rootId, sub_a: held("sub_a"), sub_b: held("sub_b") }
  );
  // Distinct SLOTS, not merely non-empty: with one shared namespace every lookup resolves to
  // the same entry (the last writer's), which is the collision this namespacing removed.
  const slots = [rootId, "sub_a", "sub_b"].map((id) => getStaticFlattenSnapshot(flattenNamespaceFor(id), "full"));
  record("each agent holds its own snapshot slot (no shared entry)", new Set(slots).size === 3, {
    distinctSlots: new Set(slots).size,
  });

  // Unchanged input still short-circuits after other namespaces wrote (the isolation point:
  // with one shared namespace a subagent render would have evicted this entry).
  const first = getMessages(subagentMessages, { mode: "full", namespace: flattenNamespaceFor("sub_a") });
  const second = getMessages(subagentMessages, { mode: "full", namespace: flattenNamespaceFor("sub_a") });
  record(
    "a preview keeps its short-circuit after another preview rendered",
    first.staticMessages === second.staticMessages,
    { sameArray: first.staticMessages === second.staticMessages }
  );

  // Drive the real hook through the real store with a fake session whose subscribe matches
  // the core contract: it filters by channel, and `agentId` is the emitting agent.
  const subscribers = [];
  const fakeSession = {
    id: rootId,
    getSnapshot: () => ({ agentId: rootId, messages: [] }),
    subscribe(handler, options) {
      const channels = options?.channels ?? ["messages", "lifecycle"];
      subscribers.push({ handler, channels });
      return () => {
        const i = subscribers.findIndex((s) => s.handler === handler);
        if (i >= 0) subscribers.splice(i, 1);
      };
    },
  };
  const emitLifecycle = (type, agentId, payload) => {
    for (const s of [...subscribers]) {
      if (!s.channels.includes("lifecycle")) continue;
      // Matches the real envelope: channel/ts/agentId/payload, where `payload` carries the
      // event type plus the emitter's own fields (core nests the event payload verbatim).
      s.handler({
        channel: "lifecycle",
        ts: Date.now(),
        agentId,
        payload: { type, ts: Date.now(), agentId, parentId: rootId, payload },
      });
    }
  };

  // Bind the fake session before mounting so the hook subscribes on its first effect.
  useAgent.getActions().setSession(fakeSession);
  const cleanupHarness = render(
    createElement(() => {
      useFlattenCacheCleanup();
      return null;
    }),
    { stdout: new FakeStdout(), stdin: fakeStdin(), exitOnCtrlC: false, patchConsole: false }
  );
  await settle(60);
  const subscribedToLifecycle = subscribers.some((s) => s.channels.includes("lifecycle"));
  record("cleanup hook subscribes to the lifecycle channel", subscribedToLifecycle, {
    subscriberChannels: subscribers.map((s) => s.channels),
  });

  emitLifecycle("subagent:destroyed", "sub_a", { subagentId: "sub_a", parentId: rootId });
  await settle(60);
  record("destroying a subagent releases its snapshots", !held("sub_a"), { sub_a: held("sub_a") });
  record("destroying a subagent leaves the main transcript and other previews intact", held(rootId) && held("sub_b"), {
    rootId: held(rootId),
    sub_b: held("sub_b"),
  });

  // A non-lifecycle / unrelated event must not clear anything.
  emitLifecycle("subagent:created", "sub_c", { subagentId: "sub_c" });
  await settle(40);
  record("an unrelated lifecycle event clears nothing", held(rootId) && held("sub_b"), {
    rootId: held(rootId),
    sub_b: held("sub_b"),
  });

  cleanupHarness.unmount();
  useAgent.getActions().setSession(null);
}

// ── 6. mode switch leaves no residue from the previous mode ──────────────────

useTranscriptDisplay.getActions().setMode("compact");
await settle(120);
const compactLines = frameLines(stdout);
record("mode switch repaints", compactLines.length > 0, { compactLines: compactLines.length });

useTranscriptDisplay.getActions().setMode("full");
await settle(120);
const fullLines = frameLines(stdout);
const fullText = fullLines.join("\n");
record(
  "full-mode repaint after compact switch has no stale summary residue",
  fullLines.length > 0 && !/Summarizing/i.test(fullText),
  { fullLines: fullLines.length }
);
instance.unmount();
console.error = realConsoleError;
const pass = results.every((r) => r.pass);
console.log(
  JSON.stringify({ source: sessionPath ?? "fixture(60 turns x 4 tools)", messages: all.length, results, pass }, null, 2)
);
process.exit(pass ? 0 : 1);
