## 1. Declare the order and record load sequence

- [x] 1.1 Add `order?: number` to `ExtensionAPI` in `packages/core/src/agent/extension/types.ts`, with a doc comment stating the direction (lower runs first), the default (`0`), and the four surfaces it governs
- [x] 1.2 Normalize at read time: a non-finite/absent `order` resolves to `0` in one place, so no consumer repeats the check
- [x] 1.3 Record each extension's load sequence in `ExtensionRunner` at the moment `loadExtension` registers it — never re-derive it from the loader's directory scan
- [x] 1.4 Give every extension a resolved `{ order, loadSequence }` pair on load, and re-resolve it on re-enable (disable → enable must restore position, not append to the end)

## 2. Apply the stable sort to each governed surface

- [x] 2.1 Add one shared comparator (`(order, loadSequence)`) so the four surfaces cannot drift in direction or tie-break
- [x] 2.2 `AgentEventBus.onIntercept` / the scope node's interceptor array: keep the array **sorted on mutation**, not sorted inside `intercept` — `intercept` runs on every tool call and must keep walking a plain array (see design R1)
- [x] 2.3 `MessageTransformerRegistry`: chain in resolved order instead of `Map` insertion order; keep the existing ownership copy, error containment, and invalid-return handling untouched
- [x] 2.4 `toolStacks` same-name resolution: make `stack[stack.length - 1]` reflect resolved order, and check the replace path (`own !== -1`) still replaces in place for the *same* extension
- [x] 2.5 `contextProviders`: walk in resolved order so `<ctx kind=...>` section position is a function of declared order, not load order
- [x] 2.6 Confirm by inspection that `observe` / `observeAny`, `ctx.ui.render`, `registerCommand`, `registerFlush`, `registerExitFlush` read no order (design D4)

## 3. Report the effective order

- [x] 3.1 Extend `ExtensionInfo` with the effective order and return `getExtensionInfos()` in dispatch order
- [x] 3.2 Surface it in `packages/app`'s extension panel (`ExtensionPanel.tsx` via `use-extension-panel.ts`) so a conflict is visible at runtime
- [x] 3.3 Keep the catalog honest under disable: a disabled extension leaves the list without shifting the others' reported positions

## 4. Built-in extensions adopt the mechanism

- [x] 4.1 Audit the six built-in extension factories (LSP, Skills, Memory, MCP, Code Mode, log) for an implied position; declare `order` only where a real dependency exists, and leave `0` otherwise so behavior is unchanged
- [x] 4.2 Update the authoring skill (`packages/core/src/agent/skills/builtin/write-extension.md.ts`) with the direction, the tie-break, the governed surfaces, and the cancellation/position warning
- [x] 4.3 Update `packages/core/ARCHITECTURE.md` with the order contract in one place (agent-lifecycle-events requires the doc states direction, tie-break, governed and non-governed surfaces)

## 5. Vocabulary and naming debt

- [x] 5.1 Register the two new terms in the authoring surface so they are not coined inline: **"dispatch order"** (distinct from the existing *load order*, *first-wins* / *last-writer-wins*) and **"load sequence"** (the recorded tie-break key, distinct from the loader's *discovery order*)
- [x] 5.2 State the direction mismatch explicitly wherever both rules appear together: the loader's `first-wins` for a duplicated extension id and the tool-resolution `highest-order-wins` are *resolution* rules, while interceptor/transformer order is a *dispatch* rule
- [x] 5.3 Confirm (already checked: only `builtin-skills` has a same-name shadowing rule, and it governs the skill registry rather than extension tools) that no spec previously owned same-named extension tool resolution, and state in the proposal's Impact that this change is the first to define it
- [x] 5.4 Confirm the `paths.ts` citation in `design.md` D1 (verified: `extension/paths.ts:17` is the "later registrations with the same id win" comment, so the direction contrast D1 draws is against a real location)

## 6. Validation

- [x] 6.1 Add `packages/core/scripts/validate-extension-order.mjs`, asserting against **observed dispatch** (not a registry's internal array): declared order overrides load order; equal orders preserve load order; a negative order beats the default beats a positive one
- [x] 6.2 Cover cancellation position: an early cancelling interceptor suppresses a later one, while an earlier mutating interceptor is still observed by a later canceller
- [x] 6.3 Cover the neutrality claims: observers and render slots are unaffected by declared order
- [x] 6.4 Cover lifecycle: disable does not reshuffle the remainder, re-enable restores position, catalog order matches dispatch order
- [x] 6.5 Prove each assertion by inversion — revert the sort at one surface and confirm the corresponding assertion fails (per repo validator discipline); leave the others green
- [x] 6.6 Run `pnpm build` once, then `node packages/core/scripts/run-all-validators.mjs --all` and `pnpm typecheck` / `pnpm lint`, recording the results
