/**
 * Pure, headless fixtures for the transcript line budget.
 *
 * These are deliberately separate from `run.mjs` and from the component: every expectation here
 * is derived from HAND-BUILT heights, never from the store the component writes. Reusing
 * `useStaticHeights` for an expectation would make the guard self-referential — a regression that
 * corrupts the measured heights (which is exactly how broken heights went unnoticed once) would
 * corrupt the expectation in lockstep and stay green.
 *
 * `checks` is a flat array of `{ name, pass, detail }` so `run.mjs` can fold it into its report.
 */
import { MAX_STATIC_LINES, PROVISIONAL_ROW_LINES, selectVisibleRows } from "./dist/components/MessageList.mjs";
import { FAST_TICK_MS, SLOW_TICK_MS } from "./dist/hooks/use-tool-elapsed.mjs";
import { formatTaskTurns } from "./dist/messages/task-turns.mjs";

const row = (id) => ({ id, role: "assistant", parts: [{ type: "text", content: `r ${id}` }] });

/**
 * `selectVisibleRows` invariants: newest-first, stop at the first row that does not fit, always
 * keep the newest row, charge unknown heights the provisional allowance, count drops in messages.
 */
function budgetInvariants() {
  const checks = [];
  const rows = Array.from({ length: 10 }, (_, i) => row(`h${i}`));

  // 10 rows x 100 lines; a 1200-line budget fits exactly 12 — so all fit. Use a height that
  // makes the boundary explicit instead of relying on the constant's current value.
  const perRow = 100;
  const fits = Math.floor(MAX_STATIC_LINES / perRow);
  const heights = Object.fromEntries(rows.map((r) => [r.id, perRow]));
  const sel = selectVisibleRows(rows, heights);
  checks.push({
    name: "line budget takes rows newest-first and stops at the first one that does not fit",
    pass: sel.visibleCount === Math.min(rows.length, fits) && sel.droppedCount === rows.length - sel.visibleCount,
    detail: { visibleCount: sel.visibleCount, fits, droppedCount: sel.droppedCount },
  });

  // The newest row is kept even when it alone exceeds the budget: the alternative is rendering
  // nothing while the user's newest message exists.
  const oversized = selectVisibleRows(rows, Object.fromEntries(rows.map((r) => [r.id, MAX_STATIC_LINES * 2])));
  checks.push({
    name: "an oversized newest row is still kept",
    pass: oversized.visibleCount === 1,
    detail: { visibleCount: oversized.visibleCount },
  });

  // Unknown heights are charged the provisional allowance, not zero. Charging zero would select
  // far more rows than fit on a cold mount — truncating harder than the cap this replaces.
  const cold = selectVisibleRows(rows, {});
  const coldExpected = Math.min(rows.length, Math.floor(MAX_STATIC_LINES / PROVISIONAL_ROW_LINES));
  checks.push({
    name: "a cold mount charges the provisional allowance per row",
    pass: cold.visibleCount === coldExpected,
    detail: { visibleCount: cold.visibleCount, coldExpected, provisional: PROVISIONAL_ROW_LINES },
  });

  // Use a height that forces a drop regardless of the constant's current value.
  const tooTall = Object.fromEntries(rows.map((r) => [r.id, Math.ceil(MAX_STATIC_LINES / 3)]));
  const dropping = selectVisibleRows(rows, tooTall);
  checks.push({
    name: "dropped totals are counted in source messages, not rows",
    pass:
      dropping.droppedCount > 0 && dropping.droppedSourceMessages > 0 && dropping.droppedSourceMessages <= rows.length,
    detail: {
      droppedSourceMessages: dropping.droppedSourceMessages,
      droppedRows: dropping.droppedCount,
      visibleCount: dropping.visibleCount,
    },
  });

  return checks;
}

/**
 * The selection/pruning feedback loop.
 *
 * `selectVisibleRows` decides visibility FROM the measured heights, so pruning those heights by
 * the VISIBLE subset makes the two chase each other: releasing a row's height changes the next
 * selection, which releases another row. Pruning by the DERIVED row set (bounded by the input
 * window, independent of the budget) is a fixed point.
 *
 * The second check is the non-vacuity guard: the rejected policy really does drift.
 */
function pruningLoop() {
  const simulate = (pruneByVisible) => {
    const rows = Array.from({ length: 400 }, (_, i) => row(`s${i}`));
    const heights = {};
    for (let i = 0; i < rows.length; i++) heights[`s${i}`] = i % 10 === 0 ? 200 : 2;
    const counts = [];
    const firstIds = [];
    for (let step = 0; step < 12; step++) {
      const sel = selectVisibleRows(rows, heights);
      const visible = rows.slice(rows.length - sel.visibleCount);
      counts.push(sel.visibleCount);
      firstIds.push(visible[0]?.id);
      const keep = new Set((pruneByVisible ? visible : rows).map((r) => r.id));
      for (const id of Object.keys(heights)) if (!keep.has(id)) delete heights[id];
    }
    return { counts, firstIds };
  };

  const derived = simulate(false);
  const visible = simulate(true);
  return [
    {
      name: "re-running the selection is a fixed point (the kept window does not drift)",
      pass: new Set(derived.counts).size === 1 && new Set(derived.firstIds).size === 1,
      detail: { counts: [...new Set(derived.counts)], firstIds: [...new Set(derived.firstIds)] },
    },
    {
      name: "pruning heights by the visible subset would drift (guard is non-vacuous)",
      pass: new Set(visible.counts).size > 1 || new Set(visible.firstIds).size > 1,
      detail: { counts: [...new Set(visible.counts)], firstIds: [...new Set(visible.firstIds)] },
    },
  ];
}

/**
 * The task row's turn readout (`3/50`) and the live-duration clock cadence.
 *
 * Both are pure values rather than rendered output, so they are pinned here rather than in the
 * mounted `MessageList` checks — mounting the tool row would need a resolvable child session.
 * The `undefined` case is the one that matters: `iteration` is optional on the session snapshot,
 * and a consumer that assumes it exists would render `0/0` on every transcript that predates it.
 */
function taskTurnsAndClock() {
  const done = [];
  const check = (name, pass, detail) => done.push({ name, pass, detail });

  check("task turns render as n/m", formatTaskTurns({ current: 3, max: 50 }) === "3/50", {
    got: formatTaskTurns({ current: 3, max: 50 }),
  });
  check("an unknown budget renders as a bare count, never n/0", formatTaskTurns({ current: 3, max: 0 }) === "3", {
    got: formatTaskTurns({ current: 3, max: 0 }),
  });
  check(
    "a run that has not reported an iteration yet shows nothing",
    formatTaskTurns({ current: 0, max: 50 }) === null,
    {
      got: formatTaskTurns({ current: 0, max: 50 }),
    }
  );
  check("an absent iteration state degrades to nothing (it is optional)", formatTaskTurns(undefined) === null, {
    got: formatTaskTurns(undefined),
  });

  // The clock follows the resolution of the rendered string: sub-minute shows tenths of a
  // second, minute-and-over shows whole seconds. One repaint per visible change, either way.
  check("the live clock ticks per rendered second below the minute", FAST_TICK_MS === 500, { FAST_TICK_MS });
  check("and per whole second at and above it", SLOW_TICK_MS === 1000, { SLOW_TICK_MS });
  check(
    "the clock never repaints faster than the value it renders changes",
    FAST_TICK_MS >= 100 && SLOW_TICK_MS >= FAST_TICK_MS,
    { FAST_TICK_MS, SLOW_TICK_MS }
  );

  return done;
}

export const checks = [...budgetInvariants(), ...pruningLoop(), ...taskTurnsAndClock()];
