// ============================================================================
// Workspace tree reveal decision
// ============================================================================

/**
 * What a tree view should do about `selectedPath` on this render.
 *
 * The rule that matters: **a row that is missing is not a reason to expand.** A
 * selected file's row disappears for two unrelated reasons — its directory was
 * collapsed by the user, or the folder was never expanded because the selection
 * just arrived — and only the second one may expand anything. Deciding this off
 * the rows alone (\"no row, so reveal it\") makes a directory impossible to
 * collapse while its file is selected: the collapse is undone on the next render,
 * so the folder flickers shut and springs back open.
 *
 * The signal that tells the two apart is the selection itself, which is why
 * `pendingReveal` exists rather than being inferred from `items`: a request is
 * raised when a file is selected, consumed once applied, and absent otherwise.
 * An absent row with no request is the user's own collapse, and the expand state
 * is theirs to own.
 */
export type RevealAction =
  /** Row is present — move the cursor to `index` and scroll it into view. */
  | { kind: "select"; index: number }
  /** An outstanding request for this path — expand its ancestor chain. */
  | { kind: "consume" }
  /** Nothing to do: leave the tree exactly as it is. */
  | { kind: "none" };

export interface RevealDecisionInput {
  /** Index of `selectedPath` in the rendered rows, or -1 when it is absent. */
  rowIndex: number;
  selectedPath: string | null;
  /** Path with an unconsumed reveal request, or null. */
  pendingReveal: string | null;
  /** Diff mode expands its jumps directly, so it never consumes a request here. */
  isDiffMode: boolean;
}

export function decideReveal({ rowIndex, selectedPath, pendingReveal, isDiffMode }: RevealDecisionInput): RevealAction {
  if (!selectedPath) return { kind: "none" };
  if (rowIndex >= 0) return { kind: "select", index: rowIndex };
  if (!isDiffMode && pendingReveal === selectedPath) return { kind: "consume" };
  return { kind: "none" };
}
