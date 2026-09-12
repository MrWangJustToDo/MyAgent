# Proposal: Middleware Phase Pipeline

## Why

`buildAgentRunner` (`packages/core/src/managers/run-agent.ts:126-214`) assembles 12 middlewares in a bare array. The ordering constraints between them — prompt-cache must run after turn-context / tool-compact so it annotates the final wire payload; compaction / tool-compact / turn-context transform messages in a dependent chain — exist only as inline comments. Nothing prevents a reorder or a mis-placed new middleware; a wrong spot (e.g. prompt-cache before turn-context) silently corrupts prompt-cache keying and is very hard to trace.

## What Changes

- Introduce a declared `phase` on each middleware: `observe` → `context-transform` → `tools` → `wire-annotate` (four stages matching the existing responsibility split; stable declaration order within a phase).
- `buildAgentRunner` sorts middlewares by phase; the resulting order is **provably identical to today's array** (locked by an order-snapshot test before the change lands).
- Middlewares without a declared phase trigger a dev-time warning (and the snapshot test fails), so a new middleware cannot be added silently unordered.
- Comment-only ordering notes in `run-agent.ts` are replaced by the phase declarations; a `validate:middleware-order` script asserts the canonical order snapshot.

## Capabilities

### New Capabilities

- `middleware-phase-pipeline`: Declared-phase assembly rules for agent-run middlewares — the phase vocabulary, sorting semantics (stable within phase), dev-time warning for undeclared phases, and the canonical order snapshot.

### Modified Capabilities

<!-- None: no existing spec constrains middleware assembly order. -->

## Impact

- `packages/core/src/managers/middleware/*.ts` — each of the 12 middleware factories gains a `phase` declaration (type augmentation of the return object, or a parallel registry).
- `packages/core/src/managers/run-agent.ts` — `buildAgentRunner` sorts by phase; comment-only ordering notes removed.
- `packages/core/scripts/validate-middleware-order.mjs` — new order-snapshot validation; package.json gains `validate:middleware-order`.
- No host-facing behavior change (sorted order === current order); wire format, events, and persistence untouched.
