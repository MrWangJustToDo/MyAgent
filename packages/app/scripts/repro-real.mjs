// Full pipeline repro using the REAL 16K prompt from a session file.
import fs from "node:fs";
import { truncateTextToMaxLines, wrapTextToLines } from "../dist/index.mjs";

const PANEL_PROMPT_MAX_LINES = 60;

const data = JSON.parse(
  fs.readFileSync("/home/mrwang/MyAgent/.agents/sessions/ses_mshgikc1_jetu1l.session.json", "utf8")
);
const msgs = data.uiMessages ?? [];

let promptText = "";
for (const m of msgs) {
  if (m.role === "user") {
    promptText = m.parts?.find((p) => p.type === "text")?.content ?? "";
    break;
  }
}

console.log("prompt length:", promptText.length);

// Real prompt text: many logical lines. Let's compute how it renders at various widths.
const screenWidth = 120;
const truncWidth = screenWidth - 6;
const renderWidth = screenWidth - 5;

const { text: capped, truncated, hiddenLines } = truncateTextToMaxLines(promptText, truncWidth, PANEL_PROMPT_MAX_LINES);
console.log("truncated:", truncated, "hiddenLines:", hiddenLines);
console.log("capped chars:", capped.length);

const rowsAtTrunc = wrapTextToLines(capped, truncWidth).length;
const rowsAtRender = wrapTextToLines(capped, renderWidth).length;
console.log("rows at trunc width:", rowsAtTrunc);
console.log("rows at render width:", rowsAtRender);

// Now, crucially: does the capped text STILL contain very long single lines
// that would re-wrap differently under Ink? Check per-logical-line width.
const logicalLines = capped.split("\n");
const longLines = logicalLines
  .map((l, i) => ({ i, w: [...l].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 || c.charCodeAt(0) >= 0xac00 ? 2 : 1), 0) }))
  .filter((x) => x.w > renderWidth);
console.log("logical lines in capped:", logicalLines.length, "  over-wide lines:", longLines.length);
if (longLines.length) console.log("first 5 over-wide:", longLines.slice(0, 5));
