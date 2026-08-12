## 1. Core types and JobRegistry

- [x] 1.1 Add background job types (`jobId`, status, start result, poll result) under `packages/core/src/environment/types.ts` (or adjacent module)
- [x] 1.2 Extend `CoreEnv` with optional `startCommand` / `killCommand` (or equivalent) and document FG `runCommand` unchanged
- [x] 1.3 Implement in-core `JobRegistry` (register, append output, poll since cursor, mark exited/killed, clear/destroy all)
- [x] 1.4 Export new types/APIs from core public surface as needed (`index.ts` / `dev.ts`)

## 2. Tools

- [x] 2.1 Extend `run_command` with `run_in_background`; BG path calls `startCommand` + registry and returns immediately; unsupported host errors clearly
- [x] 2.2 Add `get_command_output` tool (jobId, incremental output + status + exitCode when done)
- [x] 2.3 Add `kill_command` tool
- [x] 2.4 Register tools in `create-tools.ts` and update output formatters / `toModelOutput` for BG results
- [x] 2.5 Keep `needsApproval` on background `run_command` starts

## 3. Node adapter

- [x] 3.1 Implement `startCommand` in `@my-agent/node` (spawn without awaiting exit; stream into registry; track pid for kill)
- [x] 3.2 Implement kill (process tree) and wire `destroy` to clear background jobs
- [x] 3.3 Validate with a focused script or manual check (start sleep/dev-like process, poll, kill)

## 4. Playground WebContainer adapter

- [x] 4.1 Implement `startCommand` using `wc.spawn` without awaiting exit; reuse spawn cwd mapping
- [x] 4.2 Implement kill via WebContainer process API; clear jobs on env destroy
- [x] 4.3 Update playground `AGENTS.md` note: use `run_in_background` for long-lived servers; preview still uses port events

## 5. App UI / docs polish

- [x] 5.1 Format BG / poll / kill tool outputs in `@my-agent/app` tool-output-format (and list in detailed tools if needed)
- [x] 5.2 Mention background jobs briefly in playground README
- [x] 5.3 Remote CoreEnv: return unsupported for BG (or stub) and document limitation

## 6. Verification

- [x] 6.1 `pnpm build:core` (+ node/playground typecheck as touched)
- [x] 6.2 Add/adjust a small validation script for JobRegistry poll/kill semantics if no test framework
- [x] 6.3 Smoke: FG `run_command` still works; BG start → poll → kill on node or playground
