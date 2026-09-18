/**
 * Guard: a mid-run tool-display write must not kill the rest of the text stream.
 *
 * `attachToolDisplay` patches the live assistant message while the run is still streaming.
 * If it goes through the channel-level `setMessages`, that refreshes the run-boundary
 * snapshot (`historicalMessageIds`) with the in-flight message id, and
 * `shouldSuppressStaleTextChunk` then drops every remaining TEXT delta for it — the
 * model's summary after the tool disappears. Case A is the regression; B/C are controls.
 *
 * Run via `pnpm --filter @codent/core validate:mid-run-tool-display`.
 */

import { EventType } from "@tanstack/ai/client";

const { AgentUIChannel } = await import("../dist/dev.mjs");

const messageId = "msg-assistant-1";
const toolCallId = "call-1";
let channel;

function baseChunks() {
  return [
    { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: "before tool. " },
    { type: EventType.TOOL_CALL_START, toolCallId, toolName: "read_file", messageId },
    { type: EventType.TOOL_CALL_ARGS, toolCallId, delta: '{"path":"a.ts"}' },
    { type: EventType.TOOL_CALL_END, toolCallId },
    { type: EventType.TOOL_CALL_RESULT, toolCallId, content: '{"totalLines":3}' },
  ];
}

function tailChunks() {
  return [
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: "AFTER TOOL" },
    { type: EventType.TEXT_MESSAGE_END, messageId },
    { type: EventType.RUN_FINISHED, threadId: "t", runId: "r" },
  ];
}

async function run({ midRun, label }) {
  channel = new AgentUIChannel({});
  const stream = (async function* () {
    for (const chunk of baseChunks()) yield chunk;
    midRun?.();
    for (const chunk of tailChunks()) yield chunk;
  })();

  await channel.consumeRun({ stream });
  const text = channel
    .getMessages()
    .flatMap((m) => m.parts)
    .filter((p) => p.type === "text")
    .map((p) => p.content)
    .join("");
  console.log(`${label}: ${JSON.stringify(text)}`);
  return text;
}

const withAttach = await run({
  midRun: () => channel.attachToolDisplay(toolCallId, { summary: "3 lines" }),
  label: "A attachToolDisplay mid-run",
});

const withAddResult = await run({
  midRun: () => channel.addToolResult(toolCallId, { totalLines: 3 }),
  label: "B addToolResult only     ",
});

const noop = await run({ midRun: undefined, label: "C no mid-run call        " });

console.log("");
console.log("A keeps tail text:", withAttach.includes("AFTER TOOL"));
console.log("B keeps tail text:", withAddResult.includes("AFTER TOOL"));
console.log("C keeps tail text:", noop.includes("AFTER TOOL"));

const failures = [];
if (!withAttach.includes("AFTER TOOL"))
  failures.push("A: a mid-run attachToolDisplay dropped the text after the tool call");
if (!withAddResult.includes("AFTER TOOL")) failures.push("B: addToolResult dropped the text after the tool call");
if (!noop.includes("AFTER TOOL")) failures.push("C: baseline dropped the text after the tool call");

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("");
console.log("validate-mid-run-tool-display: ok");
