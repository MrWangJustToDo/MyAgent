## Context

Customization previously overlapped across AgentEventBus, a planned `.agent-hooks` script system, and middleware. The chosen model is a single Extension API (`on` / `registerTool` / `registerCommand`) with no hook-script bridge.

**Constraints:**
- Core package has no Ink dependency (must stay that way)
- Extension loading must work in Node.js CLI (dynamic `import` / `file://`)
- Playground (browser) cannot load user filesystem extensions — inline factories only
- Zod stays as the schema library (no TypeBox migration)
- **No** `.agent-hooks/hooks.json` support (removed, not bridged)

## Goals / Non-Goals

**Goals:**
- Single Extension API surface (`ExtensionAPI`, `ExtensionContext`, `ExtensionRunner`, `ExtensionLoader`)
- Inject interceptable events into the TanStack middleware pipeline
- Provide `toUI` parallel to `toModelOutput` for tool rendering
- Delete hook registry / hooks-middleware; extensions only
- Clean up redundant subscriptions in the app layer
- Keep `ctx.ui.*` API serializable across core→app boundary

**Non-Goals:**
- Not implementing full pi-equivalent UI API (`overlays`, `custom editors`, `autocomplete providers`)
- Not migrating to TypeBox (Zod stays)
- Not implementing extension hot-reload or packaging (future)
- Not changing the Playground's lack of filesystem extension loading (programmatic only)
- Not changing existing tool definitions' `needsApproval` semantics
- **Not** bridging or supporting `.agent-hooks`
## Decisions

### Decision 1: Keep Two Event Buses (AgentEventBus + ExtensionEventBus)

**Decision:** Two separate buses, one for notification/lifecycle, one for extension interception.

| Bus | Purpose | Semantics | Consumers |
|-----|---------|-----------|-----------|
| AgentEventBus | Lifecycle, logging, metrics | fire-and-forget | `event-log-bridge.ts`, `useAgentUsage.ts` |
| ExtensionEventBus | Tool interception, input transform, context modify | return values (block, modify, transform) | Extension handlers |

**Rationale:** Mixing notification events (which should never block) with interception events (which must return values) would make the type system harder and create confusion. Two buses with clear separation is cheaper than one overloaded bus.

**Alternative considered:** Single bus with `void` vs `Result<T>` discriminated return types. Rejected because: (a) many AgentEventBus subscribers would need to type `void` returns, creating boilerplate; (b) the `*` wildcard subscriber in `event-log-bridge.ts` would incorrectly receive interceptable events; (c) pi uses separate dispatch methods per event type, not a unified bus.

### Decision 2: ExtensionEventBus uses Dedicated Emit Methods

**Decision:** `ExtensionRunner` has typed `emit*()` methods instead of a generic `emit(event, handler)` → result pipeline.

```typescript
class ExtensionRunner {
  emitToolCall(event: ToolCallEvent): Promise<EmitResult>;     // chain, block shortcut
  emitToolResult(event: ToolResultEvent): Promise<EmitResult>;  // chain, merge
  emitInput(event: InputEvent): Promise<EmitResult>;            // transform/handle/continue
  emitContext(event: ContextEvent): Promise<EmitResult>;        // chain, modify messages
  emitBeforeAgentStart(event: BeforeAgentStartEvent): Promise<EmitResult>; // chain system prompts
  // Notification-only (no return value)
  emit(event: AgentEvent): void;  // delegated to AgentEventBus
}
```

**Rationale:** Each interceptable event has unique merge/short-circuit semantics:
- `tool_call`: chain input mutations, first `{ block: true }` wins
- `tool_result`: chain content/details modifications
- `input`: "transform" chains, "handled" short-circuits
- `context`: chain message modifications
- `before_agent_start`: chain system prompt concatenation

A single generic dispatch would need type switches + per-event merge logic anyway. Dedicated methods are clearer and type-safe.

### Decision 3: Remove Hooks Entirely (No Bridge)

**Decision:** Do not implement or keep `.agent-hooks`. Tool interception is extensions-only.

```
[TanStack Middleware Pipeline]
  └── extensions-middleware.ts
        └── ExtensionRunner.emitToolCall(...)
              ├── [user extension handler 1] → { block: true }
              └── [user extension handler 2] → { needsApproval: true }
```

**Removed / never shipped:**
- `HookRegistry`, `HookRunner`, `hooks-middleware.ts`, `dispatchHook` / `mapToHookEvent`
- Loading of `.agent-hooks/hooks.json`

**What ships instead:**
- `extensions-middleware.ts` + filesystem / programmatic extensions
- `agent-factory.ts` loads `.agents/extension` then `~/.agents/extension`, then `config.extensions`
- `managed-agent.ts` — adds `registerTool()`, `registerCommand()`, `extensions: Extension[]`

**Rationale:** One interception path only. No parallel script runner, no compatibility bridge, fewer failure modes.

### Decision 4: toUI Registry (String-Based)

**Decision:** Add `toUIRegistry` parallel to `toModelOutputRegistry`, mapping tool name → `(ctx: { input, output }) => string`.

```typescript
// In define-tool.ts
toUI?: (ctx: { input: InferSchemaType<TInput>; output: InferSchemaType<TOutput> }) => string;

// Registration
toUIRegistry.register(name, (ctx) => config.toUI(ctx));
```

**In app layer:**
`formatToolOutput()` first checks `toUIRegistry.get(toolName)`. If found, calls it and returns the result. Otherwise falls through to existing per-tool-name switch.

**Rationale:** Strings with ANSI color support (via chalk) cover the vast majority of tool rendering needs without introducing Ink dependency to core. This is the same approach used by `toModelOutput` currently. Future Ink-based rendering belongs in `ctx.ui.*` not in `toUI`.

### Decision 5: ctx.ui.* API Bridge via CustomEvents

**Decision:** Extension UI methods serialize into custom events dispatched through `AgentUIChannel.subscribeCustomEvents`. The app layer subscribes and renders Ink components.

```typescript
// Core side — ExtensionContext.ui
class ExtensionUIContextImpl {
  notify(msg: string, type: "info" | "warn" | "error") {
    this.channel.emitCustomEvent("ui:notify", { msg, type });
  }
  setStatus(id: string, content: string) {
    this.channel.emitCustomEvent("ui:set-status", { id, content });
  }
  setWidget(id: string, factory: () => string) {
    // factory is serialized as a component name + props
    this.channel.emitCustomEvent("ui:set-widget", { id, component: factory() });
  }
}

// App side
channel.subscribeCustomEvents((eventType, data) => {
  if (eventType === "ui:notify") { /* render Ink notification */ }
  if (eventType === "ui:set-status") { /* set status line text */ }
});
```

**Rationale:** This keeps core Ink-free. UI actions are serialized as typed event payloads. The app layer decides how to render them. When `hasUI` is false, the UI context becomes a no-op stub (pattern copied from pi).

### Decision 6: Extension Loading

**Decision:** Use dynamic `import()` for extension loading. For TypeScript, depend on `tsx` being available.

```typescript
// ExtensionLoader
async function loadExtension(path: string): Promise<ExtensionFactory> {
  if (path.endsWith('.ts')) {
    // For .ts files, require tsx to be registered globally
    // User needs: node --import tsx or have tsx in node_modules
    const mod = await import(pathToFileURL(path).href);
    return mod.default; // default export = factory function
  }
  const mod = await import(pathToFileURL(path).href);
  return mod.default;
}
```

**Scan directories:**
1. `.agents/extension/` (project-local)
2. `~/.agents/extension/` (global)
3. Optional override via `AGENT_EXTENSION_DIRS` (comma-separated)
3. Programmatic `extensionFactories` array (for Playground inline config)

**Rationale:** jiti adds a dependency and complexity. ESM `import()` handles .js natively. For .ts, `tsx` is already the standard Node.js TypeScript loader (used by the project). Users who write TS extensions just need `tsx` available (which it is, as a dev dependency or globally).

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Extension loading from untrusted directories | Low | Extensions run with the same permissions as the host process. Document security model. No sandbox for extensions (same as pi). |
| `tsx` not available when loading .ts extensions | Medium | Graceful fallback: log clear error "TypeScript extension detected. Install tsx: npm install -g tsx". Extensions without .ts work fine. |
| Breaking removal of `.agent-hooks` | Medium | Document: migrate to `.agents/extension` TypeScript modules. No bridge. |
| Extension registration order affects tool overrides | Low | Document: first registration wins. Built-in tools are registered first, then project extensions, then global extensions. This means user extensions override built-ins. |
| toUI increases tool definition surface | Low | Optional field, default undefined. No change to existing tool definitions required. |
| Two event buses cause confusion | Medium | Clear naming: `AgentEventBus` (lifecycle), `ExtensionEventBus` (interception). Documentation + type system prevents misuse. |

## Migration Plan

1. **Phase 1 — Foundation** (additive):
   - Create `core/src/agent/extension/` directory structure
   - Implement `ExtensionAPI`, `ExtensionContext`, `ExtensionRunner`, `ExtensionLoader`

2. **Phase 2 — Middleware + drop hooks**:
   - Ship `extensions-middleware.ts` through `ExtensionRunner`
   - Ensure no `hooks-middleware`, HookRegistry, or `.agent-hooks` loader remains
   - Wire extension bootstrap in `agent-factory.ts`

3. **Phase 3 — Tool enhancement**:
   - Add `toUI` to `defineServerTool`
   - Create `toUIRegistry`
   - Wire into app's `formatToolOutput()`

4. **Phase 4 — Subscription cleanup**:
   - Remove redundant dual subscriptions
   - Prefer `ManagedAgent.observe` where applicable

5. **Phase 5 — ctx.ui API**:
   - Implement `ExtensionUIContext` with notify/setStatus/setWidget/confirm
   - Bridge through custom events / app rendering

**Rollback:** Extension loading is additive; interception already goes through extensions-middleware. No hook path to restore.

## Open Questions

1. **Extension isolation**: Should extensions run in a VM context (vm.Module) for safety? Pi doesn't. Initial implementation: same process, no isolation. Add VM isolation later if needed.

2. **toUI async support**: Should `toUI` support async operations (e.g., fetching data for display)? Initial design: sync only (string return). Async can be added later via the `ctx.ui` API path.

3. **Extension API versioning**: Do we need a version field in extensions for future compatibility? Pi doesn't version. Skip for now; add if breaking changes occur.

4. **Plugin for context events**: The `context` event (modifying messages before LLM) is powerful but risky. Should we require opt-in permission for it? Start without restriction; add permissions layer later.
