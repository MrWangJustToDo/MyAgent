/**
 * Validation for canonical model message rebuilding (UI + engine merge).
 *
 * Run: pnpm --filter @my-agent/core run validate:canonical-model-messages
 */

import assert from "node:assert/strict";

import { buildCanonicalModelMessages, formatCompactionSummaryContent, getModelVisibleMessages } from "../dist/dev.mjs";

const uiMessages = Array.from({ length: 69 }, (_, i) => ({
  id: `u${i}`,
  role: "user",
  parts: [{ type: "text", content: `message ${i}` }],
}));

const fromUI = buildCanonicalModelMessages(uiMessages, [], 0);
assert.equal(fromUI.length, 69);

const runBaseline = 69;

// Engine grew beyond baseline: UI prefix + engine suffix
{
  const engine = Array.from({ length: runBaseline + 2 }, (_, i) => ({
    role: "user",
    content: `engine ${i}`,
  }));
  const canon = buildCanonicalModelMessages(uiMessages, engine, runBaseline);
  assert.equal(canon.length, runBaseline + 2);
  assert.equal(canon[0]?.content, "message 0");
  assert.equal(canon[runBaseline]?.content, `engine ${runBaseline}`);
}

// Engine same length as baseline: prefer engine (in-place updates)
{
  const fullEngine = Array.from({ length: runBaseline }, (_, i) => ({
    role: "user",
    content: `engine ${i}`,
  }));
  const canon = buildCanonicalModelMessages(uiMessages, fullEngine, runBaseline);
  assert.equal(canon.length, runBaseline);
  assert.equal(canon[0]?.content, "engine 0");
}

// In-chain summary projection (chronological → summary-first)
{
  const chronologic = [
    ...Array.from({ length: 40 }, (_, i) => ({ role: "user", content: `message ${i}` })),
    { role: "user", content: formatCompactionSummaryContent("old") },
    ...Array.from({ length: 5 }, (_, i) => ({ role: "user", content: `after ${i}` })),
  ];
  const visible = getModelVisibleMessages(chronologic, { keepRecentFlows: 2 });
  assert.match(String(visible[0].content), /CONVERSATION SUMMARY/);
  assert.ok(visible.some((m) => m.content === "after 0"));
  assert.ok(!visible.some((m) => m.content === "message 0"));
}

// In-place tool result update: engine length unchanged, content differs from stale UI conversion.
const toolUiMessages = [
  { id: "u1", role: "user", parts: [{ type: "text", content: "test" }] },
  {
    id: "a1",
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        id: "tc1",
        name: "read_file",
        arguments: {},
        state: "output-available",
        output: { content: "stale" },
      },
    ],
  },
];

const engineWithTool = [
  { role: "user", content: "test" },
  {
    role: "assistant",
    content: null,
    toolCalls: [{ id: "tc1", type: "function", function: { name: "read_file", arguments: "{}" } }],
  },
  { role: "tool", toolCallId: "tc1", content: "fresh tool result" },
];

const toolCanon = buildCanonicalModelMessages(toolUiMessages, engineWithTool, 3);
assert.equal(toolCanon.length, 3);
assert.equal(toolCanon[2]?.content, "fresh tool result");

// Post-compact: engine is summary-first (shorter); UI stays chronological.
// Baseline sentinel forces engine-prefer so UI/engine index spaces do not merge incorrectly.
{
  const summary = formatCompactionSummaryContent("compacted");
  const chronologicUI = [
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`,
      role: "user",
      parts: [{ type: "text", content: `old ${i}` }],
    })),
    { id: "sum", role: "user", parts: [{ type: "text", content: summary }] },
  ];
  const projectedEngine = getModelVisibleMessages(
    chronologicUI.map((m) => ({
      role: m.role,
      content: m.parts[0].content,
    })),
    { keepRecentFlows: 2 }
  );
  assert.ok(projectedEngine.length < chronologicUI.length);
  // Grow engine past chronological channel length — must still prefer engine, not UI∥engine merge.
  const grownEngine = [
    ...projectedEngine,
    ...Array.from({ length: chronologicUI.length }, (_, i) => ({
      role: "assistant",
      content: `post ${i}`,
    })),
  ];
  assert.ok(grownEngine.length > chronologicUI.length);
  const postCompact = buildCanonicalModelMessages(chronologicUI, grownEngine, Number.MAX_SAFE_INTEGER);
  assert.equal(postCompact, grownEngine);
  assert.match(String(postCompact[0].content), /CONVERSATION SUMMARY/);
  assert.ok(!postCompact.some((m) => m.content === "old 0"));
}

console.log("validate:canonical-model-messages OK");
