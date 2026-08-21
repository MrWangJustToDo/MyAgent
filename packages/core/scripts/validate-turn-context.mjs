/**
 * Validation for turn-context epoch admission (frozen system + synthetic user messages).
 *
 * Run: pnpm --filter @my-agent/core run validate:turn-context
 */

import assert from "node:assert/strict";

import {
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  buildAutoModePrompt,
  buildDynamicTurnContext,
  buildFrozenSystemPrompt,
  buildSystemPromptWithTurnContext,
  buildTurnContextPayload,
  findCutPoint,
  findLatestTurnContextHash,
  formatTurnContextUserContent,
  hashTurnContextPayload,
  insertTurnContextUIMessage,
  isTurnContextModelMessage,
  isTurnContextUIMessage,
} from "../dist/dev.mjs";

const dynamic = "<current_date>\nJuly 22, 2026\n</current_date>";

const frozen = buildFrozenSystemPrompt({
  config: { systemPrompt: "You are helpful." },
  agentDocContent: "",
});
assert.ok(frozen?.includes("<SYSTEM_PROMPT_DYNAMIC_BOUNDARY>"));

// System stays frozen — dynamic is not appended.
const withDynamic = buildSystemPromptWithTurnContext(frozen, dynamic);
assert.deepEqual(withDynamic, [frozen]);
assert.ok(!withDynamic?.[0]?.includes("<turn_context>"));
assert.deepEqual(buildSystemPromptWithTurnContext(frozen, undefined), [frozen]);
assert.equal(buildSystemPromptWithTurnContext(undefined, dynamic), undefined);

const payload = buildTurnContextPayload(dynamic, "Extra note");
assert.ok(payload?.includes(dynamic));
assert.ok(payload?.includes("Extra note"));

const first = formatTurnContextUserContent(payload, { isUpdate: false });
assert.match(first, /<turn_context>/);
assert.doesNotMatch(first, /authoritative/);

const update = formatTurnContextUserContent(payload, { isUpdate: true });
assert.match(update, /authoritative/);

const hash = hashTurnContextPayload(payload);
assert.equal(hash, hashTurnContextPayload(payload));
assert.notEqual(hash, hashTurnContextPayload(dynamic));

const uiMessages = [
  { id: "u1", role: "user", parts: [{ type: "text", content: "hello" }] },
  { id: "a1", role: "assistant", parts: [{ type: "text", content: "hi" }] },
];
const withTc = insertTurnContextUIMessage(uiMessages, first);
assert.equal(withTc.length, 3);
assert.equal(withTc[1].id.startsWith("tc") || withTc[1].role === "user", true);
assert.ok(isTurnContextUIMessage(withTc[1]));
assert.equal(withTc[0].parts[0].content, "hello");
assert.equal(findLatestTurnContextHash(withTc), hashTurnContextPayload(payload));

// Guard contract (ManagedAgent.admitTurnContextIfNeeded): a turn_context must
// never be admitted before the first real user message — the insert helper skips
// synthetic TC messages when locating the insertion point, so a pre-TC (empty
// channel) admission would land at index 0 and produce a malformed [TC, user…]
// transcript. Callers must skip admission when no real user message exists.
const empty = [];
const onEmpty = insertTurnContextUIMessage(empty, first);
assert.equal(onEmpty.length, 1);
assert.ok(isTurnContextUIMessage(onEmpty[0]), "primitive appends on empty; guard lives in caller");
const onlyTc = [{ id: "tc0", role: "user", parts: [{ type: "text", content: first }] }];
const noRealUser = insertTurnContextUIMessage(onlyTc, update);
assert.equal(noRealUser.length, 2, "no real user msg -> TC goes after the existing TC");
assert.ok(isTurnContextUIMessage(noRealUser[0]));
assert.ok(isTurnContextUIMessage(noRealUser[1]));

// findCutPoint skips synthetic turn_context when counting user turns.
const modelMessages = [
  { role: "user", content: "First" },
  { role: "assistant", content: "A1" },
  { role: "user", content: first },
  { role: "user", content: "Second" },
  { role: "assistant", content: "A2" },
  { role: "user", content: "Third" },
];
assert.ok(isTurnContextModelMessage(modelMessages[2]));
assert.equal(findCutPoint(modelMessages, 2), 3, "skip turn_context; cut on Second");
assert.equal(SYSTEM_PROMPT_DYNAMIC_BOUNDARY.includes("DYNAMIC"), true);

const autoPrompt = buildAutoModePrompt();
assert.match(autoPrompt, /<auto_mode>/);
assert.match(autoPrompt, /\/plan/);

const withAutoOnly = buildDynamicTurnContext({ autoModeContent: autoPrompt, currentDate: "2026-08-07" });
assert.ok(withAutoOnly?.includes("<auto_mode>"));

const planWins = buildDynamicTurnContext({
  planModeContent: "<plan_mode>planning</plan_mode>",
  autoModeContent: autoPrompt,
});
assert.ok(planWins?.includes("<plan_mode>"));
assert.ok(!planWins?.includes("<auto_mode>"), "plan turn-context must win over auto");

console.log("turn-context validation passed");
