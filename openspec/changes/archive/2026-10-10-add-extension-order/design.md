## Context

Three extension surfaces are ordered by the same uncontrolled variable — the order extensions
happen to load — and a fourth is ordered the same way by accident.

| Surface | Storage | Walk | Why order matters |
|---|---|---|---|
| `registerInterceptor` | `EventBusScopeNode.interceptors: Array` (`agent-event-bus.ts:28`) | sequential `for` (`:162`) | A cancelling interceptor short-circuits the rest (`:177`), so position decides **whether later interceptors run at all** |
| `registerMessageTransformer` | `Map<extensionId, transformer>` | insertion order (`message-transformer-registry.ts`) | Each transformer receives the previous one's output — a chain, not a fan-out |
| `registerTool` (same name) | `toolStacks: Map<name, Array<{ownerId, def}>>` | `stack[stack.length - 1]` (`runner.ts:308,316`) | Last registrant wins; a replacement has to know its position |
| `registerContextProvider` | `Map<extensionId, provider>` | insertion order (`runner.ts:335`) | Sets the position of each `<ctx kind=...>` section in the turn context |

Load order is a hardcoded sequence in `agent-factory.ts:227-359`: disk extensions → config
extensions → LSP → Skills → Memory → MCP → Code Mode. It is not configurable, not visible to an
extension author, and not reported anywhere at runtime — `ExtensionInfo` carries no position.

The concrete conflict today: `examples/extensions/demo-guard.mjs` registers
`tool:before:run_command` as a **permission gate** and is a disk extension, so it loads first; LSP
registers `tool:after:read_file|write_file|edit_file` and loads later. A third-party extension that
also registers `tool:before:run_command` (an auditor, a second gate) cannot choose its side of the
gate — and if the gate denies, that extension never runs, because cancellation ends the walk.

Ordering also interacts with a documented guarantee that must not regress: `ARCHITECTURE.md` §3.3
records the middleware phase order, and `agent-lifecycle-events` asserts against the pipeline the
runner actually assembles rather than a hand-maintained list. Whatever ordering mechanism is chosen
has to be assertable the same way — against observed dispatch, not against a registry's internal
array.

## Goals / Non-Goals

**Goals:**

- Let an extension declare where it runs, on every surface where position is observable.
- Make the declaration's effect **deterministic and inspectable at runtime**, not just in source.
- Change nothing for an extension that does not declare an order — same relative sequence as today.
- Keep the mechanism one concept (a number) applied uniformly, so authors do not learn four rules.

**Non-Goals:**

- **Hook-level ordering** (the same extension wanting different positions for different hooks). The
  evidence is that order is decided by *load* order — a per-extension property — so per-hook
  granularity would answer a question nobody has asked yet. Deferred, not rejected: see D2.
- **Reordering core's own interception.** Core dispatches `tool:before:*` from
  `extensions-middleware.ts:45-64` and owns the approval outcome; extensions hook into that dispatch
  rather than competing with it. No core-registered interceptor exists to be ordered against (the
  only `onIntercept` caller in core is the extension-facing adapter, `bus-extension-event-bus.ts:24`).
- **Changing the loader's discovery order** (which of two same-id extension files wins). That is a
  resolution concern — first-found-wins already applies — and is orthogonal to dispatch order.
- **Re-prioritising observer delivery, extension UI slots, or flush callbacks.** They are not
  ordered by load order and must not become so (D4).

## Decisions

### D1 — `ExtensionAPI.order?: number`, lower runs first, absent means 0

The declaration goes on the extension, not on each registration, because the problem is a property
of the extension: "this is a security gate and must see the raw call" is not a per-hook opinion.
One number, one mental model, four surfaces.

**Direction: lower runs first.** Chosen for the two cases that motivated the change: a permission
gate wants to be early (`order: -100`) and a display/aggregation extension wants to be late
(`order: 100`). This mirrors established numeric-priority systems (process nice, HTTP middleware
chains) where the default sits in the middle and "before the default" reads as a negative number.
The cost is a documented asymmetry: this is the **opposite** of the loader's existing
"later registrations with the same id win" rule (`extension/paths.ts:17-21`), which is a
*resolution* rule (which file), not a *dispatch* rule (which position). D3 states the tie-break in
one place so the two never have to be reasoned about together.

*Alternatives rejected:*

- **Higher runs first** (z-index / CSS-like). Defensible, but it makes the common case — a guard —
  an extreme *positive* value (`order: 999`), and it collides with the tool-resolution rule in the
  same subsystem, inviting the wrong intuition.
- **A named tier enum** (`"security" | "normal" | "display"`). Rejected as premature: it hides the
  arithmetic that actually orders (two extensions in one tier still need a tie-break) while adding a
  vocabulary to freeze. A number is composable and needs no migration when a tier is added later.

### D2 — Ordering is per extension, not per hook

`registerInterceptor(event, handler, { order })` was considered and rejected. It is strictly more
expressive, but the expressiveness is unbacked: every ordering conflict we can name is between
extensions that want a consistent position (a gate is a gate on every hook it registers). Per-hook
granularity also multiplies the surface the validator must cover — four registries times N hooks —
for a capability with no consumer.

The door is left open: `ExtensionAPI.order` is the default for every registration the extension
makes, so a future `{ order }` option on `registerInterceptor` can *override* it as pure addition,
without a breaking change and without re-deciding the direction.

### D3 — Stable sort over `(order, load sequence)`; the tie-break is the existing order

Ordering is a **stable sort with the load sequence as the secondary key**, applied wherever a
registration-ordered sequence is walked. Consequence: an extension with no `order` (equivalently
`order: 0`) keeps exactly its current position relative to other undeclared extensions. This is what
makes the change additive — the 6 built-in extensions and every existing third-party extension are
unaffected unless they opt in.

The load sequence itself is assigned where the extension is loaded, at the moment the runner records
it — not read back from the loader's discovery order. The two are already the same in practice
(`agent-factory.ts` loads sequentially), but only the recorded sequence is a *dispatch* fact, and the
validator for this change must assert dispatch, not discovery.

`NaN` and non-finite values are treated as `0`: a bad number must not produce an unstable order
silently. Negative, zero, and positive are all valid; ties fall through to the sequence.

### D4 — The surfaces that must NOT be reordered, and why

Four registrations are order-insensitive today, and ordering them would be a behavior change
disguised as a feature:

| Surface | Why it is excluded |
|---|---|
| `ctx.events.observe` / `observeAny` | Observer dispatch is synchronous fire-and-forget; every observer sees the same already-final payload, and no observer can affect another. There is no "before". |
| `ctx.ui.render` | Slots are keyed and the host renders them with an explicit `.sort()` (`FooterExtensionSurface.tsx:12`), so publish order is already invisible. Sorting by extension order would *add* a coupling that does not exist. |
| `registerCommand` | Commands are looked up by name, never enumerated in dispatch order. |
| `registerFlush` / `registerExitFlush` | Phase-scoped (pre-teardown / pre-exit), not chained; each flush is independent, and the phase, not the position, is the contract. |

They still receive the extension's `order` for free if they later become sensitive, but no surface in
this change reads it for them.

### D5 — The effective order is reported, not just applied

`ExtensionInfo` gains the resolved position (see the `extension-ordering` spec for the exact field),
and `getExtensionInfos()` returns entries in **dispatch order**. Two consequences worth stating:

1. The extension panel (`Ctrl+Y`) shows where each extension runs, which is the only place a user
   can see an ordering conflict.
2. A validator can assert the contract from outside: register extensions with declared orders,
   observe the actual dispatch sequence, and compare — the same "assert against the assembled
   pipeline" discipline `extension-message-transform` already requires for its own position.

Reporting it also removes the class of failure that motivated the change: an order that is silently
different from what the author intended becomes visible.

## Risks / Trade-offs

- **A stable sort in a hot path.** `AgentEventBus.intercept` runs on every tool call and every
  lifecycle hook. The mitigation is that sorting happens **once per mutation**, not per dispatch:
  the array is re-sorted when an interceptor is registered or removed, and `intercept` keeps walking
  a plain array. The alternative — sorting inside `intercept` — would put an O(n log n) sort on every
  tool call for a list that is almost always static and tiny. This is the one place the
  implementation must not take the obvious route; it is called out in `tasks.md`.
- **`order` collides conceptually with the loader's "later wins".** Documented once in
  `extension-ordering` and once in the authoring skill (D3), so the two rules are read together only
  when someone is actually writing a resolution rule.
- **A mis-signed order is silent.** An author who writes `order: 100` meaning "early" gets a late
  extension. Mitigated by D5 (visible in the panel) and by the authoring skill stating the direction
  in its first sentence; not mitigated by a runtime warning, which would fire on every legitimate use.
- **Extension-level granularity may prove too coarse.** If a real need for a per-hook override
  appears, D2's deferral means it is additive — but the `order` *field* is then doing two jobs
  (default and override), which the spec must keep unambiguous. Recorded below.

## Open Questions

- **Per-hook override shape.** If per-hook ordering is ever needed (D2), should
  `registerInterceptor(hook, handler, { order })` *override* the extension's `order` or *add* to it?
  Override is the only reading that makes a single hook movable without moving the extension; adding
  would be incoherent. Confirm before implementing it — the `extension-ordering` requirement is
  currently written for extension-level order only.
- **Whether the six built-in extensions should declare anything.** Task 4.1 audits them, but a
  built-in may legitimately need a position (LSP's `tool:after:*` diagnostics should arguably follow
  every user post-processing hook). Declaring it is a behavior change for existing installs, so it is
  left to the audit rather than decided here.
