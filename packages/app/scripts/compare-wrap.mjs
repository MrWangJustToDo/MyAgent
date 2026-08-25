// Compare my wrapTextToLines against react-terminal's wrapStyledChars
// to find wrap-semantics divergence for the exact UserMessageView pipeline.
import * as rt from "../node_modules/@my-react/react-terminal/dist/esm/index.mjs";
import { wrapTextToLines } from "../dist/index.mjs";

function wrapWithTerminal(text, columns) {
  // StyledLine.legacyCreateStyledChars may not exist; try building via legacyCreateStyledLine
  const values = [];
  const spans = [];
  for (const ch of text) {
    values.push(ch);
    spans.push({ length: 1, formatFlags: 0 });
  }
  const line = rt.StyledLine.legacyCreateStyledLine(values, spans);
  const rows = rt.wrapStyledChars(line, columns);
  return rows.map((r) => r.text ?? "");
}

function compare(label, text, columns) {
  const mine = wrapTextToLines(text, columns);
  const theirs = wrapWithTerminal(text, columns);
  console.log(`\n=== ${label} (cols=${columns}) ===`);
  console.log(`mine=${mine.length}  theirs=${theirs.length}  match=${mine.length === theirs.length}`);
  if (mine.length !== theirs.length) {
    console.log("mine:", JSON.stringify(mine.slice(0, Math.min(mine.length, theirs.length) + 2)));
    console.log("theirs:", JSON.stringify(theirs.slice(0, Math.min(mine.length, theirs.length) + 2)));
  }
}

compare("simple words", "hello world foo bar baz", 10);
compare("long no-space word", "abcdefghijklmnopqrstuvwxyz0123456789", 10);
compare("cjk", "中文中文中文中文中文", 8);
compare("mixed cjk+ascii", "ab中文cd ef中文", 6);
compare("many newlines", "aaa bbb\nccc ddd\n\neee fff", 8);
compare("trailing space line", "hello world   \nnext", 8);
compare("consecutive spaces", "a  b   c    d", 5);
compare("space at wrap boundary", "abcde fghij klmno", 5);
