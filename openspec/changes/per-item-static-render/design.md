## Context

The completed transcript is cached by a single `<StaticRender>` in
`packages/app/src/layout/Content.tsx`. Its `deps` are
`[loading, width, validList.length, listSet, headerSet, dynamicKey, toolCallsSignature, theme, mode]`.
`toolCallsSignature` is produced by `computeToolCallsRenderSignature`
(`packages/app/src/utils/dedupe-tool-calls.ts`) which flat-maps **every** tool part in
the static source and joins them into one string — a global fingerprint. `listSet` and
`headerSet` are store revision counters bumped on every static-list rebuild.

Consequences, measured on the real components (421-message fixture, 120×40 viewport):

| trigger | bytes re-emitted |
|---|---|
| `toolCallsSignature` change | 11 300 (whole block) |
| transcript display mode switch | 20 540 |
| terminal resize | 38 870 |

Truncation uses `MAX_STATIC_PARTS = 100` counted in **messages**
(`packages/app/src/components/MessageList.tsx`), while the render worker's retention
window is `maxScrollbackLength` counted in **lines**
(`@my-react/react-terminal` `TerminalWriter.writeLines`, default 1000) and the screen is
lines too. Measured: 60 messages × 12 rows = a 1440-line tree, i.e. the line budget is
blown while the message budget is not.

The fork primitives this design relies on were verified against the installed
`@my-react/react-terminal@0.0.31`:

- `<StaticRender>` caches per instance; `setCachedRender` detaches the node's yoga
  children (`isYogaTreeDetached`), so a cached row is a flat `Region` plus one leaf.
- `onRender(node)` fires after the cache is produced (`pendingStaticRenderCallbacks`
  flushed from `prepareYogaTree`), i.e. heights are only knowable **after** a row has
  been rendered — never before.
- A 12-item tree of per-item `<StaticRender>`s, perturbing one item's `deps`, re-cached
  `[5]` only and wrote 0 bytes. `onRender` reported per-item heights (`0:3l … 11:6l`).

## Goals / Non-Goals

**Goals:**

- Invalidate one completed row without re-laying-out or re-rendering any other row.
- Express transcript truncation in the same unit the screen uses (lines), using
  **measured** heights where available.
- Keep the truncation marker honest in a single unit.
- Never truncate history a cold render has not measured yet.

**Non-Goals:**

- Changing `maxScrollbackLength` (stays at the fork default 1000).
- Introducing a scroll viewport / `overflowToBackbuffer` virtualization of the
  transcript (the larger gemini-cli-shaped change; separate proposal).
- Changing the reactive-store architecture, the session format, or the message pipeline.

## Decisions

### D1: Cache unit = one rendered row, not one message

A rendered row is the `<Box paddingX={1} marginTop={1}>` wrapper produced in
`MessageList`. The cache unit is that wrapper's subtree, matching what `StaticRender`
already caches as a flattened leaf.

*Why not one cache per message:* `MessageList` already derives rows from messages 1:1 for
the completed region (`visibleStaticMessages.map(...)`), so per-message and per-row are
the same set today. Framing the unit as the **row** keeps the spec honest if a future
projection splits one message into multiple rows (the dynamic side already does this via
`MessageView`).

*Why not a few grouped blocks:* partial grouping still couples unrelated rows; the
measured cost of one instance per row is a leaf yoga node each, and the fork is designed
for exactly this. gemini-cli's `VirtualizedList` uses one instance per item.

### D2: Per-row signature from the existing per-message fingerprint

`computeMessageRenderSignature` already exists (`dedupe-tool-calls.ts`) and fingerprints
role + every row-producing part's content, including tool state via
`encodeToolCallState`. The static list will carry `string[]` of these, computed inside
`getMessages` where the projection already runs (so it sees the same rows the renderer
will).

*Why not keep the global `toolCallsSignature`:* keeping it as a `deps` entry on each row
would make every row invalidate on every tool change — it would neutralize D1 entirely.

*Why not hash the rendered element:* element identity changes on every rebuild for reasons
unrelated to paint (new object literals), causing constant invalidation.

### D3: Line budget over measured heights with provisional allowances

New store `use-static-item-heights`, keyed by message id, written from each row's
`onRender`. Selection walks rows newest-first accumulating measured height until the
budget is exhausted. Unknown heights get `PROVISIONAL_ROW_LINES` (a conservative low
estimate) so a resume that has measured nothing renders at least as much as today and
never truncates what it cannot yet measure.

*Why measured over estimated-by-kind:* `onRender` gives exact values for free after the
first cache. Per-kind estimation (diff ≈ N lines, tool ≈ M lines) was the alternative;
it drifts as renderers evolve and cannot see wrapped text.

*Why newest-first with an unknown allowance:* the spec requires conservative behavior on
cold start; truncating unmeasured rows would be a silent history loss, which is the
failure mode this change exists to remove.

*Budget value:* `MAX_STATIC_LINES = 1200`, deliberately ABOVE the worker's 1000-line
scroll-back window rather than below it. Three windows exist and the value was chosen against
only the third: (1) the terminal viewport (~40 lines), (2) the first write after a full repaint
(keeps `maxScrollbackLength + rows`), and (3) the append / scroll-back window (keeps the
trailing `maxScrollbackLength` = 1000 lines, drops the oldest). Overshooting (3) means the top
of the region stops being reachable, which is bounded; staying under it would mean dropping the
newest rows the user is reading, which is worse. Cost (2) is accepted and measured away for
ordinary sessions: the 60-turn fixture is ~438 lines / 2.20 lines per row, well inside that
window. A provisional value of 600-800 was the starting guess before measurement; the shipped
value comes from render-smoke measurements, not a design-time constant.

### D4: Store gains per-row signatures; global signature removed from the cache path

`use-static` already holds `header` / `list` / `headerSet` / `listSet`. It gains
`itemSigs: string[]`, written in the same effect that rebuilds the list so the two can
never diverge. `toolCallsSignature` is deleted from the store and from `Content`'s `deps`
once per-row signatures are the invalidation source; `computeToolCallsRenderSignature`
stops being part of `computeStaticRenderSignature`.

*Why keep `listSet`/`headerSet`:* they still drive `Content`'s need to re-collect the
header row and the list array itself; they no longer need to be `deps` of a cache that
spans many rows.

### D5: Truncation marker accounting stays in messages

The existing `countSourceMessages(staticMessages.slice(0, -MAX_STATIC_PARTS))` becomes
`countSourceMessages(<rows dropped by the line budget>)`, preserving the
`hiddenTotal = hiddenSourceMessages + <dropped source messages>` shape. The marker remains
inside the static region so it caches with the rows it describes.

## Risks / Trade-offs

- **Per-row instances increase yoga/flush work.** Each cached row costs one leaf yoga node
  and one `pendingStaticRenderCallbacks` entry that is flushed once. Mitigation: this is
  a one-time cost per row that is subsequently skipped entirely; the render-smoke
  assertions compare cold-mount and steady-state output before/after.

- **Cold start (resume / `/clear`) may render more rows than the steady state.** That is
  the intended conservative direction, but it means the cold frame can exceed the line
  budget until measurements arrive. Mitigation: provisional allowance is deliberately
  small; verification must show the cold frame does not exceed the worker's retention
  window in the exercised fixtures.

- **Signature mismatch is silent.** If per-row signatures fail to change when content
  changes, a row keeps a stale render — the `StaticRender` memoization trap. Mitigation:
  spec scenario "content rewritten under a stable id"; exercise the compact/activity
  summary rewrite path explicitly, since activity summaries are rewritten under a stable
  id.

- **Removing the global signature could regress a case it was accidentally covering.**
  Mitigation: `computeStaticRenderSignature` keeps the mode/window/id components; only the
  tool fingerprint is replaced. Verification must diff the store rows and the emitted
  bytes for a tool-state update before/after.

- **render-smoke assertions are unit-coupled.** `expectedStoreRows` currently assumes a
  message-count cap. Mitigation: the assertion is rewritten in the same change, and the
  smoke is the acceptance gate for the budget semantics.

## Migration Plan

1. Land D1+D2+D4 together (cache unit + per-row signatures + store shape). This step alone
   removes the whole-block rebuild and is independently verifiable by the
   `toolCallsSignature`-trigger byte measurement dropping to ~0.
2. Land D3 (line budget + heights store), switching `MAX_STATIC_PARTS` →
   `MAX_STATIC_LINES` and updating the marker accounting (D5) and the render-smoke
   assertions in the same step.
3. Rollback: each step is a self-contained source revert; no persisted data, no wire
   format, no dependency changes.

## Open Questions

- Exact `MAX_STATIC_LINES` and `PROVISIONAL_ROW_LINES`. Resolve by measuring the rendered
  line distribution of a recorded long session (`packages/app/scripts/render-smoke` accepts
  a session jsonl) and choosing a budget that keeps the steady-state tree under the
  worker's window with margin.
- Whether `theme` must remain a per-row `deps` entry (a theme switch legitimately repaints
  every row) or can be handled by a single explicit cache-generation bump. Current
  intent: keep it per-row for simplicity; a theme switch is rare and a full repaint is the
  correct outcome.
