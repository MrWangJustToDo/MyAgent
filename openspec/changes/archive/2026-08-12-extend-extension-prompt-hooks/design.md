## Context

Core already freezes a cacheable system prompt (`buildFrozenSystemPrompt`) and applies per-user-turn dynamic content after `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` via `buildDynamicTurnContext` + turn-context middleware. Extensions can register tools and intercept `tool:before|after|error`, but cannot contribute to that dynamic segment.

The archived `add-extension-api` change listed `before_agent_start` (incorrectly as bootstrap-time). This design corrects it to **per user prompt**, aligned with Pi’s lifecycle but append-only to preserve prefix cache.

## Goals / Non-Goals

**Goals:**
- Let extensions inject per-turn situational context without mutating frozen `AGENTS.md` / base system prompt.
- Chain multiple extension contributions in registration order.
- Keep tool-continuation prepares from re-firing the hook (same as memory prefetch / snapshot).

**Non-Goals:**
- Full system prompt replace
- Message-list `context` rewrite, `input` intercept, `before_provider_request`
- `tool_result` content mutation
- Session `appendEntry`, `resources_discover`, richer UI helpers
- Chrome browser tools / WebContainer

## Decisions

1. **Append-only after DYNAMIC_BOUNDARY**  
   Handlers set `appendTurnContext` / `appendSystemPrompt` on the event; runner concatenates with `\n\n`. No replace API.  
   *Alternative considered:* Pi-style full `systemPrompt` replace — rejected for cache and multi-extension conflict.

2. **Event fires in `prepareForRun` before snapshot**  
   Same gate as memory prefetch (`!isToolContinuation && !parentId`). Collected segments feed `captureTurnContextSnapshot`.  
   *Alternative:* Middleware-only hook — rejected; snapshot must be stable across tool iterations within the turn.

3. **`registerTurnContextProvider` convenience**  
   Providers run during snapshot; results merge like `appendTurnContext`. Useful for stateful “current tab” without re-subscribing each turn.

4. **Rendering**  
   - `extensionTurnContext` → nested `<extension_context>` inside turn context  
   - `extensionSystemAppend` → after `<turn_context>` block, still after DYNAMIC_BOUNDARY

## Risks / Trade-offs

- **[Risk] Oversized extension dumps inflate every turn** → Mitigation: docs + demos keep snippets small; future size caps out of scope.  
- **[Risk] Extensions expect bootstrap-time `before_agent_start`** (old draft spec) → Mitigation: delta spec + ARCHITECTURE clarify per-prompt semantics.  
- **[Trade-off] No message injection** → browser snapshots stay in tool results; only short status in turn context.

## Migration Plan

- No migration for existing extensions (additive API).
- Rollback: remove emit + provider paths; ignore unknown event types.

## Open Questions

- None for MVP.
