## Why

After Session-only app cutover, `@my-agent/core` still mixes host concerns (env bags, legacy chat connect leftovers already removed) with runtime: LLM/URL/API resolution still understands environment-variable key names, telemetry emit APIs are hard to distinguish from Session/log flows, disk-session vs Host Session naming collides, utils are scattered, and the public `index.ts` still exports runtime classes that UI must not hold. Cleaning this boundary now—while Session is the control plane—avoids baking the mess into HTTP Host (§4 of `app-session-only-remote`).

## What Changes

- **BREAKING**: Rename telemetry emit APIs for clarity (`emitAgentEvent` → `emitAgentTelemetry`, `AgentEventBus` → `AgentTelemetryBus`, related helpers). Session channel name `lifecycle` stays unchanged.
- **BREAKING**: Core stops accepting/resolving LLM and tool secrets via env bags. Hosts pass structured `ModelConnection` / `ModelInfo` / `toolConfig` (or equivalent) explicitly. `models.dev` lookup remains in core (explicit model id in → metadata out). Env parsing (`MODEL_*`, `BASE_URL`, `API_KEY`, Brave keys, etc.) moves to CLI/host.
- **BREAKING**: Reorganize core directories in one pass: disk persistence `agent/session` → `agent/persistence`; consolidate cross-cutting utils under `src/utils/` (e.g. `generateId`, `Emitter`); domain helpers stay with their domains.
- **BREAKING**: Narrow `@my-agent/core` public exports to Session-safe + host-bootstrap surfaces; move runtime classes/executors (`AgentLog`, `TodoManager`, `autoCompact`, `ExtensionRunner`/`Loader`, etc.) to `dev.ts` / package-private unless a host bootstrap path still requires them.
- Add validate gates: no env-key semantics in core model/tool resolution; public-export allowlist; import path updates after renames.
- No compatibility shims (project policy).

## Capabilities

### New Capabilities

- `core-explicit-config`: Core model/tool configuration is explicit-only; hosts own env/dotenv/flags
- `core-telemetry-naming`: Telemetry bus/emit naming distinct from Session channels and AgentLog
- `core-module-layout`: Directory and utils layout for Session-era core
- `core-public-surface`: Curated public export allowlist for Session-safe vs host vs internal

### Modified Capabilities

- （无）`openspec/specs/` 无既有能力需改需求文本；本变更以新 capability 约束组织与边界

## Impact

| Area | Change |
|------|--------|
| `packages/core` | Rename telemetry APIs; remove env resolution from models/tools; move persistence + utils; trim `index.ts` |
| `packages/cli` | Own `parseModelInfoFromEnv` / connection-from-env; pass explicit provider + tool secrets |
| `packages/app` / extension / server | Import path + bootstrap updates; drop forbidden public symbols |
| Validate / docs | New grep validates; `ARCHITECTURE.md` / `AGENTS.md` / app README allowlist |
| Parallel work | Orthogonal to `app-session-only-remote` §4 HTTP; avoid merging into that change |
