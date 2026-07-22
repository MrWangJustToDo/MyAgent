## 1. Foundation — Extension types and core infrastructure

- [ ] 1.1 Create `packages/core/src/agent/extension/` directory structure
- [ ] 1.2 Define `ExtensionAPI` interface: `on()`, `registerTool()`, `registerCommand()`, `events` (inter-extension bus)
- [ ] 1.3 Define `ExtensionContext` interface: `cwd`, `ui`, `sessionManager`, `signal`, `abort()`, `shutdown()`, `compact()`, `getSystemPrompt()`
- [ ] 1.4 Define `ExtensionFactory` type: `(api: ExtensionAPI) => void | Promise<void>`
- [ ] 1.5 Define `Extension` type: aggregated state of handlers, tools, commands per extension
- [ ] 1.6 Implement `ExtensionRunner`: manages loaded extensions, typed emit methods for each interceptable event
- [ ] 1.7 Implement `ExtensionUIContextImpl` with notify/setStatus/setWidget/confirm (serializes to custom-events)
- [ ] 1.8 Implement `noOpUIContext` stub for headless mode

## 2. Extension Loader

- [ ] 2.1 Implement `ExtensionLoader` with directory scanning: `.opencode/extensions/` + `~/.config/opencode/extensions/`
- [ ] 2.2 Implement dynamic `import()` based module loader with tsx support for .ts files
- [ ] 2.3 Support programmatic `extensionFactories` in `ManagedAgentConfig`
- [ ] 2.4 Handle load errors gracefully (log + skip broken extension, don't crash agent)

## 3. Middleware replacement — extensions-middleware

- [ ] 3.1 Create `extensions-middleware.ts` dispatching `tool_call`/`tool_result` through `ExtensionRunner.emit*()`
- [ ] 3.2 Create built-in hook bridge extension that reads `.agent-hooks/hooks.json` and registers `tool_call`/`tool_result` handlers via `api.on()`
- [ ] 3.3 Remove `hooks-middleware.ts` — delete file and update all imports
- [ ] 3.4 Remove `dispatchHook`/`mapToHookEvent` from `agent-event-bus.ts`
- [ ] 3.5 Wire extension bootstrap into `agent-factory.ts` (after `setUp`, before MCP init)

## 4. Tool enhancement — toUI + toUIRegistry

- [ ] 4.1 Create `core/src/agent/tools/tanstack/to-ui-registry.ts` (parallel to `to-model-output-registry.ts`)
- [ ] 4.2 Add optional `toUI` callback to `defineServerTool()` config — registers in `toUIRegistry`
- [ ] 4.3 Export `toUIRegistry` from core's `index.ts`
- [ ] 4.4 Wire `toUIRegistry` lookup into app's `formatToolOutput()` — check registry first, fall through to existing switch

## 5. Extension integration into ManagedAgent

- [ ] 5.1 Add `registerTool(name, definition)` method to `ManagedAgent`
- [ ] 5.2 Add `registerCommand(name, handler)` method to `ManagedAgent`
- [ ] 5.3 Wire `ExtensionAPI.registerTool()` → `ManagedAgent.registerTool()`
- [ ] 5.4 Wire `ExtensionAPI.registerCommand()` → `ManagedAgent.registerCommand()`
- [ ] 5.5 Add `extensions` field to `ManagedAgentConfig` for programmatic extension factories
- [ ] 5.6 Ensure tool overrides work: last-registered tool with same name wins in `resolveTanStackTools`

## 6. Subscription cleanup (app layer)

- [ ] 6.1 `useTask.ts`: remove redundant `subagent:ui-update` subscription (keep `ui.subscribe()` only)
- [ ] 6.2 `SubagentPanel.tsx`: remove redundant `subagent:ui-update` subscription in `SubagentPanelDetail`
- [ ] 6.3 `useAgentChat.ts`: merge dual `subscribeState` into single subscription with dual dispatch

## 7. ctx.ui API — app-side rendering

- [ ] 7.1 Subscribe to custom events (`ui:notify`, `ui:set-status`, `ui:set-widget`, `ui:confirm`) in the app layer
- [ ] 7.2 Implement Ink rendering for `notify` (temporary notification banner)
- [ ] 7.3 Implement Ink rendering for `setStatus` (persistent status line in footer)
- [ ] 7.4 Implement Ink rendering for `confirm` (yes/no dialog)
- [ ] 7.5 Implement Ink rendering for `setWidget` (custom widget insertion point)

## 8. Verification

- [ ] 8.1 Run `pnpm typecheck` — all packages pass
- [ ] 8.2 Run `pnpm build` — all packages build successfully
- [ ] 8.3 Run `openspec validate add-extension-api --strict` — passes
