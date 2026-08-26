/**
 * Validates compaction prompt language-consistency and template invariants.
 *
 * Guards the compaction prompt upgrade: every summarizer-facing prompt must
 * instruct the model to respond in the same language as the conversation, and
 * the core template structure (<previous-summary>, ## Goal, segment rules)
 * must survive future edits.
 *
 * Run: pnpm --filter @my-agent/core run validate:compaction-prompt
 */

import assert from "node:assert/strict";

import {
  buildCompactionPrompt,
  COMPACTION_PROMPT,
  COMPACTION_SYSTEM_PROMPT,
  TURN_PREFIX_INSTRUCTION,
  UPDATE_COMPACTION_PROMPT,
} from "../dist/dev.mjs";

// Every summarizer-facing prompt must keep the conversation's language.
{
  const languageRule = /same language as the conversation/;
  assert.match(COMPACTION_SYSTEM_PROMPT, languageRule);
  assert.match(COMPACTION_PROMPT, languageRule);
  assert.match(UPDATE_COMPACTION_PROMPT, languageRule);
  assert.match(TURN_PREFIX_INSTRUCTION, languageRule);
}

// Template invariants must survive future edits.
{
  const basic = buildCompactionPrompt();
  assert.match(basic, /## Goal/);
  assert.match(basic, /## Instructions/);
  assert.match(basic, /## Discoveries/);
  assert.match(basic, /## Relevant files \/ directories/);
  assert.doesNotMatch(basic, /<previous-summary>/);

  const update = buildCompactionPrompt({
    existingSummary: "## Goal\n\nShip it\n\n## Compact archives\n\n- `.agents/transcripts/ses/compact-1.md`",
  });
  assert.match(update, /<previous-summary>/);
  assert.match(update, /## Goal/);
  assert.match(update, /UPDATE the Progress section/);
  // Archive lists are stripped from <previous-summary> (instruction text may still mention the section name).
  const prevBlock = update.match(/<previous-summary>\n([\s\S]*?)\n<\/previous-summary>/)?.[1] ?? "";
  assert.match(prevBlock, /## Goal/);
  assert.doesNotMatch(prevBlock, /## Compact archives/);

  const stillInContext = buildCompactionPrompt({ hasStillInContext: true });
  assert.match(stillInContext, /<still_in_context>/);
  assert.match(stillInContext, /Do NOT restate/);
}

console.log("compaction-prompt validation passed");
