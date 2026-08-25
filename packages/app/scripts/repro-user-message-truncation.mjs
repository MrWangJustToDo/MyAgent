// Reproduce the SubagentPreviewView truncation logic and compare against
// UserMessageView's actual rendered width.
import { truncateTextToMaxLines, wrapTextToLines } from "../dist/index.mjs";

const PANEL_PROMPT_MAX_LINES = 60;

// Build a realistic long task prompt: a few paragraphs + a long URL/path that
// won't break at spaces, which is common in real prompts.
function makePrompt(lineCount) {
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    if (i % 5 === 0) {
      lines.push(`https://github.com/example/very/long/path/${i}/with/no/spaces/that/will/hard/wrap/${i}`);
    } else {
      lines.push(`This is prompt paragraph ${i} with some moderately long content that spans across the line.`);
    }
  }
  return lines.join("\n");
}

const screenWidth = 120;
const promptTextWidth = screenWidth - 6; // what SubagentPreviewView passes
const actualTextColumn = screenWidth - 5; // what UserMessageView actually renders at

console.log(`screenWidth=${screenWidth}  promptTextWidth(used for trunc)=${promptTextWidth}  actualTextColumn=${actualTextColumn}`);

for (const lineCount of [100, 500, 2000]) {
  const prompt = makePrompt(lineCount);
  const { text: capped, truncated, hiddenLines } = truncateTextToMaxLines(prompt, promptTextWidth, PANEL_PROMPT_MAX_LINES);
  const renderedAtTruncWidth = wrapTextToLines(capped, promptTextWidth).length;
  const renderedAtActualWidth = wrapTextToLines(capped, actualTextColumn).length;
  console.log(`\n--- input ${lineCount} logical lines ---`);
  console.log(`truncated=${truncated}  hiddenLines=${hiddenLines}`);
  console.log(`rows at trunc width ${promptTextWidth}: ${renderedAtTruncWidth} (expected <=60)`);
  console.log(`rows at actual render width ${actualTextColumn}: ${renderedAtActualWidth} (this is what user sees)`);
}
