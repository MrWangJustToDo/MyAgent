/**
 * Validates the session title / PR-style summary system prompts.
 *
 * Guards the prompt-quality upgrade: both prompts must instruct the model to
 * respond in the same language as the conversation (so Chinese conversations
 * don't get English titles/summaries), and the PR summary prompt must keep its
 * section structure.
 *
 * Run: pnpm --filter @my-agent/core run validate:session-summary-prompt
 */

import assert from "node:assert/strict";

import { PR_SUMMARY_SYSTEM_PROMPT, TITLE_SYSTEM_PROMPT } from "../dist/dev.mjs";

{
  const languageRule = /same language as the conversation/;
  assert.match(TITLE_SYSTEM_PROMPT, languageRule);
  assert.match(PR_SUMMARY_SYSTEM_PROMPT, languageRule);

  // Title prompt shape.
  assert.match(TITLE_SYSTEM_PROMPT, /3-8 words/);
  assert.match(TITLE_SYSTEM_PROMPT, /Return ONLY the title/);

  // PR summary prompt keeps its section structure.
  assert.match(PR_SUMMARY_SYSTEM_PROMPT, /## Overview/);
  assert.match(PR_SUMMARY_SYSTEM_PROMPT, /## Changes/);
  assert.match(PR_SUMMARY_SYSTEM_PROMPT, /## Key files/);
  assert.match(PR_SUMMARY_SYSTEM_PROMPT, /## Commits/);
}

console.log("session-summary-prompt validation passed");
