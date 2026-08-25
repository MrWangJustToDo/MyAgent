// Test the SPECIFIC complaint: "单行超过一定长度也限制一下，但是目前的效果看起来完全不对"
// The suspicion is that a single very long logical line (a long URL or base64 blob
// with no spaces) is not being truncated properly.
import { truncateTextToMaxLines, wrapTextToLines } from "../dist/index.mjs";

const PANEL_PROMPT_MAX_LINES = 60;

function show(label, text, screenWidth) {
  const promptTextWidth = screenWidth - 6;
  const { text: capped, truncated, hiddenLines } = truncateTextToMaxLines(text, promptTextWidth, PANEL_PROMPT_MAX_LINES);
  const rowsAtTrunc = wrapTextToLines(capped, promptTextWidth).length;
  console.log(`\n=== ${label} ===`);
  console.log(`truncated=${truncated} hiddenLines=${hiddenLines}`);
  console.log(`capped length=${capped.length}`);
  console.log(`rows at trunc width ${promptTextWidth}: ${rowsAtTrunc}`);
  console.log("last 200 chars of capped:", JSON.stringify(capped.slice(-200)));
}

const screenWidth = 120;

// Case 1: single VERY long line with no spaces (e.g. a URL or error stack echo)
show(
  "single long no-space line (100k chars)",
  "x".repeat(100000),
  screenWidth
);

// Case 2: single long line with spaces (a paragraph)
show(
  "single long paragraph with spaces (50k chars)",
  ("word ".repeat(10000)).trim(),
  screenWidth
);

// Case 3: a realistic huge task prompt with many newlines
const manyLines = Array.from({ length: 5000 }, (_, i) => `line ${i} with some text`).join("\n");
show("5000 newline-separated lines", manyLines, screenWidth);
