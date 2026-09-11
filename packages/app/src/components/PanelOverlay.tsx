import { useEffect, useState } from "react";

import type { ReactNode } from "react";

interface PanelOverlayProps {
  /** Whether the overlay is open. Closed → nothing renders and readiness resets. */
  open: boolean;
  /**
   * Changing this while open re-runs the clear (e.g. a list↔detail view switch
   * inside the panel). The overlay blanks briefly so the new screen is drawn
   * after the clear, not before it.
   */
  resetKey?: unknown;
  children: ReactNode;
}

/**
 * Full-screen panel wrapper that clears the terminal, then reveals its children
 * only once the async clear has actually been written.
 *
 * Rendering before the clear lands would let the late clear wipe the freshly
 * drawn panel, leaving a blank overlay — so `ready` must flip strictly after
 * the clear resolves. Readiness resets on close, and a `cancelled` guard drops
 * stale async completions after close/reset.
 */
export const PanelOverlay = ({ open, resetKey, children }: PanelOverlayProps) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    // Clear first, then reveal.
    setReady(false);
    let cancelled = false;
    void (async () => {
      if (typeof process === "object") {
        const pkg = await import("ansi-escapes");
        process?.stdout?.write?.(pkg.clearScreen + pkg.cursorTo(0, 0));
      }
      if (cancelled) return;
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, resetKey]);

  if (!open || !ready) return null;

  return <>{children}</>;
};
