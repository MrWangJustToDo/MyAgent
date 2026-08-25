// Simulate the exact selectPanelPreviewMessages pipeline to check whether the
// FIRST user message (huge) is actually the one being truncated.
import { truncateTextToMaxLines, wrapTextToLines } from "../dist/index.mjs";

const PANEL_PROMPT_MAX_LINES = 60;

// The prompt as it would arrive: a user message with a HUGE text part
const hugePrompt = Array.from({ length: 3000 }, (_, i) => `line ${i}: some prompt text`).join("\n");

// Simulate: first user message index 0 -> collapseUserPrompts keeps it as-is (index===0)
// getMessages: all = [user(huge), ...]
// findIndex(user) -> 0 -> truncate

const promptTextWidth = 114; // screenWidth 120 - 6
const { text: capped } = truncateTextToMaxLines(hugePrompt, promptTextWidth, PANEL_PROMPT_MAX_LINES);

console.log("hugePrompt chars:", hugePrompt.length);
console.log("capped chars:", capped.length);
console.log("capped has truncation hint:", capped.includes("truncated"));

const rowsAtRender = wrapTextToLines(capped, 115).length; // actual render width
console.log("rows at render width 115:", rowsAtRender, "(should be <= 60)");
console.log("last 150 chars:", JSON.stringify(capped.slice(-150)));
