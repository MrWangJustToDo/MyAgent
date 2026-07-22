## Why

Our agent system needs a first-class extension API so users can customize behavior (tool registration, event interception, UI integration) without forking core. External shell/code hooks (`.agent-hooks/hooks.json`) are **removed** — not bridged. Extensions under `.agents/extension` (and programmatic factories) are the only customization path.

## What Changes

- **Extension API**: New `ExtensionAPI` + `ExtensionContext` + `ExtensionLoader` + `ExtensionRunner` living in `packages/core/src/agent/extension/`. Extensions are TypeScript modules loaded from well-known directories. API surface: `on()`, `registerTool()`, `registerCommand()`, `ctx.ui.*`.
- **Hooks removed**: No `HookRegistry` / `HookRunner` / `.agent-hooks` bridge. `hooks-middleware.ts` is replaced by `extensions-middleware.ts` that dispatches through the Extension Event Bus only.
- **Unified event driving**: Two separate event buses: `AgentEventBus` (lifecycle/notification) and `ExtensionEventBus` (interceptable events with return values). Both driven by the same middleware pipeline.
- **Subscription audit & cleanup**: Remove redundant dual subscriptions; clean up lifecycle patterns.
- **Tool definition enhancement**: Add `toUI` callback to `defineServerTool()`; register in `toUIRegistry`.
- **ExtensionContext UI**: Add `ctx.ui.*` API surface for extensions to interact with the host UI.

## Capabilities

### New Capabilities
- `extension-api`: ExtensionAPI interface, ExtensionContext, ExtensionLoader, ExtensionRunner. Auto-discovery from `.agents/extension/` then `~/.agents/extension/`. Lifecycle integration with agent bootstrap.
- `extension-events`: Interceptable event system for extensions. `tool_call`, `tool_result`, `input`, `context`, `before_agent_start` events that accept block/modify/transform return values. Bridges to TanStack middleware pipeline.
- `extension-tool-registry`: Runtime tool registration via `ExtensionAPI.registerTool()` with Zod schemas, `needsApproval`, `toModelOutput`, `toUI`. Tool override semantics (same name replaces built-in).

### Modified Capabilities
- *(none — existing specs (model-message-converter, session-resume, session-store) are unaffected)*

## Impact

- **Core**: `packages/core/src/agent/extension/`. `extensions-middleware.ts`. Extension bootstrap in `agent-factory.ts`. `ManagedAgent.registerTool()` / `registerCommand()`.
- **App**: Subscription cleanup; `toUIRegistry` in tool output formatting; ExtensionUI bridge.
- **Breaking**: `.agent-hooks/hooks.json` is **not** supported. Migrate customizations to `.agents/extension` modules.
- **Architecture**: Event flow is `TanStack Middleware → ExtensionEventBus → extensions`. AgentEventBus retained for lifecycle/logging only.
