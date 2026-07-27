## Why

Extensions can register tools and intercept tool calls, but cannot contribute per-turn situational context or append dynamic system instructions. That blocks use cases like browser-use (active tab URL/title), mode banners, and site-specific guidance without rewriting the frozen `AGENTS.md` system prompt (and breaking prefix cache).

## What Changes

- Emit interceptable `before_agent_start` on `ExtensionEventBus` once per user prompt (not bootstrap), before turn-context snapshot.
- Allow handlers to chain `appendTurnContext` and `appendSystemPrompt` (append-only).
- Add `ctx.registerTurnContextProvider()` for ongoing turn-context contributions.
- Merge extension segments into existing dynamic turn context (after `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`).
- Demo extension, docs, and a small validation script for collect/chain behavior.

## Capabilities

### New Capabilities

- `extension-prompt-hooks`: Per-turn `before_agent_start` event, turn-context providers, and append-only dynamic prompt segments for extensions.

### Modified Capabilities

- *(none in `openspec/specs/` — prior extension requirements live under the archived `add-extension-api` change; this change introduces the missing prompt-hook capability as a new spec.)*

## Impact

- **Core**: `packages/core/src/agent/extension/` (types, runner), `managed-agent-prompt.ts`, `managed-agent-run-lifecycle.ts`, `ManagedAgent` turn snapshot.
- **Examples / docs**: `examples/extensions/`, `ARCHITECTURE.md`, demo README.
- **Not breaking**: Existing tool interceptors and frozen system prompt behavior unchanged; extensions that ignore the new event keep working.
