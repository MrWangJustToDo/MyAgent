/**
 * Validates instruction-context truncation reporting.
 *
 * Guards the byte-budget reporting upgrade: when a changed instruction file
 * exceeds the byte budget, the re-injected `<instruction_context>` section must
 * surface a truncation notice instead of silently cutting off the content.
 *
 * Run: pnpm --filter @my-agent/core run validate:instruction-budget
 */

import assert from "node:assert/strict";

import { formatInstructionContextSection, INSTRUCTION_MAX_BYTES } from "../dist/dev.mjs";

{
  // Truncated primary file → notice must be present.
  const section = formatInstructionContextSection({
    primary: { name: "AGENTS.md", content: "x".repeat(1000), truncated: true },
    override: undefined,
  });
  assert.ok(section);
  assert.match(section, /AGENTS\.md/);
  assert.match(section, /exceeds the/);
  assert.match(section, new RegExp(String(INSTRUCTION_MAX_BYTES)));
  assert.match(section, /was truncated/);
}

{
  // Intact primary + truncated override → notice only for the override.
  const section = formatInstructionContextSection({
    primary: { name: "AGENTS.md", content: "short", truncated: false },
    override: { name: "AGENTS.override.md", content: "x".repeat(1000), truncated: true },
  });
  assert.ok(section);
  assert.match(section, /## Local Override \(AGENTS\.override\.md\)/);
  assert.match(section, /exceeds the/);
}

{
  // Nothing truncated → no notice.
  const section = formatInstructionContextSection({
    primary: { name: "AGENTS.md", content: "short", truncated: false },
    override: undefined,
  });
  assert.ok(section);
  assert.doesNotMatch(section, /exceeds the/);
}

console.log("instruction-budget validation passed");
