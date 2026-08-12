## 1. OpenSpec / docs scaffolding

- [x] 1.1 Write proposal.md, design.md, specs/plan-mode/spec.md, tasks.md
- [x] 1.2 `openspec validate add-plan-mode --strict`

## 2. Core plan utilities

- [x] 2.1 Add `packages/core/src/agent/plan/safe-command.ts` (+ validate script)
- [x] 2.2 Add `packages/core/src/agent/plan/extract-plan.ts` (+ validate script)
- [x] 2.3 Add `packages/core/src/agent/plan/plan-mode-controller.ts`
- [x] 2.4 Add plan prompt snippets helper

## 3. Core wiring

- [x] 3.1 Add plan events to AgentEventBus + event-log-bridge + observe defaults
- [x] 3.2 Attach PlanModeController on ManagedAgent; public enable/disable/toggle/execute APIs
- [x] 3.3 Filter tools in run-agent when planning/ready; block MCP; allowlist run_command in tool + middleware guard
- [x] 3.4 Inject plan-mode dynamic system text (planning/executing)
- [x] 3.5 After assistant stream in planning: extract plan → ready + TodoManager seed
- [x] 3.6 Export public types from index/dev as needed

## 4. App

- [x] 4.1 Add `/plan` command (toggle / execute / status)
- [x] 4.2 Footer plan status
- [x] 4.3 Help + AGENTS.md docs

## 5. Verification

- [x] 5.1 `pnpm --filter @my-agent/core run validate:extract-plan` and `validate:safe-command`
- [x] 5.2 `pnpm build:core` && `pnpm build:app`
- [x] 5.3 `pnpm lint` && `pnpm format`
