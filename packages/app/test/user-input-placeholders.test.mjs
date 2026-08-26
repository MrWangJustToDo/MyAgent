/**
 * Validates both paste flows and their shared helpers:
 *  - large-text paste: collapses into a placeholder (pendingPastes) and is
 *    expanded back to the full text on submit (mirrors gemini-cli)
 *  - image/file attachment: placeholder character -> [Image #N: file] ref
 *  - coexistence of both, placeholder deletion pruning, and submit clearing
 *
 * Run: pnpm --filter @my-agent/app test
 *      (or: pnpm --filter @my-agent/app build && node packages/app/test/user-input-placeholders.test.mjs)
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  IMAGE_PLACEHOLDER_START,
  PASTE_PLACEHOLDER_START,
  createImagePlaceholder,
  createPastePlaceholder,
  extractSubmittedInput,
  formatImageRef,
  formatPastePlaceholder,
  getPasteIndex,
  isImagePlaceholder,
  isLargePaste,
  isPastePlaceholder,
  removePasteAtIndex,
} from "../dist/hooks/user-input-helpers.mjs";
import { useUserInput } from "../dist/index.mjs";

const act = () => useUserInput.getActions();
const state = () => useUserInput.getReadonlyState();

function attachment(filename, type = "image") {
  return {
    path: "clipboard",
    filename,
    mediaType: type === "image" ? "image/png" : "text/plain",
    type,
    size: 12,
    dataUrl: type === "image" ? "data:image/png;base64,aaaa" : "data:text/plain;base64,dGV4dA==",
  };
}

const bigPaste = Array.from({ length: 8 }, (_, i) => `line${i + 1}`).join("\n");
const smallPaste = "tiny paste";

// ============================================================================
// Helpers (pure functions)
// ============================================================================

test("isLargePaste thresholds (5 lines / 500 chars, > to trigger)", () => {
  assert.equal(isLargePaste("a\nb\nc\nd\ne"), false);
  assert.equal(isLargePaste("a\nb\nc\nd\ne\nf"), true);
  assert.equal(isLargePaste("x".repeat(500)), false);
  assert.equal(isLargePaste("x".repeat(501)), true);
});

test("paste placeholder chars are distinct from image placeholder range", () => {
  const img = createImagePlaceholder(0);
  const paste = createPastePlaceholder(0);
  assert.equal(img.charCodeAt(0), IMAGE_PLACEHOLDER_START);
  assert.equal(paste.charCodeAt(0), PASTE_PLACEHOLDER_START);
  assert.ok(PASTE_PLACEHOLDER_START > IMAGE_PLACEHOLDER_START);
  assert.equal(isImagePlaceholder(img), true);
  assert.equal(isPastePlaceholder(paste), true);
  assert.equal(isImagePlaceholder(paste), false, "paste not in image range");
  assert.equal(isPastePlaceholder(img), false, "image not in paste range");
  assert.equal(getPasteIndex(paste), 0);
});

test("extractSubmittedInput expands paste + keeps image refs (mixed, in order)", () => {
  const img = createImagePlaceholder(0);
  const paste = createPastePlaceholder(0);
  const pending = [{ text: bigPaste, lineCount: 8 }];
  const attachments = [attachment("clipboard-aaa.png")];

  const { text, attachments: ordered } = extractSubmittedInput(
    `before ${img} mid ${paste} after`,
    attachments,
    pending
  );

  assert.equal(text, `before ${formatImageRef(1, "clipboard-aaa.png")} mid ${bigPaste} after`);
  assert.equal(ordered.length, 1);
  assert.equal(ordered[0].filename, "clipboard-aaa.png");
});

test("extractSubmittedInput drops orphan paste placeholders (missing entry)", () => {
  const paste = createPastePlaceholder(1);
  assert.equal(extractSubmittedInput(`x${paste}y`, [], []).text, "xy");
  assert.equal(formatPastePlaceholder(8), "[Pasted Text: 8 lines]");
});

test("removePasteAtIndex keeps sparse indices stable (aligned to placeholder chars)", () => {
  const pending = [
    { text: "a", lineCount: 1 },
    { text: "b", lineCount: 2 },
  ];
  const pruned = removePasteAtIndex(pending, 0);
  assert.equal(pruned[0], undefined);
  assert.equal(pruned[1], pending[1], "later index stays aligned");
});

// ============================================================================
// Large-text paste flow (actions)
// ============================================================================

test("paste collapses large text into a placeholder and stores content", () => {
  act().reset();
  act().paste(bigPaste);

  const s = state();
  assert.equal(s.value.length, 1);
  assert.ok(isPastePlaceholder(s.value[0]));
  assert.equal(s.pendingPastes[0].text, bigPaste);
  assert.equal(s.pendingPastes[0].lineCount, 8);
  assert.equal(s.nextPasteIndex, 1);
  assert.equal(s.expandedPasteIndex, null);
  // Feedback hint (gemini-cli parity) is shown without crashing.
  assert.equal(state().inputFeedback?.message, "Press Ctrl+O to expand pasted text");
});

test("paste inserts small text verbatim (no placeholder)", () => {
  act().reset();
  act().paste(smallPaste);
  const s = state();
  assert.equal(s.value, smallPaste);
  assert.equal(s.pendingPastes.length, 0);
});

test("togglePasteExpansion expands and collapses the placeholder under cursor", () => {
  act().reset();
  act().paste(bigPaste); // value = <placeholder>, cursor after it
  act().togglePasteExpansion();
  assert.equal(state().expandedPasteIndex, 0);
  act().togglePasteExpansion();
  assert.equal(state().expandedPasteIndex, null);
});

test("backspace on a paste placeholder prunes pendingPastes and clears expansion", () => {
  act().reset();
  act().setValue(`x${createPastePlaceholder(0)}y`);
  act().moveCursorLeft(); // cursor 3 -> 2, just past the placeholder
  act().togglePasteExpansion();
  assert.equal(state().expandedPasteIndex, 0);

  act().backspace(); // delete the placeholder char at index 1
  const s = state();
  assert.equal(s.value, "xy");
  assert.equal(s.pendingPastes[0], undefined);
  assert.equal(s.expandedPasteIndex, null);
});

test("submit expands paste placeholders back to full text and clears state", () => {
  act().reset();
  act().paste(bigPaste);
  act().paste(bigPaste);

  const { text, attachments } = act().submit();
  assert.equal(text, `${bigPaste}${bigPaste}`);
  assert.equal(attachments.length, 0);

  const s = state();
  assert.equal(s.value, "");
  assert.equal(s.pendingPastes.length, 0);
  assert.equal(s.nextPasteIndex, 0);
});

test("multiple large pastes are distinct placeholders with independent content", () => {
  act().reset();
  act().paste("aaa\nbbb\nccc\nddd\neee\nfff"); // index 0
  act().paste("111\n222\n333\n444\n555\n666"); // index 1

  const s = state();
  assert.equal(s.value.length, 2);
  assert.notEqual(s.value[0], s.value[1], "distinct placeholder chars");
  assert.equal(s.pendingPastes[1].text, "111\n222\n333\n444\n555\n666");
  assert.equal(
    extractSubmittedInput(s.value, [], s.pendingPastes).text,
    "aaa\nbbb\nccc\nddd\neee\nfff111\n222\n333\n444\n555\n666"
  );
});

test("selectAll + large paste replaces everything and resets placeholder state", () => {
  act().reset();
  act().append("keep?");
  act().setSelectAll(true);
  act().paste(bigPaste);

  const s = state();
  assert.equal(s.value, createPastePlaceholder(0));
  assert.equal(s.pendingPastes[0].text, bigPaste);
  assert.equal(s.attachments.length, 0);
});

// ============================================================================
// Image / file attachment flow (actions)
// ============================================================================

test("addAttachment inserts an image placeholder and stores the attachment", () => {
  act().reset();
  act().addAttachment(attachment("clipboard-aaa.png"));

  const s = state();
  assert.equal(s.value, createImagePlaceholder(0));
  assert.ok(isImagePlaceholder(s.value[0]));
  assert.equal(s.attachments[0].filename, "clipboard-aaa.png");
  assert.equal(s.nextImageIndex, 1);
});

test("submit emits image refs with ordered attachments (image flow)", () => {
  act().reset();
  act().addAttachment(attachment("clipboard-aaa.png"));
  act().addAttachment(attachment("clipboard-bbb.png"));

  const { text, attachments } = act().submit();
  assert.equal(text, `${formatImageRef(1, "clipboard-aaa.png")}${formatImageRef(2, "clipboard-bbb.png")}`);
  assert.equal(attachments.length, 2);
  assert.equal(attachments[1].filename, "clipboard-bbb.png");
});

test("backspace on an image placeholder prunes attachments", () => {
  act().reset();
  act().addAttachment(attachment("clipboard-aaa.png")); // value = <img>
  act().backspace(); // cursor at end, deletes the image placeholder
  const s = state();
  assert.equal(s.value, "");
  assert.equal(s.attachments.length, 0);
});

// ============================================================================
// Coexistence of both flows
// ============================================================================

test("image + paste placeholders coexist and both expand on submit", () => {
  act().reset();
  act().addAttachment(attachment("clipboard-aaa.png")); // image placeholder
  act().paste(bigPaste); // paste placeholder

  const s = state();
  assert.equal(s.value.length, 2);
  assert.ok(isImagePlaceholder(s.value[0]));
  assert.ok(isPastePlaceholder(s.value[1]));

  const { text, attachments } = act().submit();
  assert.equal(text, `${formatImageRef(1, "clipboard-aaa.png")}${bigPaste}`);
  assert.equal(attachments.length, 1);
  assert.equal(state().value, "");
});

test("clear resets both image attachments and pending pastes", () => {
  act().reset();
  act().addAttachment(attachment("clipboard-aaa.png"));
  act().paste(bigPaste);
  assert.ok(state().value.length >= 2);

  act().clear();
  const s = state();
  assert.equal(s.value, "");
  assert.equal(s.attachments.length, 0);
  assert.equal(s.pendingPastes.length, 0);
});

// ============================================================================
// History navigation + draft (unsubmitted input) boundaries
// ============================================================================

test("history stores expanded text; historyPrev restores plain text with no orphan placeholders", () => {
  act().reset();
  act().paste(bigPaste); // collapsed placeholder
  const submitted = act().submit().text;
  assert.equal(submitted, bigPaste); // expanded on submit

  act().historyPrev(); // back to the history entry
  const s = state();
  assert.equal(s.value, bigPaste, "expanded plain text shown");
  assert.equal(s.historyIndex, 0);
  assert.equal(s.pendingPastes.length, 0, "no orphan paste state");
  assert.equal(s.attachments.length, 0);
});

test("draft: history round-trip restores the full unsubmitted input (incl. collapsed paste)", () => {
  act().reset();
  act().setValue("first");
  act().submit(); // seed history so historyPrev has an entry to navigate to
  act().append("question?");
  act().paste(bigPaste); // placeholder appended at cursor
  const draftValue = state().value;
  const draftPaste = state().pendingPastes[0].text;

  act().historyPrev(); // leave current input (draft saved)
  assert.equal(state().value, "first", "history text shown");
  assert.equal(state().historyIndex, 0);

  act().historyNext(); // back to current input -> draft restored
  const s = state();
  assert.equal(s.historyIndex, -1);
  assert.equal(s.value, draftValue, "value restored incl. placeholder char");
  assert.equal(s.pendingPastes[0].text, draftPaste, "paste content restored");

  const { text } = act().submit();
  assert.equal(text, `question?${bigPaste}`, "draft still submits expanded");
});

test("draft survives navigation across multiple history entries", () => {
  act().reset();
  act().setValue("first");
  act().submit();
  act().setValue("second");
  act().submit();
  act().append("draft-here");
  const draft = state().value;

  act().historyPrev(); // -> "second" (draft saved)
  act().historyPrev(); // -> "first"
  assert.equal(state().value, "first");

  act().historyNext(); // -> "second"
  act().historyNext(); // -> -1 (draft restored)
  assert.equal(state().value, draft);
  assert.equal(state().historyIndex, -1);
});

test("editing while in history discards the saved draft", () => {
  act().reset();
  act().setValue("history-item");
  act().submit();
  act().append("my-draft");

  act().historyPrev(); // draft saved, now showing "history-item"
  act().backspace(); // editing history text starts a new input
  assert.equal(state().historyIndex, -1);
  assert.equal(state().draftInput, null, "draft discarded on edit");
  assert.equal(state().value, "history-ite");

  act().historyPrev(); // back to history
  act().historyNext(); // back to -1 -> old draft is NOT resurrected
  assert.equal(state().value, "history-ite");
});

test("empty input does not save a draft (returns to empty)", () => {
  act().reset();
  act().setValue("only-history");
  act().submit();

  act().historyPrev(); // empty current input -> no draft saved
  assert.equal(state().value, "only-history");
  act().historyNext(); // back to -1
  assert.equal(state().value, "");
  assert.equal(state().historyIndex, -1);
});

test("moving cursor away from an expanded paste collapses it", () => {
  act().reset();
  act().setValue("ab"); // cursor at 2
  act().paste(bigPaste); // value = "ab<ph>", cursor at 3 (= pos + 1)
  act().togglePasteExpansion();
  assert.equal(state().expandedPasteIndex, 0);

  act().moveCursorLeft(); // cursor 2 (== pos, adjacent)
  assert.equal(state().expandedPasteIndex, 0, "still adjacent");
  act().moveCursorLeft(); // cursor 1 (== pos - 1, adjacent)
  assert.equal(state().expandedPasteIndex, 0);
  act().moveCursorLeft(); // cursor 0 (away) -> auto collapse
  assert.equal(state().expandedPasteIndex, null);
});

console.log("user-input-placeholders: ok");
