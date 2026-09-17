# Tasks

## 1. Types and registration surface

- [x] 1.1 `packages/core/src/agent/extension/types.ts` — add `MessageTransformContext` (`extensionId`, `agentId`, `phase: "init" | "iteration"`, `messages`, `unsupportedPartTypes`, the raw `capabilities` set, one `modelHas*` boolean per `ModelCapability`, `abortSignal?`) and `MessageTransformer`
- [x] 1.2 Same file — add `registerMessageTransformer(fn): () => void` to `ExtensionContext`; document that it is **not** a bus interceptor and that return values are wire-only
- [x] 1.3 Same file — add `messageTransformers: string[]` (or equivalent) to `ExtensionRegistrations` so disable/destroy clears it
- [x] 1.4 Same file — re-export `MultimodalPartType` from `models/adapter/capability-message-utils.ts` so the context type does not redeclare the union

## 2. Runner: registry and lifecycle

- [x] 2.1 `packages/core/src/agent/extension/runner.ts` — per-extension transformer map; `registerMessageTransformer` implements replace-on-reregister + identity-checked disposer (mirror `registerContextProvider`, `runner.ts:716-723`)
- [x] 2.2 Same file — `hasMessageTransformers(): boolean` fast-path guard (analogous to `hasInterceptors`, `agent-event-bus.ts:160`)
- [x] 2.3 Same file — `applyMessageTransformers(ctx): Promise<ModelMessage[]>`: sequential in extension load order, each result chained, error → `warn` + retain last valid, non-array → `warn` + retain
- [x] 2.4 Same file — clear the transformer map in the disable path (`runner.ts:651-680` region) and in `destroyAll`

## 3. Wire the seam (dedicated middleware)

- [x] 3.1 New `packages/core/src/managers/middleware/message-transform-middleware.ts` — `createMessageTransformMiddleware`, a `context-transform` middleware that reads `config.messages`, awaits `applyMessageTransformers`, and returns the replacement array. It MUST NOT reach into `compaction` (no cache bypass, no keep-policy change): `compaction-middleware.ts` is deliberately left untouched
- [x] 3.2 `packages/core/src/managers/middleware/phase.ts` — add `"message-transform"` to `CANONICAL_MIDDLEWARE_ORDER` immediately after `"compaction"`, with the adjacency comment. This is the first pipeline addition since the four-phase pipeline landed (12 → 13 middlewares), so the snapshot is intentionally updated
- [x] 3.3 `packages/core/src/managers/run-agent.ts` — assemble the new middleware immediately after `createCompactionMiddleware`. Phase sorting cannot order two middlewares in the same phase, so the array position decides the real order; `validate:middleware-order` asserts the adjacent pair against the pipeline `buildAgentRunner` actually assembles
- [x] 3.4 Pass the full capability context: `unsupportedPartTypes` via `unsupportedMultimodalPartTypes(usage)`, the raw set via `usage.getCapabilities()`, and one `modelHas*` boolean per `ModelCapability` via `usage.hasCapability` — equal to what `messagesForModelCapabilities` uses at run entry. Safe to read per call: capabilities are only written at bootstrap and on model switch (`agent-factory.ts:86-92`, `managed-agent.ts:834-840`), never mid-run

## 4. Zero-overhead guarantee

- [x] 4.1 Assert (by script) that with no transformer registered the middleware returns no config change, so the pipeline behaves exactly as before: no extra projection, no array copy, cached identity preserved
- [x] 4.2 Confirm the projection cache is still consulted on the no-transformer path (the seam returns early and never touches `compaction`)
- [x] 4.3 Confirm a transformer's returned array replaces the wire: TanStack applies it via top-level shallow merge (`tmp/tanstack-ai/.../middleware/compose.ts:169`) then assigns `this.messages = config.messages` directly (`.../chat/index.ts:4370`), so identity is what decides replacement

## 5. Ownership and placement guards

- [x] 5.1 Add a guard that fails if a transformer registered at the wire seam stops being invoked on iteration ≥ 2 (after a tool result lands on the channel). This is the exact failure mode that already exists for `max-tokens-continue`; a `config.messages`-only seam passes iteration 1 and silently fails afterwards
- [x] 5.2 Add a guard for the shared-array hazard: the array handed to a transformer must not be the array the projection cache retains, or an in-place edit leaks and the NEXT call silently stops transforming
- [x] 5.3 Verify both guards actually bite, by mutation: (a) remove the ownership copy → both new cases red; (b) copy the outer array only (`slice()`) → the retained-array case still red; (c) move the middleware before `compaction` in `buildAgentRunner` → the order guard red. Do not accept a guard that only turns other assertions red

## 6. Dev exports and validation scripts

- [x] 6.1 `packages/core/src/dev/dev-managers.ts` — export the new runner entry points, plus `buildAgentRunner` so the order guard can drive the real pipeline assembly
- [x] 6.2 `packages/core/scripts/validate-extension-message-transform.mjs` — cover: registration/disposer/replace semantics; chaining order; throwing transformer does not abort; invalid return ignored; void return; ownership (in-place edit stays out of the retained array; a repeated call still transforms); wire-only; zero-overhead path; placement
- [x] 6.3 Same script — **multi-iteration coverage**: assert the transformer is invoked on iteration ≥ 2, i.e. after a tool result lands on the channel. This is the case a `config.messages`-only seam would silently fail
- [x] 6.4 `packages/core/scripts/validate-middleware-order.mjs` — drive `buildAgentRunner` and assert the transform runs immediately after `compaction` in the assembled pipeline; the previous check read a duplicated factory list and could not observe an assembly relocation
- [x] 6.5 `packages/core/package.json` — the new script is registered; no separate placement script is kept (it duplicated `validate:middleware-order` §4)

## 7. Documentation

- [ ] 7.1 `packages/core/ARCHITECTURE.md` §8.5 (`:799-811`) — describe `registerMessageTransformer`: position in the wire-build order (the dedicated middleware immediately after `compaction`), wire-only contract, per-call invocation, ownership boundary (message objects copied, parts not), failure isolation; explicitly separate it from the bus-backed interceptor list
- [ ] 7.2 Same file — leave the two interceptor pattern lists (`:756`, `:801`) unchanged (do **not** add a message-transform entry); add `message-transform` to the middleware list instead
- [ ] 7.3 `AGENTS.md` — extension section (`:296-306`, `:450-456`) gains the new registration API; Agent Event System table (`:511-533`) unchanged
- [ ] 7.4 Prettier-format every markdown file touched

## 8. Verification

- [ ] 8.1 `pnpm --filter @my-agent/core run validate:middleware-order` — must pass with the intentionally updated 13-middleware snapshot and the adjacency check against the real assembly
- [ ] 8.2 `pnpm --filter @my-agent/core run validate:extensions-middleware` — must still pass
- [ ] 8.3 `pnpm build:core`
- [ ] 8.4 `pnpm typecheck`
- [ ] 8.5 Lint changed files only
- [ ] 8.6 Run the new `validate:extension-message-transform` script and record output

## 9. Acceptance

- [ ] 9.1 An extension can replace an `image` content part with text produced by an out-of-process call, and the model receives the text — demonstrated by the validation script
- [ ] 9.2 The same transform applies on the second and later iterations of the run
- [ ] 9.3 With no transformer registered a run's wire is byte-identical to today (seam returns no config change; cache branch taken)
- [ ] 9.4 Channel messages and persisted session contain the original media part, not the transformed text
- [ ] 9.5 ARCHITECTURE §8.5 and the spec text agree on: invocation points, wire-only semantics, the ownership boundary, the post-projection observation boundary, the server-side execution location in remote-session hosts, and that the transform is not an event-bus dispatch mode
- [ ] 9.6 The iteration ≥ 2 guard (5.1) fails when the seam is mutated to a `config.messages`-only position; the order guard (5.3c) fails when the middleware is relocated; the ownership guard (5.2) fails when the copy is removed or shallow

