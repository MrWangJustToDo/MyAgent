## ADDED Requirements

### Requirement: Generic extension render surface

`ExtensionUI` SHALL expose `render(surface: string, key: string, payload: ExtensionRenderPayload | null)` as the single entry point through which an extension draws anything into the host UI. The host SHALL render each `(surface, key)` slot independently and SHALL combine slots deterministically.

#### Scenario: Publish into a surface

- **WHEN** an extension calls `ctx.ui.render("footer", "git", payload)`
- **THEN** the host renders `payload` in the `footer` surface under the key `git`

#### Scenario: Multiple keys coexist

- **WHEN** two extensions render into the same surface with different keys
- **THEN** both slots are rendered (stable, deterministic order) and neither replaces the other

#### Scenario: Republish replaces the same slot

- **WHEN** an extension renders again with the same `surface` and `key`
- **THEN** the previous payload for that slot is replaced in place and no duplicate slot appears

#### Scenario: Same key across extensions is last-writer-wins

- **WHEN** two extensions render into the same `surface` and `key`
- **THEN** the later publish owns the slot, and disabling the earlier extension leaves that slot intact

#### Scenario: Null or empty removes the slot

- **WHEN** an extension calls `render(surface, key, null)` or publishes an empty/whitespace-only raw string
- **THEN** that slot is removed from the surface

#### Scenario: Unknown surface degrades safely

- **WHEN** an extension renders into a surface the host does not support
- **THEN** the host ignores that slot without rendering anything and without affecting other surfaces

#### Scenario: Visible in every agent status

- **WHEN** the agent status is `running`, `thinking`, `responding`, `compacting`, `waiting`, `awaiting_user` or `idle`
- **THEN** rendered slots are still displayed

### Requirement: Raw text render payload

A render payload MAY be a plain string, which the host SHALL render verbatim, preserving styling (SGR) escape sequences and line breaks, without structural parsing. The host SHALL neutralize destructive terminal control sequences (screen clear, cursor movement/positioning, window title, hyperlink) so a payload cannot disrupt the host layout.

#### Scenario: Styling ANSI is preserved

- **WHEN** an extension publishes a string containing SGR styling escape sequences
- **THEN** the host renders those sequences as styled text rather than literal characters

#### Scenario: Destructive ANSI is neutralized

- **WHEN** an extension publishes a string containing destructive control sequences (e.g. screen clear, cursor movement, window title, hyperlink)
- **THEN** the host neutralizes those sequences while preserving styling sequences, so the payload cannot disrupt the host layout

#### Scenario: Line breaks are preserved

- **WHEN** an extension publishes a multi-line string
- **THEN** the host renders it as multiple lines

### Requirement: Layout primitive tree payload

A render payload MAY be a node tree built from a closed set of layout primitives: `text`, `row`, `column`, `box`. The host SHALL render the tree with a single generic renderer, and SHALL NOT define any domain-specific widget type.

#### Scenario: Text node renders its value

- **WHEN** a `text` node carries a `value` (which may contain ANSI)
- **THEN** the host renders the value verbatim

#### Scenario: Row and column lay out children

- **WHEN** a `row` or `column` node carries children
- **THEN** the host lays out the children in that direction, in order, honoring an optional `gap`

#### Scenario: Box adds an optional container

- **WHEN** a `box` node carries `border` and/or `padding`
- **THEN** the host renders a container with that border/padding around its children

#### Scenario: Unknown node type is ignored

- **WHEN** a node has a `type` outside the closed primitive set
- **THEN** the host ignores that node (it does not render the type name) and still renders the rest of the tree

### Requirement: No predefined extension components

The host SHALL NOT expose domain-specific or otherwise predefined rendering components to extensions (for example a progress-bar/label widget vocabulary, a predefined status-line API, a predefined confirm component, or a color helper). All extension visuals SHALL flow through the generic render surface.

#### Scenario: No widget vocabulary

- **WHEN** an extension wants to draw a progress indicator
- **THEN** it composes it from the generic render primitives or raw text, and the host exposes no dedicated progress widget to it

#### Scenario: No predefined status or confirm component

- **WHEN** an extension wants persistent status text or a confirmation prompt
- **THEN** persistent text is expressed through the render surface, and no predefined status/confirm component is available to the extension

### Requirement: Bounded render payloads

The host SHALL bound render payloads and degrade safely when a payload exceeds limits, so an extension cannot exhaust layout or serialization budgets.

#### Scenario: Oversized tree degrades

- **WHEN** a layout tree exceeds the host's depth, node-count, or text-length limits
- **THEN** the host drops or truncates the excess content and continues rendering the rest without failing

#### Scenario: Non-serializable payload is rejected

- **WHEN** a payload cannot be represented as plain serializable data (circular reference, function-valued property, BigInt, …)
- **THEN** the host rejects it at publish time in its entirety — no part of it is retained, replayed to a late subscriber, or forwarded to a remote host — and the UI keeps rendering normally

### Requirement: Render slot lifecycle ownership

All render slots SHALL be attributed to the publishing extension's owner id, and the host SHALL clear an extension's slots when that extension is disabled or destroyed, so stale content cannot outlive the extension.

#### Scenario: Disable clears the extension's slots

- **WHEN** an extension that published render slots is disabled
- **THEN** all slots it owned are removed and other extensions' slots are unaffected

#### Scenario: Destroy clears the extension's slots

- **WHEN** an extension that published render slots is destroyed
- **THEN** all slots it owned are removed

### Requirement: Render update throttling and dedupe

Incoming render updates SHALL be coalesced (throttled) and updates that do not change the rendered content SHALL be skipped, so high-frequency publishing cannot cause unbounded re-renders.

#### Scenario: Rapid publishes are coalesced

- **WHEN** an extension publishes many updates within the throttle window
- **THEN** the host coalesces them and the rendered result reflects the latest payload

#### Scenario: Identical payload does not re-render

- **WHEN** an extension publishes a payload identical to the currently rendered one for that slot
- **THEN** no re-render is triggered

### Requirement: Transient extension notifications

`ExtensionUI` SHALL expose `notify(message: string, level?: "success" | "info" | "error")` as the host-native, **self-clearing** notification path. Hosts SHALL surface it without persisting it in a surface slot, and the notification SHALL reach hosts as a `{ type: "notify", message, level }` event on the extension-UI channel.

#### Scenario: Notification reaches the host

- **WHEN** an extension calls `ctx.ui.notify("LSP: typescript ready", "success")`
- **THEN** the extension-UI channel carries `{ type: "notify", message: "LSP: typescript ready", level: "success" }` and the host surfaces it

#### Scenario: Notifications are transient

- **WHEN** the host has shown a notification
- **THEN** it clears on the host's own schedule and never occupies a persistent surface slot

### Requirement: Extension UI context snapshot

The host SHALL expose a context snapshot to extensions describing current session, model, usage, and workspace state, so extensions can render data-driven content.

#### Scenario: Context is available on demand

- **WHEN** an extension calls `ctx.ui.getContext()`
- **THEN** it receives the current snapshot including at least the model display name, agent status, token usage, workspace root/branch, and session name

#### Scenario: Context updates are pushed

- **WHEN** relevant session state changes (status, usage, model, or workspace)
- **THEN** an extension subscribed to `context` notifications receives an updated snapshot without polling

### Requirement: Extension UI failures are contained

A failure while publishing or rendering extension UI SHALL NOT break the host UI or propagate into the agent loop.

#### Scenario: Rendering failure is silent

- **WHEN** rendering an extension payload throws or produces invalid content
- **THEN** the host UI continues rendering normally and the failure does not surface as an agent error
