import { useEffect, useState } from "react";

import type { ReactNode } from "react";

interface PanelOverlayProps {
  /** Whether the overlay is open. Closed → nothing renders and readiness resets. */
  open: boolean;
  /**
   * Changing this while open re-runs the blank frame (e.g. a list↔detail view switch
   * inside the panel). The overlay blanks briefly so the new screen is drawn
   * after the blank frame, not before it.
   */
  resetKey?: unknown;
  children: ReactNode;
}

/**
 * Full-screen panel wrapper that blanks for one frame, then reveals its children.
 *
 * The blank frame must be produced by Ink itself (rendering `null`), never by writing
 * a raw RIS (`\x1bc` / `ansi-escapes.clearScreen`) to `process.stdout`: Ink tracks the
 * terminal contents row by row, so an external clear makes it skip every row whose
 * content did not change — those rows stay blank on the real terminal, which shows up
 * as a half-empty panel. Letting Ink own the blank frame keeps its model in sync.
 */
export const PanelOverlay = ({ open, resetKey, children }: PanelOverlayProps) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    // Blank first, then reveal.
    setReady(false);
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, resetKey]);

  if (!open || !ready) return null;

  return <>{children}</>;
};
