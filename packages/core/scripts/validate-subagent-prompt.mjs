/**
 * Validates the explore subagent system prompt.
 *
 * Guards the subagent-prompt upgrade: the explore prompt must carry an explicit
 * read-only delegation boundary, a language-matching instruction, structured
 * result guidance, and must not balloon past a sane length cap.
 *
 * Run: pnpm --filter @my-agent/core run validate:subagent-prompt
 */

import assert from "node:assert/strict";

import { buildExploreSystemPrompt } from "../dist/dev.mjs";

{
  const prompt = buildExploreSystemPrompt(5);

  // Role + tools.
  assert.match(prompt, /read-only subagent/);
  assert.match(prompt, /begin_summary/);

  // Delegation boundary: read-only, no file modifications; only read-only
  // shell commands allowed inside the project (write/external denied).
  assert.match(prompt, /read-only: no file modifications/);
  assert.match(prompt, /read-only shell commands/);
  assert.match(prompt, /write, background, or external-path commands are denied/);
  assert.match(prompt, /report what needs to change back to the parent agent instead of acting/);
  assert.match(prompt, /Do not expand the task scope beyond what was asked/);
  assert.match(prompt, /5 steps/);

  // Guidelines: language matching + structured references.
  assert.match(prompt, /Match the parent conversation's language/);
  assert.match(prompt, /file_path:line_number/);

  // Length cap guard.
  assert.ok(prompt.length <= 3000, `explore prompt too long: ${prompt.length} chars (cap 3000)`);
}

console.log("subagent-prompt validation passed");
