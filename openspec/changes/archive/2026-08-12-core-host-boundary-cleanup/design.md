## Context

Session is now the app control plane (`app-session-only-remote` through §3). Core still:

- Resolves model connection via optional `env` bags (`BASE_URL`, `API_KEY`, `MODEL_*`)
- Tools (e.g. Brave) read secrets from `CoreEnv.getEnv()`
- Telemetry emit is named like generic “events”, colliding mentally with Session channels and AgentLog
- Disk store lives under `agent/session` while Host API is `agent-session/`
- Utils split across `src/utils/`, `agent/utils.ts`, `agent/utils/*`, `agent/tools/util/*`
- Public `index.ts` still exports runtime classes forbidden for Session-only UI

Constraints: no shims; ESM + `.js` imports; keep three planes (CoreEnv / ModelProvider / AgentSession) separate; `models.dev` stays in core with explicit model id.

## Goals / Non-Goals

**Goals:**

1. Telemetry function/type names that read as “bus telemetry”, not Session UI events (channel `lifecycle` unchanged).
2. Core model + tool secret resolution is explicit-only; hosts parse env/flags.
3. One-shot directory + utils layout cleanup for Session-era clarity.
4. Public export allowlist aligned with Session-safe / host-bootstrap / internal.

**Non-Goals:**

- Renaming Session channel `lifecycle` → `telemetry`
- Merging CoreEnv with ModelProvider
- Moving `models.dev` lookup to host
- Implementing HTTP Host (§4 of `app-session-only-remote`)
- Full ManagedAgent field privatization beyond what’s needed for export trim

## Decisions

### D1 — Telemetry rename (functions/types only)

| From | To |
|------|-----|
| `emitAgentEvent` | `emitAgentTelemetry` |
| `createEmitFn` | `createEmitTelemetryFn` (or keep short if unused externally) |
| `AgentEventBus` | `AgentTelemetryBus` |
| `attachEventLogBridge` | `bridgeTelemetryToAgentLog` |

Keep: `AgentEvent` envelope type name (wire/payload shape), Session channel `lifecycle`, Event→Log rules content.

**Alternative:** Rename channel too — rejected (user: 只改函数).

### D2 — Explicit config (2a)

```
Host: dotenv/flags → ModelConnection + ModelInfo + ToolSecrets
         │
         ▼
registerModelProvider(createDirectModelProvider(connection))
Host.create({ …connection fields, toolConfig? })
         │
core: resolveModelConfig({ model, style, baseURL, apiKey, modelInfo? })  // no env
      lookupModelFromModelsDev(modelId)  // optional merge
```

- Delete `ResolveModelConfigInput.env` and core `parseModelInfoFromEnv` / `MODEL_ENV_KEYS` from public core (move parsers to `@my-agent/cli` or `packages/cli/src/model-env.ts`).
- `createDirectModelProvider` accepts only explicit connection fields.
- Tool secrets: `ManagedAgentConfig.toolConfig` / `websearch: { braveApiKey? }` (exact shape in impl); websearch MUST NOT call `getEnv().getEnv()` for API keys.
- `CoreEnv.getEnv()` remains for shell child-process environment only.

**Alternative:** Keep env bag as optional fallback — rejected (user: must be manual).

### D3 — Layout (one pass)

| Move | Rationale |
|------|-----------|
| `agent/session/` → `agent/persistence/` | Distinct from `agent-session/` Host API |
| `agent/utils.ts` (`generateId`, …) → `src/utils/id.ts` (or `src/utils/generate-id.ts`) | Cross-cutting |
| Keep `src/utils/emitter.ts` | Already correct |
| Domain helpers in `agent/utils/*` | Relocate only when clearly owned (e.g. tool-phase near chat); don’t boil ocean—document home for leftovers |

Update all imports + ARCHITECTURE tree; no path shims.

### D4 — Public surface

**Remain on `index.ts` (illustrative):** CoreEnv registry + env-types; ModelProvider registry + `resolveModelConfigFromProvider` / explicit resolve helpers; AgentSession* + Host factories; serializable types (`TodoItem`, `LogEntry`, `AgentStatus`, …); `isActiveStatus`; summary-stream protocol helpers; `getToUI`/`registerToUI`; tool output types; `previewEdit`; host bootstrap: `agentManager`, `createLocalAgentSessionHost`, `buildDefaultSystemPrompt`, `resolveModelConfigFromProvider`.

**Move to `dev.ts` / private:** `AgentLog` class, `TodoManager` class, `autoCompact` / `applyCompactionResult` / `buildCanonicalModelMessages`, `ExtensionRunner` / `ExtensionLoader` (unless server bootstrap still needs—prefer package-internal import), compaction marker formatters already duplicated in app.

Add `validate:core-public-exports` (or extend app allowlist) listing forbidden symbols on the published entry.

## Risks / Trade-offs

- **[Risk] Large rename churn** → Mitigation: mechanical renames + `pnpm build` + targeted validates; no dual names.
- **[Risk] CLI/extension miss a required explicit field** → Mitigation: fail loud at provider register / Host.create; update Help.
- **[Risk] Persistence path rename breaks imports mid-branch** → Mitigation: single PR wave; grep gate for `agent/session/`.
- **[Risk] Conflict with `app-session-only-remote` §4** → Mitigation: keep this change focused on core/host boundary; HTTP Host consumes cleaned APIs afterward.

## Migration Plan

1. Telemetry renames (core + callers)
2. Config: move env parsers to cli; strip core env paths; inject tool secrets
3. Directory/utils moves + import fix
4. Trim `index.ts` + validate allowlist
5. Docs + `pnpm build` / validates for core, cli, app, node, server as touched

Rollback: revert PR (no shim period).

## Open Questions

None blocking—user decisions locked: (1) functions only (2) 2a (3) one-pass layout (4) trim exports now.
