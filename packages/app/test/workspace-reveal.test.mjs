/**
 * Validates the workspace tree reveal decision.
 *
 * The bug this exists for: a directory could not be collapsed while its file was
 * selected, because "the selected row is missing" was read as "reveal it" — so the
 * user's collapse was undone on the next render. The two cases must be told apart,
 * and the only thing that distinguishes them is whether a selection raised a
 * request.
 *
 * Run: node packages/app/test/workspace-reveal.test.mjs
 */
import assert from "node:assert/strict";

const { decideReveal } = await import("../dist/utils/workspace-reveal.mjs");

const FILE = "/repo/pkg/a.ts";

// ---------------------------------------------------------------------------
// A visible row is selected and scrolled to
// ---------------------------------------------------------------------------

assert.deepEqual(
  decideReveal({ rowIndex: 3, selectedPath: FILE, pendingReveal: null, isDiffMode: false }),
  { kind: "select", index: 3 },
  "a present row moves the cursor to it, whether or not a request is outstanding"
);

assert.deepEqual(
  decideReveal({ rowIndex: 0, selectedPath: FILE, pendingReveal: FILE, isDiffMode: false }),
  { kind: "select", index: 0 },
  "a row that is present takes precedence over a stale request"
);

// ---------------------------------------------------------------------------
// The regression: a missing row is NOT a reason to expand
// ---------------------------------------------------------------------------

assert.deepEqual(
  decideReveal({ rowIndex: -1, selectedPath: FILE, pendingReveal: null, isDiffMode: false }),
  { kind: "none" },
  "a missing row with no request is the user's own collapse, and is left alone"
);

// ---------------------------------------------------------------------------
// A selection that hides its own target does reveal
// ---------------------------------------------------------------------------

assert.deepEqual(
  decideReveal({ rowIndex: -1, selectedPath: FILE, pendingReveal: FILE, isDiffMode: false }),
  { kind: "consume" },
  "a missing row WITH a request expands the chain (diff -> preview, or a jump)"
);

assert.deepEqual(
  decideReveal({ rowIndex: -1, selectedPath: FILE, pendingReveal: "/repo/other.ts", isDiffMode: false }),
  { kind: "none" },
  "a request for a different path does not reveal this one"
);

// ---------------------------------------------------------------------------
// Diff mode expands its jumps directly
// ---------------------------------------------------------------------------

assert.deepEqual(
  decideReveal({ rowIndex: -1, selectedPath: FILE, pendingReveal: FILE, isDiffMode: true }),
  { kind: "none" },
  "diff mode never consumes a request — `[`/`]` revealed before selecting"
);

// ---------------------------------------------------------------------------
// No selection
// ---------------------------------------------------------------------------

assert.deepEqual(
  decideReveal({ rowIndex: -1, selectedPath: null, pendingReveal: FILE, isDiffMode: false }),
  { kind: "none" },
  "with nothing selected there is nothing to reveal, even mid-request"
);

console.log("workspace-reveal validation passed");
