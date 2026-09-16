# Change: Per-item static render caching for the transcript

## Why

The transcript's completed history is cached as **one** `<StaticRender>` block
(`packages/app/src/layout/Content.tsx`): a single `Region` whose `deps` include a
*global* `toolCallsSignature`, plus `theme`, `mode`, `width` and the init-loading flag.
Any one of those changing invalidates the whole cached block, so a tool-state update on
one old row re-lays-out and re-renders the entire transcript.

Measured on the real components (`MessageList` + `Content`, 421-message fixture,
120×40 viewport):

| trigger | bytes re-emitted |
|---|---|
| `toolCallsSignature` change | 11 300 (full block) |
| transcript display mode switch | 20 540 |
| terminal resize | 38 870 |

The truncation budget has the same shape problem. `MAX_STATIC_PARTS = 100` counts
**messages**, but the worker's retention window (`maxScrollbackLength`, default 1000) and
the screen itself are measured in **lines**. Measured: 60 messages at 12 rows each is
already a 1440-line tree — over the cap while still under the message budget.

The fork already provides the primitives to fix both: `<StaticRender>` caches per
instance, and its `onRender(node)` callback reports the measured node once cached.
Verified against our installed `@my-react/react-terminal@0.0.31` with a 12-item
per-item-`StaticRender` tree: perturbing one item's `deps` re-cached **only that item**
(`[5]`) and wrote **0 bytes** to the terminal, and `onRender` reported per-item heights.

## What Changes

- **Per-item cache unit.** Each rendered history row becomes its own `<StaticRender>`
  (width = terminal width, `deps` = that row's signature + the things that genuinely
  affect its paint: width / mode / theme). The single whole-transcript block in
  `Content.tsx` is removed. Updating one row no longer invalidates the others.
- **Per-item invalidation signature replaces the global one.** The static list carries
  one signature per row; a row is re-cached only when its own signature changes. The
  global `toolCallsSignature` stops being a dependency of the cached block.
- **Line-based truncation budget.** `MAX_STATIC_PARTS` (message count) is replaced by a
  line budget over **measured** per-row heights, collected from `onRender`. Rows are kept
  newest-first until the budget is exhausted; the dropped count feeds the existing
  single-unit truncation marker.
- **Height metadata store.** A small store mirrors each row's measured height keyed by
  message id, so the budget can be computed without re-rendering.
- **Unmeasured rows are never silently dropped.** Rows whose height is not yet known are
  granted a provisional allowance so a cold render (resume / `/clear`) cannot truncate
  history it has not measured yet.

Out of scope (deliberately deferred): converting the transcript to a scroll viewport
(`overflowToBackbuffer` + virtualization, as gemini-cli does). That is the larger change
that would let scrollback be a true scrolling history; this change only removes the
whole-block rebuild and aligns the budget's unit with the screen's.

## Capabilities

### New Capabilities

- `transcript-static-render`: per-row static caching of the completed transcript — the
  cache unit, its invalidation signature, the line-budget truncation policy, and the
  requirement that truncation stays conservative while heights are unknown.

### Modified Capabilities

(none — no existing spec covers transcript rendering or scrollback retention)

## Impact

Affected code:

- `packages/app/src/components/MessageList.tsx` — per-row `<StaticRender>` wrapping, line
  budget selection, marker accounting moved to line-budget semantics
- `packages/app/src/layout/Content.tsx` — drop the single whole-transcript `<StaticRender>`
- `packages/app/src/hooks/use-static.ts` — carry per-row signatures alongside the row list
- `packages/app/src/utils/get-messages.ts` — expose per-row signatures instead of one
  joined `toolCallsSignature` (the per-message fingerprint already exists as
  `computeMessageRenderSignature`)
- new store for measured per-row heights (sibling of the existing `use-static` store)
- `packages/app/scripts/render-smoke/run.mjs` — the store-size and marker assertions move
  from message-count to line-budget expectations

Constraints and risks:

- No change to `maxScrollbackLength` and no change to the scroll/backbuffer model.
- The truncation marker must stay in **one unit**. Today it reports messages; with a line
  budget it must report the messages behind the dropped rows (the existing
  `countSourceMessages` helper already converts rows back to source messages).
- Cold-start conservatism is load-bearing: a resume that measures nothing yet must render
  at least as much history as today, never less.
