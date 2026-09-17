/**
 * use-tool-elapsed — Read tool elapsed time from the global timing store.
 *
 * No subscription or bridge logic here — that lives in `use-agent-chat.ts`.
 * This hook is purely a store reader with a live ticker for in-flight tools.
 *
 * Client tools that wait on the user (e.g. `ask_user`) are excluded from timing
 * at the store level (see {@link handleToolLifecycleEvent}).
 */

import { useEffect, useState } from "react";

import { useToolTimingStore } from "../utils/tool-timing-store.js";

// ============================================================================
// Constants
// ============================================================================

/** Live-clock tick while the rendered value is still in seconds (ms). */
const FAST_TICK_MS = 500;
/**
 * Live-clock tick once the rendered value is minutes (ms).
 *
 * `formatDuration` switches resolution at the minute mark: below it the string is
 * `12.3s` (tenths), at and above it is `1m 5s` (whole seconds, no decimal). The
 * cadence follows what is actually rendered, so the seconds advance one per repaint
 * — the same visible series the old fixed 200ms clock produced, at a quarter of the
 * repaints. Below the minute the value still moves in tenths, so its clock stays
 * finer (and deliberately coarser than the old one, which repainted five times a
 * second to redraw tenths only some of the time).
 */
const SLOW_TICK_MS = 1000;
/** Elapsed at which the rendered value becomes minutes (mirrors `formatDuration`). */
const MINUTE_MS = 60_000;

export { SLOW_TICK_MS, FAST_TICK_MS };

// ============================================================================
// Hook
// ============================================================================

/**
 * Read the elapsed time for a tool call.
 *
 * @param toolCallId - Tool call ID, or empty to disable.
 * @param active - Whether the tool is currently in flight (drives the live tick).
 * @param thresholdMs - Only return a live value once elapsed exceeds this (mirrors
 *   the old `LIVE_DURATION_THRESHOLD_MS` behavior). Final durations always return.
 * @returns Live elapsed ms while `active`, final `durationMs` once completed,
 *   otherwise `null`.
 */
export function useToolElapsed(toolCallId: string | undefined, active: boolean, thresholdMs = 0): number | null {
  const timing = useToolTimingStore((s) => (toolCallId ? s.timings[toolCallId] : undefined));
  const startedAt = timing?.startedAt;

  // Live tick for in-flight tools (only while active; no persistent interval otherwise).
  // Self-rescheduling rather than `setInterval`: the delay depends on the elapsed value,
  // which changes every tick. Reading that value from state and listing it as a dep would
  // re-run the effect on every tick — and the effect setting the very state it depends on
  // is a render loop. The timer carries its own cadence instead, and `now` stays a pure
  // render input.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active || !toolCallId || startedAt === undefined) return;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      id = setTimeout(tick, at - startedAt >= MINUTE_MS ? SLOW_TICK_MS : FAST_TICK_MS);
    };
    tick();
    return () => clearTimeout(id);
  }, [active, toolCallId, startedAt]);

  // Completed tool: return the frozen authoritative duration.
  if (timing?.durationMs !== undefined) {
    return timing.durationMs;
  }

  // In-flight tool: return live elapsed once past threshold.
  if (active && timing?.startedAt) {
    const elapsed = (now || timing.startedAt) - timing.startedAt;
    if (elapsed >= thresholdMs) return elapsed;
  }

  return null;
}
