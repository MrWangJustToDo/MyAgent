// Test the real 16K prompt across a range of terminal widths.
import fs from "node:fs";
import { truncateTextToMaxLines, wrapTextToLines } from "../dist/index.mjs";

const PANEL_PROMPT_MAX_LINES = 60;
const data = JSON.parse(fs.readFileSync("/home/mrwang/MyAgent/.agents/sessions/ses_mshgikc1_jetu1l.session.json", "utf8"));
const msgs = data.uiMessages ?? [];
let promptText = "";
for (const m of msgs) {
  if (m.role === "user") {
    promptText = m.parts?.find((p) => p.type === "text")?.content ?? "";
    break;
  }
}

console.log("prompt length:", promptText.length);
console.log();

for (const screenWidth of [200, 160, 120, 100, 80, 60, 40]) {
  const truncWidth = Math.max(1, screenWidth - 6);
  const renderWidth = screenWidth - 5;
  const { text: capped, truncated, hiddenLines } = truncateTextToMaxLines(promptText, truncWidth, PANEL_PROMPT_MAX_LINES);
  const rowsAtRender = wrapTextToLines(capped, renderWidth).length;
  const note = rowsAtRender > PANEL_PROMPT_MAX_LINES ? "  <-- OVER BUDGET!" : "";
  console.log(
    `screen=${screenWidth} truncW=${truncWidth} renderW=${renderWidth}  rows@render=${rowsAtRender}${note}  truncated=${truncated}`
  );
}
