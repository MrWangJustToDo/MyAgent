## Why

`agent/tools/` currently mixes universal tool factories (fs/shell/web) with domain-owned tools (plan/skills/task/todo) and non-tool helpers (`webfetch-html.ts`, config, assemblers). That makes the directory hard to navigate and splits related domain code (e.g. `plan-tools.ts` policy vs `create-plan-tool.ts` factories). Domain modules already own most of their logic; tool factories should live next to them — matching `subagent/begin-summary-tool.ts`.

## What Changes

- Move domain tool factories out of `agent/tools/` into their owning modules:
  - `create-plan-tool.ts` → `agent/plan/`
  - `list-skills-tool.ts` / `load-skill-tool.ts` → `agent/skills/`
  - `task-tool.ts` → `agent/subagent/`
  - `todo-tool.ts` → `agent/todo-manager/`
- Keep universal tools + assembler under `agent/tools/` (`create-tools.ts`, fs/shell/web/ask_user, `tanstack/`, `util/`, `websearch/`, `tool-config.ts`)
- Move `webfetch-html.ts` under `agent/tools/util/` (helper, not a tool factory)
- Update imports, `index` barrels, `ARCHITECTURE.md` / `AGENTS.md` to reverse the old “tools stay centralized” guidance
- **No runtime behavior change** — file/module relocation only (public package export paths that mention moved files are **BREAKING** for deep imports; curated `index.ts` re-exports keep stable type names where already exported)

## Capabilities

### New Capabilities
- `core-tool-layout`: Ownership rules for where tool factories and tool helpers live under `@my-agent/core`

### Modified Capabilities
- (none — no agent runtime requirement changes)

## Impact

- Packages: `@my-agent/core` (primary); docs `ARCHITECTURE.md`, `AGENTS.md`
- Call sites: `managers/agent-factory.ts`, `create-tools.ts` type imports, `tools/index.ts`, `plan/index.ts`, `skills/index.ts`, `subagent/index.ts`, `todo-manager/index.ts`, `dev.ts` / public `index.ts` deep paths
- Validates that import moved modules must be updated
- Does not change tool names, schemas, or plan/skill/subagent behavior
