/**
 * Validation for turn-context via system prompt.
 *
 * Run: pnpm --filter @my-agent/core run validate:turn-context
 */

import assert from "node:assert/strict";

import {
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  buildFrozenSystemPrompt,
  buildSystemPromptWithTurnContext,
} from "../dist/dev.mjs";

const dynamic = "<current_date>\nJuly 22, 2026\n</current_date>";

const frozen = buildFrozenSystemPrompt({
  config: { systemPrompt: "You are helpful." },
  agentDocContent: "",
  skillRegister: null,
  memoryContent: "",
});
assert.ok(frozen?.includes("<SYSTEM_PROMPT_DYNAMIC_BOUNDARY>"));

const withDynamic = buildSystemPromptWithTurnContext(frozen, dynamic);
assert.equal(withDynamic?.length, 1);
assert.ok(withDynamic?.[0]?.startsWith("You are helpful."));
assert.ok(withDynamic?.[0]?.includes(SYSTEM_PROMPT_DYNAMIC_BOUNDARY.trim()));
assert.ok(withDynamic?.[0]?.includes("<turn_context>"));
assert.ok(withDynamic?.[0]?.includes(dynamic));
assert.ok(withDynamic?.[0]?.endsWith("</turn_context>"));

// Same snapshot → identical system prompt (prefix-cache stable within a turn)
const again = buildSystemPromptWithTurnContext(frozen, dynamic);
assert.equal(withDynamic?.[0], again?.[0]);

assert.deepEqual(buildSystemPromptWithTurnContext(frozen, undefined), [frozen]);
assert.equal(buildSystemPromptWithTurnContext(undefined, undefined), undefined);

const dynamicOnly = buildSystemPromptWithTurnContext(undefined, dynamic);
assert.ok(dynamicOnly?.[0]?.includes("<turn_context>"));

console.log("turn-context validation passed");
