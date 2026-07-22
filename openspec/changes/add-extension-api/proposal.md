## Why

Our agent system has no first-class extension API. Users can only customize behavior by editing source code or writing external hook scripts (`.agent-hooks/hooks.json`). Pi demonstrates that a first-class extension API enables deep customization (tool registration, event interception, UI integration, dynamic providers) without forking code. Meanwhile our existing systems (AgentEventBus, subscriber patterns) have accumulated redundancy. Consolidating hooks into extensions, unifying the event bus, and cleaning up subscriptions will reduce architecture surface and unlock genuine extensibility.

## What Changes

- **Extension API**: New `ExtensionAPI` + `ExtensionContext` + `ExtensionLoader` + `ExtensionRunner` living in `packages/core/src/agent/extension/`. Extensions are TypeScript modules loaded from well-known directories. API surface: `on()`, `registerTool()`, `registerCommand()`, `ctx.ui.*`.
- **Hook system migration**: The `HookRegistry`/`HookRunner` system becomes a built-in extension. `.agent-hooks/hooks.json` is transparently bridged to extension event handlers. The `hooks-middleware.ts` is replaced by `extensions-middleware.ts` that dispatches through the Extension Event Bus.
- **Unified event driving**: Two separate event buses exist today: `AgentEventBus` (lifecycle/notification events) and `ExtensionEventBus` (interceptable events with return values). They are **kept separate** but both driven by the same middleware pipeline. AgentEventBus drives logging and lifecycle, ExtensionEventBus drives interception and modification.
- **Subscription audit & cleanup**: Remove redundant `ui.subscribe()` + `subagent:ui-update` dual subscriptions in `useTask.ts` and `SubagentPanel.tsx`. Merge duplicate `subscribeState` calls in `useAgentChat.ts`. Clean up subscription lifecycle patterns.
- **Tool definition enhancement**: Add `toUI` callback to `defineServerTool()` (string-based rendering output). Register in `toUIRegistry` parallel to `toModelOutputRegistry`. Tools keep Zod schemas (no migration to TypeBox).
- **ExtensionContext UI**: Add `ctx.ui.*` API surface (`notify`, `setStatus`, `setWidget`, `confirm`) for extensions to interact with the terminal UI. Implementation uses `subscribeCustomEvents` bridge from core to app.

## Capabilities

### New Capabilities
- `extension-api`: ExtensionAPI interface, ExtensionContext, ExtensionLoader, ExtensionRunner. Auto-discovery from `~/.config/opencode/extensions/` and `.opencode/extensions/`. Livecycle integration with agent bootstrap.
- `extension-events`: Interceptable event system for extensions. `tool_call`, `tool_result`, `input`, `context`, `before_agent_start` events that accept `{ block: true }`, `{ content: [...] }`, `{ transform: [...] }` return values. Bridges to TanStack middleware pipeline.
- `extension-tool-registry`: Runtime tool registration via `ExtensionAPI.registerTool()` with Zod schemas, `needsApproval`, `toModelOutput`, `toUI`. Tool override semantics (same name replaces built-in). Built-in extension for `.agent-hooks/hooks.json` bridge.

### Modified Capabilities
- *(none — existing specs (model-message-converter, session-resume, session-store) are unaffected)*

## Impact

- **Core**: New `packages/core/src/agent/extension/` directory (~600 lines). Modify `hooks-middleware.ts` → `extensions-middleware.ts`. Modify `agent-factory.ts` for extension bootstrap. Modify `managed-agent.ts` for `registerTool()` API.
- **App**: Clean up subscriptions in `use-agent-chat.ts`, `use-task.ts`, `SubagentPanel.tsx`. Add `toUIRegistry` query in `ToolOutputView.tsx` / `formatToolOutput()`.
- **Breaking**: `HookRegistry` API becomes internal (no longer directly importable for manual registration). `.agent-hooks/hooks.json` continues to work transparently via the built-in extension bridge.
- **Architecture**: Event flow becomes `TanStack Middleware → ExtensionEventBus → (extensions + hook bridge)`. AgentEventBus retained for lifecycle/logging only.
