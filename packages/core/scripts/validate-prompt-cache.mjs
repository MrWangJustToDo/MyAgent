/**
 * Validation for prompt-cache helpers (Anthropic breakpoints + OpenAI key + tool sort).
 *
 * Run: pnpm --filter @my-agent/core run validate:prompt-cache
 */

import assert from "node:assert/strict";

import {
  ANTHROPIC_CACHE_BREAKPOINT_CAP,
  EPHEMERAL_CACHE_CONTROL,
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  applyAnthropicLatestUserCacheBreakpoint,
  applyAnthropicToolCacheBreakpoint,
  buildAnthropicCachedSystemPrompts,
  buildFrozenSystemPrompt,
  buildSystemPromptWithTurnContext,
  resolvePromptCacheKey,
  shouldApplyAnthropicCacheBreakpoints,
  shouldApplyOpenAIPromptCacheKey,
  sortToolsByName,
  splitSystemPromptAtDynamicBoundary,
  toolsToArray,
} from "../dist/dev.mjs";

assert.equal(ANTHROPIC_CACHE_BREAKPOINT_CAP, 4);
assert.deepEqual(EPHEMERAL_CACHE_CONTROL, { type: "ephemeral" });

assert.equal(shouldApplyAnthropicCacheBreakpoints("anthropic"), true);
assert.equal(shouldApplyAnthropicCacheBreakpoints("openai"), false);
assert.equal(shouldApplyOpenAIPromptCacheKey("openai"), true);
assert.equal(shouldApplyOpenAIPromptCacheKey("anthropic"), false);

assert.equal(resolvePromptCacheKey("ses_abc", "agent-1"), "ses_abc");
assert.equal(resolvePromptCacheKey(undefined, "agent-1"), "agent-1");
assert.equal(resolvePromptCacheKey("x".repeat(80), "a").length, 64);

const sorted = sortToolsByName([{ name: "zeta" }, { name: "alpha" }, { name: "mid" }]);
assert.deepEqual(
  sorted.map((t) => t.name),
  ["alpha", "mid", "zeta"]
);

const record = {
  zeta: { name: "zeta", description: "z" },
  alpha: { name: "alpha", description: "a" },
};
const fromRecord = toolsToArray(record);
assert.deepEqual(
  fromRecord.map((t) => t.name),
  ["alpha", "zeta"]
);

const frozen = buildFrozenSystemPrompt({
  config: { systemPrompt: "You are helpful." },
  agentDocContent: "",
  skillRegister: null,
  memoryContent: "",
});
const dynamic = "<current_date>\nJuly 22, 2026\n</current_date>";
const system = buildSystemPromptWithTurnContext(frozen, dynamic);
assert.ok(system?.[0]);

const split = splitSystemPromptAtDynamicBoundary(system[0]);
assert.ok(split.frozen.includes(SYSTEM_PROMPT_DYNAMIC_BOUNDARY.trim()));
assert.ok(split.dynamic?.includes("<turn_context>"));

const cachedSystem = buildAnthropicCachedSystemPrompts(system);
assert.equal(cachedSystem?.length, 2);
assert.equal(typeof cachedSystem?.[0], "object");
assert.deepEqual(cachedSystem?.[0]?.metadata?.cache_control, EPHEMERAL_CACHE_CONTROL);
assert.equal(typeof cachedSystem?.[1], "string");
assert.ok(String(cachedSystem?.[1]).includes("<turn_context>"));

const tools = applyAnthropicToolCacheBreakpoint([
  { name: "read_file", description: "r" },
  { name: "glob", description: "g" },
]);
assert.deepEqual(
  tools?.map((t) => t.name),
  ["glob", "read_file"]
);
assert.deepEqual(tools?.[1]?.metadata?.cacheControl, EPHEMERAL_CACHE_CONTROL);
assert.equal(tools?.[0]?.metadata?.cacheControl, undefined);

const messages = applyAnthropicLatestUserCacheBreakpoint([
  { role: "user", content: "hello" },
  { role: "assistant", content: "hi" },
  { role: "tool", toolCallId: "t1", content: "result" },
]);
assert.equal(messages[0]?.role, "user");
assert.ok(Array.isArray(messages[0]?.content));
assert.deepEqual(messages[0]?.content?.[0]?.metadata?.cache_control, EPHEMERAL_CACHE_CONTROL);

const again = applyAnthropicLatestUserCacheBreakpoint(messages);
assert.deepEqual(again[0]?.content?.[0]?.metadata?.cache_control, EPHEMERAL_CACHE_CONTROL);

console.log("validate:prompt-cache OK");
