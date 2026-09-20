import { useMediaQuery } from "./use-media-query.js";

/**
 * Coarse, discrete size classes for the shell.
 *
 * `compact` — below 768px: the workspace becomes a sheet, top-bar actions
 *   collapse to icons, the terminal targets the narrowest column budget.
 * `regular` — 768–1279px: side pane with a conservative default width.
 * `wide` — 1280px and up: full top bar, the widest default pane.
 */
export type Breakpoint = "compact" | "regular" | "wide";

export interface BreakpointInfo {
  name: Breakpoint;
  isCompact: boolean;
  isWide: boolean;
  /**
   * Whether the workspace panel should be presented as an overlay sheet rather
   * than a side pane. Structure decisions read this, never raw pixel widths.
   */
  panelAsSheet: boolean;
}

const COMPACT_QUERY = "(max-width: 767px)";
const WIDE_QUERY = "(min-width: 1280px)";

/**
 * The single breakpoint owner for the playground shell.
 *
 * Components must not add their own layout media queries; they branch on this
 * hook (or on a `data-breakpoint` attribute set once by the shell) so the
 * structure of the app has exactly one place to change.
 */
export function useBreakpoint(): BreakpointInfo {
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);

  const name: Breakpoint = isCompact ? "compact" : isWide ? "wide" : "regular";

  return {
    name,
    isCompact,
    isWide,
    panelAsSheet: isCompact,
  };
}
