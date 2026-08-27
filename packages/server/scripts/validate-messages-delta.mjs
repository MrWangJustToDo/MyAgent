/**
 * Offline validation for the agent-session `messages` delta encoding:
 *
 * - writer invariants (full baselines, sparse patches, coalescing, safety nets)
 * - client merge invariants (applyMessagesPayloadForTests) incl. legacy arrays
 * - round-trip: a realistic StreamProcessor-like event sequence fed through
 *   writer -> merge reproduces the exact final array with far fewer bytes
 *
 * Imports from dist — run `pnpm build` first (the validate script does).
 */
import assert from "node:assert/strict";

const { createMessagesDeltaWriter, PATCH_COALESCE_MS } = await import("../dist/messages-delta.mjs");
const { applyMessagesPayloadForTests } = await import("../dist/remote-session-client.mjs");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal UIMessage-ish factory; only `id` matters to the encoder. */
const msg = (id, text) => ({
  id,
  role: "user",
  parts: [{ type: "text", text: text ?? `hello from ${id}` }],
  createdAt: new Date().toISOString(),
});

/** Collect writer output with per-frame metadata. */
function collect() {
  const frames = [];
  const writer = createMessagesDeltaWriter((payload) => {
    frames.push({ payload, bytes: JSON.stringify(payload).length });
  });
  return { writer, frames };
}

async function main() {
  // --- 1. Baseline: first push is a full payload -------------------------
  {
    const { writer, frames } = collect();
    const a = msg("a");
    writer.push([a]);
    assert.equal(frames.length, 1);
    assert.equal(frames[0].payload.kind, "full");
    assert.deepEqual(frames[0].payload.messages, [a]);

    // Same references again -> identity diff finds nothing -> no frame.
    writer.push([a]);
    assert.equal(frames.length, 1);
  }

  // --- 2. One mutated message -> one sparse patch ------------------------
  {
    const { writer, frames } = collect();
    // Realistic shape: a longer conversation where one message streams.
    const base = Array.from({ length: 12 }, (_, i) => msg(`m${i}`, `content-${i} `.repeat(30)));
    writer.push(base);
    assert.equal(frames[0].payload.kind, "full");

    const streaming = {
      ...base[7],
      parts: [{ type: "text", text: base[7].parts[0].text + "delta" }],
    };
    writer.push([...base.slice(0, 7), streaming, ...base.slice(8)]);
    await sleep(PATCH_COALESCE_MS + 20);
    assert.equal(frames.length, 2, "coalesced into exactly one patch frame");
    const patch = frames[1].payload;
    assert.equal(patch.kind, "patch");
    assert.deepEqual(patch.removed, []);
    assert.equal(patch.upserted.length, 1);
    assert.equal(patch.upserted[0].index, 7);
    assert.equal(patch.upserted[0].message.id, "m7");
    // Per-event cost must be far below the full-array serialization.
    assert.ok(frames[1].bytes < frames[0].bytes / 4, `patch ${frames[1].bytes}B should be ≪ full ${frames[0].bytes}B`);
  }

  // --- 3. Burst of deltas produces one coalesced frame -------------------
  {
    const { writer, frames } = collect();
    const base = [msg("a"), msg("b")];
    writer.push(base);
    frames.length = 0;
    for (let i = 0; i < 5; i += 1) {
      writer.push([base[0], { ...base[1], parts: [{ type: "text", text: `delta ${i}` }] }]);
      await sleep(5);
    }
    await sleep(PATCH_COALESCE_MS + 20);
    assert.equal(frames.length, 1, `expected 1 coalesced frame, got ${frames.length}`);
    assert.equal(frames[0].payload.kind, "patch");
    assert.equal(frames[0].payload.upserted.length, 1, "same id accumulates into a single upsert");
    assert.equal(frames[0].payload.upserted[0].message.parts[0].text, "delta 4");
  }

  // --- 4. Removals travel as patch.removed -------------------------------
  {
    const { writer, frames } = collect();
    const a = msg("a");
    const b = msg("b");
    const c = msg("c");
    writer.push([a, b, c]);
    frames.length = 0;
    writer.push([a, c]); // retained messages keep their refs, only b is gone
    await sleep(PATCH_COALESCE_MS + 20);
    assert.equal(frames.length, 1);
    assert.deepEqual(frames[0].payload.removed, ["b"]);
  }

  // --- 5. Safety net: >50% changed falls back to full ---------------------
  {
    const { writer, frames } = collect();
    writer.push([msg("a"), msg("b"), msg("c")]);
    frames.length = 0;
    writer.push([msg("x"), msg("y")]);
    assert.equal(frames[0].payload.kind, "full", "majority change must resync as full");
  }

  // --- 6. Full flushes immediately and drops pending patches --------------
  {
    const { writer, frames } = collect();
    const a = msg("a");
    const b = msg("b");
    const c = msg("c");
    writer.push([a, b, c]);
    frames.length = 0;
    // Minority change -> coalesced patch goes pending.
    writer.push([a, { ...b, parts: [{ type: "text", text: "pending" }] }, c]);
    // Majority change vs the advanced baseline -> immediate full.
    writer.push([a, msg("x"), msg("y")]);
    assert.equal(frames.length, 1, "full must bypass the coalescing window");
    assert.equal(frames[0].payload.kind, "full");
    assert.equal(frames[0].payload.messages.length, 3);
    await sleep(PATCH_COALESCE_MS + 20);
    assert.equal(frames.length, 1, "pending patch must not flush after a full");
  }

  // --- 7. close() drops pending patches ----------------------------------
  {
    const { writer, frames } = collect();
    const a = msg("a");
    const b = msg("b");
    writer.push([a, b]);
    frames.length = 0;
    writer.push([a, { ...b, parts: [{ type: "text", text: "never sent" }] }]); // pending patch
    writer.close();
    await sleep(PATCH_COALESCE_MS + 20);
    assert.equal(frames.length, 0, "close() must suppress the coalesced flush");
  }

  // --- 8. Client merge: full/patch/legacy/unknown -------------------------
  {
    const current = [];
    const legacy = [msg("a"), msg("b")];
    let merged = applyMessagesPayloadForTests(current, legacy);
    assert.equal(merged.unknownKind, false);
    assert.deepEqual(merged.messages, legacy);

    merged = applyMessagesPayloadForTests(merged.messages, { kind: "full", messages: [msg("a"), msg("b")] });
    assert.ok(merged.messages[0].createdAt instanceof Date, "full revives createdAt");

    const inserted = msg("c");
    merged = applyMessagesPayloadForTests(merged.messages, {
      kind: "patch",
      upserted: [{ index: 2, message: inserted }],
      removed: [],
    });
    assert.equal(merged.messages.length, 3);
    assert.equal(merged.messages[2].id, "c");

    const bUpdated = { ...msg("b"), parts: [{ type: "text", text: "patched" }] };
    merged = applyMessagesPayloadForTests(merged.messages, {
      kind: "patch",
      upserted: [{ index: 1, message: bUpdated }],
      removed: ["a"],
    });
    assert.deepEqual(
      merged.messages.map((m) => [m.id, m.parts[0].text]),
      [
        ["b", "patched"],
        ["c", "hello from c"],
      ]
    );
    assert.ok(merged.messages[0].createdAt instanceof Date, "patch upserts revive createdAt too");

    const unknown = applyMessagesPayloadForTests(merged.messages, { kind: "wat" });
    assert.equal(unknown.unknownKind, true, "unknown envelope must trigger resync");
    assert.equal(unknown.messages, merged.messages, "unknown kind leaves state untouched");
  }

  // --- 9. Round-trip: writer -> merge reproduces the exact final array ----
  {
    // Simulate a streaming turn: initial user messages, assistant message
    // appearing, then N text deltas on it, plus one tool call. Unchanged
    // messages keep their object refs — same as StreamProcessor's immutable
    // updates (that's the exact precondition the identity diff relies on).
    const u1 = msg("u1");
    const u2 = msg("u2");
    let assistant = msg("asst", "");
    const states = [];
    states.push([u1, u2]);
    states.push([u1, u2, assistant]);
    for (let i = 0; i < 50; i += 1) {
      assistant = { ...assistant, parts: [{ type: "text", text: assistant.parts[0].text + "x" }] };
      states.push([u1, u2, assistant]);
    }
    const tool = msg("tool-1");
    states.push([u1, u2, assistant, tool]);

    const { writer, frames } = collect();
    for (const state of states) writer.push(state);
    await sleep(PATCH_COALESCE_MS + 20);

    let messages = [];
    for (const frame of frames) {
      const merged = applyMessagesPayloadForTests(messages, frame.payload);
      assert.equal(merged.unknownKind, false);
      messages = merged.messages;
    }
    assert.equal(messages.length, states.at(-1).length);
    assert.deepEqual(
      messages.map((m) => m.id),
      states.at(-1).map((m) => m.id)
    );
    assert.equal(messages[2].parts[0].text.length, 50, "deltas must merge to the final text");

    const fulls = frames.filter((f) => f.payload.kind === "full").length;
    const patches = frames.filter((f) => f.payload.kind === "patch").length;
    const totalBytes = frames.reduce((sum, f) => sum + f.bytes, 0);
    const naiveBytes = states.reduce((sum, s) => sum + JSON.stringify(s).length, 0);
    assert.equal(fulls, 1, "one baseline full for the whole burst");
    assert.ok(patches >= 1);
    assert.ok(
      totalBytes < naiveBytes / 5,
      `delta frames (${totalBytes}B) should be ≪ naive full resends (${naiveBytes}B)`
    );
    console.log(
      `round-trip: ${states.length} events -> ${fulls} full + ${patches} patch frames, ` +
        `${totalBytes}B vs naive ${naiveBytes}B (${((totalBytes / naiveBytes) * 100).toFixed(1)}%)`
    );
  }

  console.log("validate-messages-delta: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
