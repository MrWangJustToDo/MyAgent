/**
 * Wait for the transcript's hidden-count marker to agree with the row budget it describes.
 *
 * The smoke's frame transitions are driven by fixed sleeps (`settle(ms)`), not by a layout /
 * measurement checkpoint. `onRender` measurements therefore keep landing for a while after a
 * repaint, and the row budget is derived FROM those measurements — so reading "budget vs
 * painted marker" mid-flight compares a stale frame's paint against a half-measured budget and
 * flaps with no source change (observed: 2 of 4 runs disagreed, 281 vs 292).
 *
 * Agreement must be reached on the FIRST observation that is stable in both signals, not just
 * eventually: an eventual-agreement loop would also accept a marker that is stale now and
 * corrected on a later frame — exactly the regression the caller is guarding.
 *
 * Run through `pnpm --filter @my-agent/app run validate:render-smoke`.
 */

/**
 * @param {object} io
 * @param {() => { marker: number; visibleCount: number }} io.readState
 *   The hidden total the component should be painting right now, recomputed from the CURRENT
 *   measured heights (the window prefix plus the rows the budget dropped).
 * @param {() => number[]} io.readPaintedMarker
 *   Marker values painted in the CURRENT frame (empty when none is on screen).
 * @param {() => Promise<void>} io.settle
 * @param {number} [io.timeoutMs]
 * @param {number} [io.stableReads] Consecutive agreeing observations required.
 * @returns {Promise<{ settled: boolean; painted: number[]; state: object }>}
 */
export async function awaitStableMarker({ readState, readPaintedMarker, settle, timeoutMs = 4000, stableReads = 3 }) {
  const deadline = Date.now() + timeoutMs;
  let lastSignature = null;
  let stable = 0;

  /** One observation: what should be painted, what is painted, and whether they agree. */
  const observe = () => {
    const state = readState();
    const painted = readPaintedMarker();
    const agrees = state.marker === 0 ? painted.length === 0 : painted.at(-1) === state.marker;
    return { state, painted, agrees, signature: JSON.stringify({ state, painted }) };
  };

  while (Date.now() < deadline) {
    const seen = observe();
    if (seen.agrees) {
      stable = seen.signature === lastSignature ? stable + 1 : 1;
      if (stable >= stableReads) return { settled: true, painted: seen.painted, state: seen.state };
    } else {
      stable = 0;
    }
    lastSignature = seen.signature;
    await settle();
  }

  const last = observe();
  return { settled: false, painted: last.painted, state: last.state };
}
