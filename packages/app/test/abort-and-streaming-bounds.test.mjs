/**
 * Validates that a tool call cut short by an abort is visible as cancelled, and that the
 * app's streaming buffers cannot grow without bound across command calls.
 *
 * Run: node --test test/abort-and-streaming-bounds.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// getInlineSummary resolves through CoreEnv-independent code, but the module graph does
// not, so register a stub as the other app tests do.
const { registerCoreEnv } = await import(new URL("../../core/dist/index.mjs", import.meta.url).href);
registerCoreEnv({ rootPath: "/repo" });

const { getInlineSummary } = await import("@codent/core");

const part = (name, output) => ({
  type: "tool-call",
  id: "call-1",
  name,
  state: "complete",
  arguments: "{}",
  output,
});

// ============================================================================
// Aborted tool calls are rendered as cancelled — for EVERY tool, not just `task`
//
// Driven through the REAL cancel path: an in-flight tool-call part is passed through
// `cancelInFlightToolCalls` / `cancelIncompleteToolCalls`, and the resulting part is fed
// to `getInlineSummary`. (Hand-writing `{ cancelled: true }` here would have hidden the
// actual defect: the cancel marker lived only on the appended `tool-result` part, never
// on the part output the UI reads, so the renderer saw no flag at all.)
// ============================================================================
{
  const { cancelInFlightToolCalls, cancelIncompleteToolCalls } = await import("../../core/dist/dev.mjs");

  const inFlight = (name) => [
    {
      id: `m-${name}`,
      role: "assistant",
      parts: [{ type: "tool-call", id: `call-${name}`, name, state: "input-complete", arguments: '{"path":"a.ts"}' }],
    },
  ];
  const truncated = (name) => [
    {
      id: `m-${name}`,
      role: "assistant",
      parts: [{ type: "tool-call", id: `call-${name}`, name, state: "input-streaming", arguments: '{"pa' }],
    },
  ];

  const names = ["run_command", "grep", "read_file", "glob", "list_file", "tree", "webfetch", "write_file"];
  for (const name of names) {
    for (const [cancel, build] of [
      [cancelInFlightToolCalls, inFlight],
      [cancelIncompleteToolCalls, truncated],
    ]) {
      const cancelledPart = cancel(build(name), "Cancelled by user.")[0].parts[0];
      assert.equal(
        getInlineSummary(cancelledPart, name),
        "cancelled",
        `${name}: a call cut short by an abort must read as cancelled, not as a clean finish`
      );
    }
  }

  // The per-tool summaries still win once the flag is absent — the generic check must
  // not swallow ordinary outputs.
  assert.equal(getInlineSummary(part("grep", { matches: [1, 2] }), "grep"), "2 matches");
  assert.equal(getInlineSummary(part("read_file", { totalLines: 7 }), "read_file"), "7 lines");
  assert.equal(getInlineSummary(part("write_file", { created: true }), "write_file"), "created");
  // ...including a genuine failure, which shares the same shape but is NOT a cancel.
  const failedPart = { ...part("grep", { success: false, error: "boom" }) };
  assert.equal(getInlineSummary(failedPart, "grep"), null, "a real failure is not mislabelled as cancelled");
}

// ============================================================================
// The streaming retention is bounded, and a finished call is released
//
// Two independent holes behind the command-tool OOM:
//   - the per-call buffer/store held the FULL output of every command, and
//   - nothing released an entry when the call ended (`tool:clear` is emitted by nobody
//     at runtime, and the app only subscribed to the `tool` channel).
// Measured before: 1000 calls, 1000 ids still retained.
// ============================================================================
{
  const app = readFileSync(new URL("../src/utils/streaming-ingest.ts", import.meta.url), "utf8");

  // A retention cap exists and is actually applied to both streams.
  const cap = app.match(/const MAX_RETAINED_CHARS = ([\d_ *]+);/);
  assert.ok(cap, "the ingest buffer must declare a retention cap");
  const capValue = cap[1]
    .replace(/_/g, "")
    .split("*")
    .reduce((a, b) => a * Number(b.trim()), 1);
  assert.ok(capValue > 0 && capValue <= 1024 * 1024, `cap must be small enough to bound growth, got ${capValue}`);
  assert.equal(
    (app.match(/tailOf\(/g) || []).length >= 3,
    true,
    "both stdout and stderr appends must go through the tail helper (declaration + 2 uses)"
  );
  assert.ok(
    !/buffer\.stdout \+= chunk/.test(app) && !/buffer\.stderr \+= chunk/.test(app),
    "no raw `+= chunk` append may bypass the cap"
  );

  // A settle-time release exists and is exported for the subscription to call.
  assert.ok(/export function releaseFinishedTool\(/.test(app), "a finished-call release must be exported");
  for (const key of ["buffers.delete", "throttleMsByToolCallId.delete"]) {
    assert.ok(app.includes(key), `release must drop ${key} (not just the store entry)`);
  }
}

// ============================================================================
// The session event → buffer mapping is behavioural (not a source-text match)
//
// A subscription can only be exercised against a live session, and a text assertion
// cannot tell an unconditional release from a dead one (`if (id && false) release(id)`
// matches the text of the working version). So the mapping is a pure function; driving
// it and observing real buffer state is what pins the OOM fix.
// ============================================================================
{
  const { classifyStreamEvent, applyStreamEventAction, ingestStreamingChunk, getStreamingStoreOutput } =
    await import("../dist/utils/streaming-ingest.mjs");

  const chunkEvent = (toolCallId, chunk) => ({
    channel: "tool",
    payload: { kind: "chunk", chunk: { toolCallId, type: "stdout", chunk } },
  });
  const endEvent = (toolCallId) => ({
    channel: "lifecycle",
    payload: { type: "agent:tool-end", payload: { tool_call_id: toolCallId } },
  });

  // A tool call streams its output...
  applyStreamEventAction(classifyStreamEvent(chunkEvent("c1", "hello ")));
  applyStreamEventAction(classifyStreamEvent(chunkEvent("c1", "world")));
  assert.equal(getStreamingStoreOutput("c1")?.stdout, "hello world", "chunks must reach the store");

  // ...the end event MARKs it (and must NOT release yet)...
  const end = classifyStreamEvent(endEvent("c1"));
  assert.deepEqual(end, { kind: "tool-end", toolCallId: "c1" }, "agent:tool-end must mark the call");
  applyStreamEventAction(end);
  assert.equal(
    getStreamingStoreOutput("c1")?.stdout,
    "hello world",
    "the end event must NOT release: its result is not on the channel yet, so the row " +
      "would blank for a frame while StreamingOutputView is still mounted (the flash)"
  );

  // ...and the RESULT frame releases it.
  const release = classifyStreamEvent({
    channel: "messages",
    payload: [{ role: "assistant", parts: [{ type: "tool-call", id: "c1", state: "complete", output: { ok: 1 } }] }],
  });
  assert.deepEqual(release, { kind: "release", toolCallId: "c1" }, "the result frame must release the call");
  applyStreamEventAction(release);
  assert.equal(getStreamingStoreOutput("c1"), undefined, "a finished call must be released (this is the OOM fix)");

  // A call that errored settles the same way and must release too.
  ingestStreamingChunk("c2", "stdout", "partial");
  applyStreamEventAction(
    classifyStreamEvent({
      channel: "lifecycle",
      payload: { type: "agent:tool-error", payload: { tool_call_id: "c2" } },
    })
  );
  assert.equal(getStreamingStoreOutput("c2")?.stdout, "partial", "an errored call holds until its result frame");
  applyStreamEventAction(
    classifyStreamEvent({
      channel: "messages",
      payload: [{ parts: [{ type: "tool-call", id: "c2", state: "error", output: { error: "boom" } }] }],
    })
  );
  assert.equal(getStreamingStoreOutput("c2"), undefined, "an errored call must be released too");

  // Events that must NOT release: an unrelated lifecycle event, and a message frame whose
  // matching part has not settled yet.
  ingestStreamingChunk("c5", "stdout", "live");
  assert.equal(
    classifyStreamEvent({ channel: "lifecycle", payload: { type: "agent:tool-start", payload: {} } }),
    null,
    "other lifecycle events must not touch the buffers"
  );
  applyStreamEventAction(classifyStreamEvent(endEvent("c5")));
  assert.equal(
    classifyStreamEvent({
      channel: "messages",
      payload: [{ parts: [{ type: "tool-call", id: "c5", state: "input-complete" }] }],
    }),
    null,
    "a still-executing part must hold its buffer (releasing here is what flashed the row)"
  );
  assert.equal(getStreamingStoreOutput("c5")?.stdout, "live", "so the buffer is still there");
  // A frame about some OTHER tool must not release this one.
  assert.equal(
    classifyStreamEvent({
      channel: "messages",
      payload: [{ parts: [{ type: "tool-call", id: "other", state: "complete", output: {} }] }],
    }),
    null,
    "an unrelated tool's result must not release a pending call"
  );
  applyStreamEventAction(
    classifyStreamEvent({
      channel: "messages",
      payload: [{ parts: [{ type: "tool-call", id: "c5", state: "complete", output: { done: true } }] }],
    })
  );
  assert.equal(getStreamingStoreOutput("c5"), undefined, "and it releases when its own result lands");

  // A `tool:clear` frame (the retry path) still clears immediately.
  ingestStreamingChunk("c3", "stdout", "stale");
  applyStreamEventAction(classifyStreamEvent({ channel: "tool", payload: { toolCallId: "c3" } }));
  assert.equal(getStreamingStoreOutput("c3"), undefined, "a tool:clear frame must still clear");

  // The retention cap is separate and applies to both streams independently.
  ingestStreamingChunk("c4", "stdout", "x".repeat(200_000));
  ingestStreamingChunk("c4", "stderr", "y".repeat(200_000));
  const big = getStreamingStoreOutput("c4");
  assert.ok(big.stdout.length <= 65_536, `stdout must be capped, got ${big.stdout.length}`);
  assert.ok(big.stderr.length <= 65_536, `stderr must be capped, got ${big.stderr.length}`);
}

// ============================================================================
// The subscription must subscribe to a channel that carries the call's end
// ============================================================================
{
  const hook = readFileSync(new URL("../src/hooks/use-streaming-output.ts", import.meta.url), "utf8");
  // Strip comments first: a commented-out call must not satisfy a text assertion — it did
  // (mutation `// if (action) applyStreamEventAction(action);` passed) until this existed.
  const code = hook.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(
    /channels: \["tool", "lifecycle", "messages"\]/.test(code),
    "the hook must subscribe to `lifecycle` (ends) AND `messages` (results) — releasing needs both"
  );
  assert.ok(/applyStreamEventAction\(action\)/.test(code), "and must route every event through the tested mapping");
}

// ============================================================================
// The seam the fix depends on: the end-of-call events really do project here
//
// `classifyStreamEvent` only sees `lifecycle` events if the bus routes them there.
// If someone re-routes `agent:tool-end` off the `lifecycle` channel, the release stops
// firing and the leak returns — silently. Assert the routing itself.
// ============================================================================
{
  // `classifyStreamEvent` only sees `lifecycle` events if the bus routes them there.
  // If someone re-routes `agent:tool-end` off the `lifecycle` channel, the release stops
  // firing and the leak returns — silently. Assert the routing itself.
  const { AGENT_EVENT_META } = await import("../../core/dist/dev.mjs");
  for (const name of ["agent:tool-end", "agent:tool-error"]) {
    assert.equal(
      AGENT_EVENT_META[name]?.channel,
      "lifecycle",
      `${name} must project onto the lifecycle channel — that is what the release listens to`
    );
  }
  // And the payload carries the call id the release is keyed by.
  const { DEFAULT_AGENT_SESSION_CHANNELS } = await import("@codent/core");
  assert.ok(
    DEFAULT_AGENT_SESSION_CHANNELS.includes("lifecycle"),
    "lifecycle must be a default channel, or a host that omits it would leak again"
  );
}

console.log("abort-and-streaming-bounds validation passed");
