# Tasks: per-item-static-render

## 1. Measurement baseline (before touching code)

- [x] 1.1 Add a throwaway A/B probe under `packages/app/scripts/render-smoke/` that mounts
      the real `MessageList` + `Content` and records, for each trigger, the bytes emitted:
      (a) a single row's tool state advances, (b) transcript display mode switches,
      (c) terminal resize. Record the baseline numbers from today's single-block caching.
- [x] 1.2 Record the cold-mount frame for a recorded long session
      (`node scripts/render-smoke/run.mjs <session.jsonl>`) plus its rendered tree height,
      to compare against after the change.
- [x] 1.3 Keep `ab-probe.mjs` until task 2.6 has measured the same triggers after the
      change, then delete it (no probe scripts left in the repo).

### Baseline (fixture: 60 turns x 4 tools = 421 messages, 120x40 viewport)

| trigger | HEAD (single block) | after (per-row) |
|---|---|---|
| rows re-cached by ONE row advancing | all (101 rows) | **1** |
| CPU per single-row update (25 updates, 60-turn fixture) | 90–105 ms | **24–26 ms** |
| resize (width changes every row) | all rows via one block | **all rows**, once |
| diff-renderer switch, transcript has no diff rows | all rows | **0** |
| (d) cold mount, 100-row budget | 20 788 B / 3 writes | 20 788 B / 3 writes (identical) |

- The headline numbers are **rows re-cached** and **CPU per update**, not output bytes.
  Bytes are bounded by the viewport (only visible lines are repainted) and so cannot show a
  layout/caching win — and in the shared-text fixture the per-row variant emits *more*
  bytes, because each row's cache records its own anchor position and the terminal repaints
  more visible rows. That is a deliberate trade and is recorded in `design.md`.
- Rebuild scope is correctly unchanged where it should be: a theme switch (every row genuinely
  changes) and a resize (every row's width changes) both re-cache all rows; a diff-renderer
  switch re-caches **0** when the transcript contains no diff rows. The subtlety is that a value
  read by subscription INSIDE the row (`useDiffRenderer`) must reach the element array's rebuild
  key, not the per-row `deps` — putting it in both makes a single toggle cost two full rebuilds,
  and an assertion that accepted "almost all rows" hid that. The smoke now pins both directions
  (all rows when it matters, zero when it does not).
- `ab-probe.mjs` (bytes per trigger) and `ab-stream.mjs` (CPU + rows re-cached per update,
  takes the dist dir as an argument so the same script can run against HEAD's build) are the
  probes; both are deleted at the end of task 1.3.

Notes that matter for interpreting these numbers:

- The one-row trigger mutates exactly one row (`c55-0-1`, inside the rendered window) while
  the id set and row count stay identical, so nothing except that row changed.
- Static rows are **per part**: message `c55-0` yields rows `c55-0-0` (text) and `c55-0-1`
  (tool), so the mutated row id carries a part suffix.
- A tool output's *content* is deliberately NOT part of the render signature
  (`encodeToolCallState` records output presence only); the row renders the core-supplied
  `display` payload, so the probes mutate `display`.
- The store holds only the rows inside the line budget, so a mutation outside that window
  renders nothing at all.

## 2. Per-row cache unit and per-row signatures (design D1, D2, D4)

- [x] 2.1 `packages/app/src/utils/get-messages.ts`: return `staticSignatures: string[]` for the
      static rows, computed with the existing `computeMessageRenderSignature` over the same
      projected rows the renderer will use.
- [x] 2.2 Stop folding the global `computeToolCallsRenderSignature` into
      `computeStaticRenderSignature`; the transcript-wide signature must no longer reach any
      cache dependency. Remove `toolCallsSignature` from the `getMessages` return once
      `MessageList` no longer consumes it.
- [x] 2.3 `packages/app/src/hooks/use-static.ts`: add `itemSigs: string[]` to the store and
      one action that sets it together with the row list, so list and signatures can never
      diverge. Drop the `setToolCallsSignature` action.
- [x] 2.4 `packages/app/src/components/MessageList.tsx`: wrap each rendered row in its own
      `<StaticRender width={width} deps={[rowSig, width, mode, theme, diffMode]}>`.

### Dependencies a row reaches by subscription, not by prop (found in review)

A row's cache deps must list every input the row reads, **including inputs consumed through a
store subscription deep inside the row** — those are invisible at the `MessageList` call site:

- `mode` / `theme` — already covered (props and context at the row boundary).
- **`diffMode` (`useDiffRenderer`) — added.** `ToolInputView` → `MessageDiffView` subscribes
  to `useDiffRenderer`, so `/appearance diff lite|full` reaches every diff row without passing
  through `MessageList`. Without the dep, switching the renderer left cached diff rows drawing
  through the previous renderer (and, because the two renderers have different heights, with
  the stale measured height). Regression guard: the smoke toggles the diff renderer and
  asserts the rows re-cache; removing the dep makes it fail with `reCached: 0`.
- Same reasoning applies to any future store a row subscribes to: grep the row subtree for
  `use*(` outside `MessageView` before adding one.

### Where the cache value must live (found in review, and the first fix was backwards)

`width` / `theme` / `diffMode` must be in the **element-array rebuild key**, NOT in the per-row
`deps`. Two measurements show why:

- Keeping them in the per-row `deps` while removing them from the key makes a diff switch
  re-cache **0** rows — the changed rows keep rendering through the previous renderer. Correctness
  loss, not an optimisation.
- Keeping them in BOTH (the state this task first shipped) is pure redundancy: they can never
  differ while the array identity is unchanged, and one toggle costs **two** full rebuilds (380
  re-cache calls for 191 rows) because `useDiffRenderer`'s `setMode`/`toggle` mutate `mode` and
  then bump `key` on a later tick.

Rebuilding the array is the ONLY thing that hands rows a new `deps` array, so the key is the
right and sufficient place. The smoke asserts both ends: **all** rows re-cache on resize, **zero**
on a diff switch when the transcript has no diff rows.

### `onRender` measures on a pre-layout pass with width 0 (found while verifying P0)

This is the most consequential finding of the review round, and no reviewer caught it because it
only shows up once the heights are inspected directly:

- `onRender` first fires on a pre-layout pass where the leaf reports `width 0` and a
  **width-derived nonsense height** — measured exactly `2 * columns - 2` (238 at 120 columns, 118
  at 60, 78 at 40). Caching at that width yields a region that is **0 lines tall**: the rows are
  invisible.
- The post-cache pass then reports `width 120, height 0`, which `recordHeight` rejects as
  non-positive — so the first bogus value would stick **permanently**, and the line budget would
  spend fiction (it selected only ~22 rows and truncated ~176).
- Fix: gate the first publication on a known width. The first cache write then happens at the
  real width in a **single** pass (verified: one `onRender` per row, `cachedRender=120x4`).
- A measurement attempt from inside the row cannot replace this: once a row is cached its inner
  Yoga subtree is detached, so a ref inside it measures `NaN` and the wrapper around it 0 lines.
  `onRender`'s node is the cache leaf and its height is computed before detachment.

### `retainIds` must prune by the derived row set, not the visible one (review P0)

`selectVisibleRows` decides visibility **from** the measured heights, so pruning those heights by
the visible subset makes the two chase each other. Measured before the fix: the kept window's
first id alternated `r341/r334/r338` and the row count oscillated `59/66` forever; the real
component showed 5 decreases in visible rows out of 16 appends. Pruning by the derived row set
(bounded by `STATIC_INPUT_WINDOW`, independent of the budget) is a fixed point — verified stable
over 12 iterations and unchanged across idle re-renders.
- [x] 2.5 `packages/app/src/layout/Content.tsx`: remove the single whole-transcript
      `<StaticRender>`; render the row list directly and keep `dynamicList` as-is. Remove
      `toolCallsSignature` from the `deps` that block carried.
- [x] 2.6 Re-run the 1.1 probe and confirm trigger (a) drops from the full-block byte count
      to ~0 while (b) and (c) still repaint (they legitimately affect every row).

### Findings from 2.4/2.6 that changed the design

- **The element array must be rebuilt whenever any row's signature moves.** Freezing it on a
  row-*set* key is wrong: the frozen `<StaticRender>` elements keep their old `deps`, so a
  changed row's `depsChanged` never fires and the row stays stale forever. Rebuilding the
  array is cheap (creating elements, not rendering them); the expensive part is skipped per
  row by `<StaticRender>`'s own deps comparison.
- **Bytes are the wrong KPI here.** They are bounded by the viewport, so they cannot show a
  layout/caching win, and per-row caches can emit *more* bytes in the shared-text fixture
  because each row's cache records its own anchor position. The KPI is rows re-cached
  (101 → 1) and CPU per update (90–105 ms → 24–26 ms).

## 3. Measured heights and line budget (design D3)

- [x] 3.1 Add a store for measured row heights keyed by message id (sibling of
      `use-static`), with actions to record a height and to drop entries for ids that are no
      longer in the row set.
- [x] 3.2 Wire each row's `<StaticRender onRender={(node) => ...}>` to record
      `Math.round(measureElement(node).height)` against that row's message id.
- [x] 3.3 `packages/app/src/components/MessageList.tsx`: replace `MAX_STATIC_PARTS`
      (message count) with `MAX_STATIC_LINES` and select rows newest-first over accumulated
      measured heights; rows with no measured height receive the provisional allowance.
- [x] 3.4 Ensure the selection is stable across renders: an unknown-height row must not
      flip in and out of the kept set as measurements land.
- [x] 3.5 Guard the cold path explicitly — assert (in the render-smoke) that a resume with
      no cached heights renders no fewer rows than the pre-change behaviour for the same
      fixture.
- [x] 3.6 Measure the rendered line distribution from a recorded long session and pick
      `MAX_STATIC_LINES` so the steady-state tree stays under the worker's 1000-line window
      with margin.

### Measured distribution (task 3.6)

Fixture: 60 turns x 4 tools, 120x40, `run.mjs`. 199 static rows, **438 lines** measured by
`onRender`; mean **2.20 lines/row** (max 4).

- `MAX_STATIC_LINES = 1200` — deliberately above the worker's 1000-line scroll-back window so
  the trailing rows the user is actually looking at stay complete. Measured steady state is
  ~199 rows / ~438 lines, i.e. this budget holds a whole ordinary session instead of truncating
  it, which is the point: the old message-count cap silently truncated transcripts whose rows
  were taller than one line.
- An earlier revision of this section recorded **678 lines / 3.4 lines per row**. Both were
  measurement artifacts, not the code: `onRender` was firing on a pre-layout pass at width 0 and
  caching a 0-line region, so every user row recorded the bogus `2 * columns - 2` = 238. Fixing
  the width gate (see task 2.4's findings) changed the distribution, not the design.
- `PROVISIONAL_ROW_LINES = 12` — a deliberate upper estimate rather than an average. The cold
  path (resume / `/clear`, no measured heights at all) charges 12 lines/row, i.e. 100 rows for
  the 1200-line budget: exactly as many rows as the old `MAX_STATIC_PARTS = 100` admitted, so a
  cold mount cannot truncate harder than the behaviour it replaces. Charging 0 (or 1) would
  select far too many rows and drop *more* history than before.
- Cold-path guard is asserted in the smoke: with no measurements, `selectVisibleRows` keeps
  `min(rows, MAX_STATIC_LINES / PROVISIONAL_ROW_LINES)` = 100 rows.

### The welcome panel is outside the budget (found in review)

With the row list cached per row, the header lost the cache dependency it used to have for
free: at HEAD it sat inside the one whole-transcript block whose deps included `headerSet`, so
the panel was cached; after the move it rendered on every frame. It now has its own
`<StaticRender>` in `Content`, keyed on `headerSet`.

That also settles the correctness question: the panel is the user's orientation (workspace,
git, remote planes) and the **only** element pinned to the very top of the transcript, so it
must not be droppable by a budget that counts rendered LINES. It is therefore rendered from
outside `MessageList`'s row list. Note it was never hardware-pinned (only `MessageList` uses
`<StaticRender>`, so nothing is written to permanent scrollback) — inside the budgeted list it
would simply be dropped along with the other oldest rows once row heights exceeded
`MAX_STATIC_LINES`, and the user would lose the header on a long session.

Regression guard asserts the panel **paints** (not merely that the store holds it) while the
budget is exhausted, and additionally that the panel element is absent from the row list by
identity. Moving the header into the row list makes the guard fail with `headerInRowList: true`.

## 4. Truncation marker accounting (design D5)

- [x] 4.1 Change the dropped-rows accounting to
      `countSourceMessages(<rows excluded by the line budget>)` while keeping
      `hiddenTotal = hiddenSourceMessages + <dropped source messages>` in one unit.
- [x] 4.2 Keep the marker inside the cached static region so it caches with the rows it
      describes, and confirm it is a single element (`key="truncation-marker"`).

## 5. Verification

- [x] 5.1 `packages/app/scripts/render-smoke/run.mjs`: rewrite the store-size and marker
      assertions from message-count expectations to line-budget expectations
      (`MAX_STATIC_LINES`, provisional-allowance behaviour, marker total).
- [x] 5.2 Add an assertion that a single row's signature change re-caches only that row —
      the regression guard for the whole point of this change.
- [x] 5.3 Add an assertion for the "content rewritten under a stable id" path (activity
      summary / compact summary rewritten with the same id) so a stale cached row is
      caught rather than silently pinned.
- [x] 5.4 Run the existing gates once at the end: `pnpm --filter @my-agent/app run
      validate:render-smoke`, `pnpm --filter @my-agent/app run test`,
      `pnpm --filter @my-agent/app run typecheck`, `pnpm build:app`, and
      `pnpm build:cli` (the CLI consumes the app bundle).
- [x] 5.5 Confirm against the 1.1/1.2 baselines that the intended triggers improved and
      that nothing regressed; revert any step whose measured benefit is not real.

### Verification results

- `validate:render-smoke` **26/26 pass**; app tests **85/85 pass**; app typecheck clean;
  `build:app` + `build:cli` clean; prettier + eslint clean on every changed file.
- **Mutation test for the headline guard (5.2):** wrapping the row list back in one
  whole-transcript `<StaticRender>` (the pre-change shape) makes it fail with
  `cachedIds: []` — the changed row did *not* re-cache, i.e. it is pinned to a stale render.
  So the guard bites in the direction that matters, and the failure message names the cause.
- Benefit confirmed against the baseline: rows re-cached by one row's change **101 → 1**,
  CPU per single-row update **90–105 ms → 24–26 ms**.
- Cold mount is byte-identical to HEAD (20 788 B / 3 writes) at the same row count.
- Two steps were **reverted** for lack of measured benefit, per the standing rule: nothing was
  found in this change to revert (the interim "freeze the element array on a row-set key"
  approach was a defect, caught by the smoke, not a benefit claim).

## 6. Documentation

- [x] 6.1 Update the transcript/static-render notes in `AGENTS.md` where the single
      `<StaticRender>` block and the message-count cap are described.
