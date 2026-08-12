## 1. Move domain tool factories

- [x] 1.1 Move `create-plan-tool.ts` to `agent/plan/` and fix relative imports (`tanstack`, `util`, plan modules)
- [x] 1.2 Export plan tool factories from `agent/plan/index.ts`; remove from `agent/tools/index.ts`
- [x] 1.3 Move `list-skills-tool.ts` and `load-skill-tool.ts` to `agent/skills/`; update skills barrel and tools barrel
- [x] 1.4 Move `task-tool.ts` to `agent/subagent/`; update subagent barrel and tools barrel
- [x] 1.5 Move `todo-tool.ts` to `agent/todo-manager/`; update todo-manager barrel and tools barrel

## 2. Clean universal tools root

- [x] 2.1 Move `webfetch-html.ts` to `agent/tools/util/` and update `webfetch-tool` / util exports
- [x] 2.2 Update `create-tools.ts` type-only imports to point at new domain paths
- [x] 2.3 Update `managers/agent-factory.ts` (and any other call sites) to import from domain modules

## 3. Public surface and docs

- [x] 3.1 Fix `packages/core/src/index.ts` / `dev.ts` deep import paths for moved modules
- [x] 3.2 Update `ARCHITECTURE.md` §10 and key-file index to domain-owned tools; update `AGENTS.md` file tree if needed
- [x] 3.3 `rg` for old paths (`tools/create-plan-tool`, `tools/task-tool`, `tools/todo-tool`, `tools/list-skills`, `tools/load-skill`, `tools/webfetch-html`) and clear leftovers

## 4. Verify

- [x] 4.1 `pnpm build:core` and `pnpm lint` (fix new issues from the move)
- [x] 4.2 Run `validate:plan-verification` and any skill/subagent/todo validates that import moved modules
