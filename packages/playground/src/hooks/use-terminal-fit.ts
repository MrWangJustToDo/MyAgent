import { useEffect, useState } from "react";

import { useBreakpoint } from "./use-breakpoint.js";

import type { Breakpoint } from "./use-breakpoint.js";

export interface TerminalFit {
  /** xterm font size in px. */
  fontSize: number;
  /** Advisory column budget for the current breakpoint, surfaced in the status bar. */
  columns: number;
}

const FONT_SIZE = 14;

/** Column budgets per size class — advisory, used for status display only. */
const COLUMNS: Record<Breakpoint, number> = {
  compact: 80,
  regular: 100,
  wide: 120,
};

/**
 * Terminal metrics for the current breakpoint.
 *
 * `InkTerminalBox` recreates the xterm instance whenever `termOptions` changes
 * (its mount effect depends on the options *value*), which drops scrollback. So:
 *
 * - `fontSize` is a **constant**. Crossing the compact boundary relocates the
 *   terminal between the split pane and the workspace sheet, which unmounts and
 *   remounts it; changing the font at the same moment would double that churn for
 *   no benefit, and a stable size keeps the shell's own layout the only thing that
 *   varies by width.
 * - `columns` is presentation-only. It is deliberately *not* pushed into the
 *   terminal, so a resize never remounts it.
 *
 * xterm itself is a real grid emulator: once the box changes size it reflows and
 * reflows the Ink layout with it, so no JS-driven rescaling is needed.
 */
export function useTerminalFit(): TerminalFit {
  const { name } = useBreakpoint();
  return { fontSize: FONT_SIZE, columns: COLUMNS[name] };
}

/**
 * Debounced terminal metrics for callers that *do* want a width-dependent font
 * size. Kept available (and unit-testable) even though `AgentSurface` uses the
 * stable variant above.
 */
export function useDebouncedTerminalFit(delay = 220): TerminalFit {
  const { name } = useBreakpoint();
  const [settled, setSettled] = useState<Breakpoint>(name);

  useEffect(() => {
    if (settled === name) return;
    const id = window.setTimeout(() => setSettled(name), delay);
    return () => window.clearTimeout(id);
  }, [name, settled, delay]);

  return { fontSize: FONT_SIZE, columns: COLUMNS[settled] };
}
