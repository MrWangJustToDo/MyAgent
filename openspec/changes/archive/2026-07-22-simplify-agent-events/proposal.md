## Why

The agent run pipeline is already coherent, but the observation surface is fragmented: lifecycle emits are inconsistent (tool-end gated on extensions, reactive compact also emitting auto-start), dead event types linger, and `ARCHITECTURE.md` still describes the deleted hooks system. Fixing the protocol and docs now prevents hosts and extensions from building on a misleading contract while `add-extension-api` lands.

## What Changes

- **Correct lifecycle emission**: Always emit `agent:tool-start` / `agent:tool-end` / `agent:tool-error` on the AgentEventBus regardless of whether an `ExtensionRunner` exists; keep ExtensionEventBus interception separate.
- **Fix compaction event naming**: Reactive compact must not emit `compaction:auto-start`; `beginCompaction` gains an explicit kind (`auto` | `reactive`).
- **Align event payloads with Event→Log bridge**: `subagent:completed` (and related) payloads match what the bridge formats.
- **Resolve dead event types**: Either emit `session:restore` / `subagent:destroyed` at the real call sites, or remove them from `AgentEventType` and bridge rules.
- **Single-path approval logging**: Stop dual-writing `log.approval` in `syncApprovals`; rely on Event→Log for `agent:tool-approval-request`.
- **Sync `ARCHITECTURE.md`**: Replace hooks/`HookRegistry`/`hooks-middleware` claims with ExtensionRunner + `extensions-middleware`; document `llm:*`, `turn:summary`, and the L1–L4 observation model.
- **Out of scope (follow-up)**: Host `observe()` facade, splitting `ManagedAgent` by line count, merging streaming callbacks into the UI channel.

## Capabilities

### New Capabilities
- `agent-lifecycle-events`: Contract for AgentEventBus lifecycle notifications — which events fire when, payload shapes, relationship to ExtensionEventBus (intercept-only), and Event→Log as the sole core wildcard consumer.

### Modified Capabilities
- *(none — existing specs `session-store`, `session-resume`, `model-message-converter` are unaffected; extension specs live under `add-extension-api` and remain the source of truth for interception)*

## Impact

- **Core**: `extensions-middleware.ts`, `agent-status-controller.ts`, `managed-agent.ts` (reactive compact / restore), `run-subagent.ts` / destroy paths, `agent-event-bus.ts`, `event-log-bridge.ts`, `ARCHITECTURE.md`.
- **App**: No required API changes; any listeners assuming missing `tool-end` or dual auto+reactive starts will see corrected behavior.
- **Validation**: Extend or add `validate:emit-agent-event` / `validate:event-log-bridge` coverage for tool-end without runner and reactive-only starts.
- **Related change**: Complements `add-extension-api` (keeps buses separate); does not reintroduce hooks.
