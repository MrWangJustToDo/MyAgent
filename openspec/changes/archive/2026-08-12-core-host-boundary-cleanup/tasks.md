## 1. Telemetry naming (functions/types only)

- [x] 1.1 Rename `emitAgentEvent` → `emitAgentTelemetry` (+ `createEmitFn` → telemetry-named helper) and update all call sites
- [x] 1.2 Rename `AgentEventBus` → `AgentTelemetryBus`; update manager wiring and types
- [x] 1.3 Rename `attachEventLogBridge` → `bridgeTelemetryToAgentLog`; update AgentManager + validates
- [x] 1.4 Keep Session channel `lifecycle` and `AgentEvent` envelope type; grep for old names; `pnpm build:core` + affected validates

## 2. Explicit config (zero env in core)

- [x] 2.1 Remove `env` from `ResolveModelConfigInput` / `resolveModelConnection` / `resolveModelConfig`; require explicit fields
- [x] 2.2 Move `model-env.ts` parsers (`parseModelInfoFromEnv`, `MODEL_ENV_KEYS`, …) to `@my-agent/cli` (or cli-local module); drop from core public `index.ts`
- [x] 2.3 Update `createDirectModelProvider` to accept only explicit connection (+ optional `modelInfo`); update CLI registration to parse env then pass fields
- [x] 2.4 Add `toolConfig` (or equivalent) on ManagedAgent / Host create options; inject Brave (and similar) keys; remove `getEnv().getEnv()` secret digs from websearch
- [x] 2.5 Update extension/server/playground hosts that passed `env: process.env`; fix error strings/docs
- [x] 2.6 Add `validate:core-no-env-config` (grep gate for LLM/tool secret env key usage in core model/tool paths); run `pnpm build:core` + `build:cli`

## 3. Module layout (one pass)

- [x] 3.1 Move `agent/session/` → `agent/persistence/`; update all imports; delete old path (no shim)
- [x] 3.2 Move `generateId` / related from `agent/utils.ts` into `src/utils/`; update imports; remove catch-all `agent/utils.ts`
- [x] 3.3 Relocate or document remaining `agent/utils/*` owners; avoid new dump files
- [x] 3.4 Update ARCHITECTURE.md / AGENTS.md trees; `pnpm build:core` + persistence/session validates

## 4. Public surface trim

- [x] 4.1 Remove from `index.ts`: `AgentLog`/`TodoManager` classes, `autoCompact`/`applyCompactionResult`/`buildCanonicalModelMessages`, extension runner/loader (if unused by hosts), other design-listed internals; keep types + Session/Host/CoreEnv/ModelProvider bootstrap
- [x] 4.2 Ensure needed symbols remain on `dev.ts` for validates; fix validate import paths
- [x] 4.3 Add `validate:core-public-exports` allowlist/denylist; update `packages/app` README allowlist if needed
- [x] 4.4 Fix workspace compile breaks (`app`/`cli`/`server`/`extension`/`node`); `pnpm build` for affected packages

## 5. Verify and docs

- [x] 5.1 Run core validates touched by renames/config/persistence + app `validate:core-imports` / `session-only-smoke`
- [x] 5.2 Final `pnpm lint`, `pnpm format`, affected package builds
- [x] 5.3 Cross-check no leftover `emitAgentEvent` / `agent/session/` / public `TodoManager` class exports
