# Change: Extension-declared execution order

## Why

Every ordering-sensitive extension surface is currently ordered by **one variable nobody controls**:
the order extensions happen to load. `registerInterceptor` appends to an array that
`AgentEventBus.intercept` walks (`agent-event-bus.ts:162`), `registerMessageTransformer` chains in
registration order, and a same-named tool resolves to the last registrant (`runner.ts:308`). Load
order is fixed by core — disk extensions, then config extensions, then LSP, Skills, Memory, MCP, Code
Mode (`agent-factory.ts:227-359`) — so an extension cannot say where it belongs, and a permission
gate, an audit logger, and a payload rewriter all land wherever their load category put them.

The failure is silent and the stakes are not symmetric. An interceptor that cancels
(`return false` / `skipDefault`) short-circuits **every remaining interceptor**, so "which gate runs
first" decides whether the others run at all: `examples/extensions/demo-guard.mjs` is a
`tool:before:run_command` permission gate, and any other extension registering that hook either
runs before it (bypassing the gate) or after it (never running, because the gate denied). Nothing in
the API lets an author express the intent, and nothing surfaces the conflict.

## What Changes

- Add an optional **`order?: number`** to `ExtensionAPI`. Lower runs first. Absent means `0`.
- Ordering becomes a **stable sort** over `(order, load sequence)`, applied to every
  registration-order-sensitive surface:
  - **interceptors** — the bus's dispatch walk
  - **message transformers** — the chain each message set passes through
  - **extension tools** — which registrant wins a same-named tool
  - **turn-context providers** — the order of `<ctx kind=...>` sections in a turn's context
- Ordering is **presentation-neutral and observable-neutral**: it does not change observer
  registration order, `ctx.ui.render` slots (already sorted by key), or `registerFlush` /
  `registerExitFlush` (already phase-scoped).
- Report the effective order in `ExtensionInfo`, so the extension panel shows where an extension
  actually runs instead of leaving the sequence invisible.
- Document the direction and the tie-break in the extension-authoring skill.

No **BREAKING** changes: every extension without `order` keeps today's relative order exactly, since
equal keys preserve load order under a stable sort.

## Capabilities

### New Capabilities

- `extension-ordering`: the `order` declaration, the stable-sort tie-break, which surfaces it
  governs, and the neutrality guarantees for the surfaces it must not touch.

### Modified Capabilities

- `agent-event-bus`: the interceptor dispatch requirement currently says "ordered by registration".
  It becomes "ordered by declared order, then registration", and the short-circuit clause must state
  that cancellation ends the chain for everyone after the cancelling extension.
- `extension-message-transform`: the chaining requirement says "in extension load order". It becomes
  the declared order with the same tie-break.
- `agent-lifecycle-events`: gains the loading/dispatch-order contract — extensions are dispatch-ordered
  by `order`, and the effective order is reported through the extension catalog.

## Impact

- **Affected specs**: `agent-event-bus`, `extension-message-transform`, `agent-lifecycle-events`
  (modified); `extension-ordering` (new).
- **Affected code**: `packages/core/src/agent/extension/types.ts` (`ExtensionAPI.order`),
  `runner.ts` (registration order per surface, `getExtensionInfos`), `agent-event-bus.ts` (the
  interceptor array and its walk), `message-transformer-registry.ts` (the chain), `agent-factory.ts`
  (load sites that must carry the declared order), `packages/app` (extension panel renders the
  effective order).
- **Unaffected by design**: observer subscriptions, the extension UI surface, `registerFlush` /
  `registerExitFlush`, and the extension loader's discovery order (which decides *which* extension a
  same-id file resolves to, a separate concern).
- **Newly specified, not previously owned**: same-named extension tool resolution has no existing
  spec owner — `builtin-skills` defines a same-name shadowing rule, but for the skill registry, not
  for extension tools. This change is the first to state it, so `extension-ordering` carries the
  requirement rather than modifying a spec that never described it.
- A new `validate:extension-order` script is required, per the repo's rule that a capability lands
  with a validator whose assertions fail when the behavior is reverted.
