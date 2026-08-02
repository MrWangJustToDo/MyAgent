# API removals — `harden-core-organization` (P1)

Symbols removed from the public `@my-agent/core` entry (`packages/core/src/index.ts`).
They remain available to validate scripts via `dist/dev.mjs` / `src/dev.ts` where needed.
**No shims** on the public entry.

## Session sync (internal persistence helpers)

- `areAllUIMessagesStable`
- `computeSessionSyncSnapshot`
- `createSessionSyncTracker`
- `fingerprintUIMessage`
- `isUIMessageStable`
- `shouldPersistUIMessages`
- `SessionSaveReason` (type)
- `SessionSyncSnapshot` (type)

## Tool-phase / pump helpers

- `hasDeferredToolExecution`
- `hasPendingAskUser`
- `hasPendingToolApprovals`
- `needsAgentResponseAfterTools`
- `needsToolPhaseContinue`
- `shouldContinueAgentPump`
- `formatAgentStreamError`

## Orchestration / factory internals

- `buildManagedAgent`
- `BuildManagedAgentOptions` (type)
- `BuildManagedAgentResult` (type)
- `getDefaultSkillDirs`
- `SKILL_DIRS_ENV_VAR`
- `RunFinalizeReason` (type)
- `DEFAULT_OBSERVE_EVENTS`
- `ACTIVE_STATUSES`
- `isTerminalStatus`
- `resolveFinishStatus`
- `formatChatError`
- `bridgeExternalToolToServer`
- `buildCanonicalModelMessages`

## Streaming emit (hosts use AgentSession `streaming` channel)

- `clearStreamingOutput`
- `emitStreamingChunk`
- `StreamingChunk` (type)
- `StreamingEmitOptions` (type)

## Misc internals

- `STATUS_ICONS`
- `lookupModelFromModelsDev`
- `generateShortId`
- `createSequentialIdGenerator`
- `EXTENSION_DIRS_ENV_VAR`
- `joinExtensionAppendSegments`

## Still public (for hosts / adapters)

Notable keepers after this trim: `agentManager`, `ManagedAgent`, `AgentChatController`, `localConnect` /
`createLocalConnect`, `isActiveStatus`, session store, compaction helpers used by `/compact`, model
bootstrap helpers, CoreEnv registry, extension loader/runner + types, tool-output types, `generateId`,
`destroyAllCommandJobs`, UI toUI registry.

## ManagedAgent field tightening (P2, BREAKING for direct field writes)

Hosts must treat these as read-only / opaque:

| Was public mutable | Now |
|--------------------|-----|
| `runner`, `textAdapter`, `runnerConfigKey` | **Private** — use package-internal accessors (`getRunner` / `setRunner` / `invalidateRunner` / `getTextAdapter` / `setTextAdapter`) from core only |
| `ui` | **Getter** — wire via `setUIChannel` (package-internal) |
| `status` | **Getter** — mutate via `setStatus` / `statusController` |
| `context` | **Getter** — replace via `setContext` |
| `usage` | Unchanged `readonly` service |

Detached / subagent completion uses `statusController.applyRunOutcome(...)` (replaces `finalizeDetachedRun`).
