## Context

`agent/tools/` grew into a catch-all. Domain modules (`plan`, `skills`, `subagent`, `todo-manager`) already own controllers/registries, while their model-callable tool factories remain under `tools/`. `begin-summary-tool` already lives under `subagent/`, proving domain-owned tools work. Prior docs (`ARCHITECTURE.md` §10) explicitly kept plan factories in `tools/` — this change reverses that convention.

## Goals / Non-Goals

**Goals:**
- Colocate domain tool factories with their domain modules
- Leave `agent/tools/` as universal tools + TanStack glue + shared util + assembler
- Keep tool *names*, schemas, and wiring behavior identical
- Update docs so ownership rules match the code

**Non-Goals:**
- Renaming tools or changing plan/skill/subagent/todo runtime semantics
- Splitting universal tools into `fs/` / `shell/` / `web/` subfolders (can be a follow-up)
- Introducing a new `agent/tooling/` package root
- Moving `ask_user` (stays universal / interaction under `tools/`)
- Moving `create-tools.ts` or `tool-config.ts` out of `tools/`

## Decisions

### 1. Domain-owned tool factories (option A)
| From | To |
|------|-----|
| `tools/create-plan-tool.ts` | `plan/create-plan-tool.ts` |
| `tools/list-skills-tool.ts` | `skills/list-skills-tool.ts` |
| `tools/load-skill-tool.ts` | `skills/load-skill-tool.ts` |
| `tools/task-tool.ts` | `subagent/task-tool.ts` |
| `tools/todo-tool.ts` | `todo-manager/todo-tool.ts` |
| `tools/webfetch-html.ts` | `tools/util/webfetch-html.ts` |

**Why:** Same ownership as domain logic; reduces cross-folder hopping; matches `begin-summary-tool`.

**Alternative considered:** Keep factories centralized under `tools/domain/*` — rejected; still separates tool from domain policy (`plan-tools.ts`).

### 2. `agent/tools/` remains the universal surface
`createTools()` continues to assemble only universal tools. Domain tools stay injected via `processTools` / `agent-factory` (current pattern). `tools/index.ts` stops re-exporting moved domain factories; domain barrels export them instead.

### 3. Import updates are mechanical
- Relative imports inside moved files (`./runtime` → `../tools/runtime`, etc.)
- `agent-factory`, validates, `dev.ts`, public `index.ts` deep paths
- Prefer domain barrel exports where they already exist

### 4. Docs override
Replace ARCHITECTURE §10 “do not move tool factories into plan/” with domain-owned ownership table.

## Risks / Trade-offs

- **[Risk] Missed deep import** → Mitigation: `rg` for old paths; `pnpm build:core` + affected validates (`validate:plan-verification`, skill/subagent validates if any)
- **[Risk] Circular imports** (plan tool ↔ plan controller ↔ tools runtime) → Mitigation: factories already import domain; after move they import `../tools/runtime` — same graph orientation as `begin-summary-tool`
- **[Trade-off] Discoverability** — “all tools in one folder” lost → Acceptable; domain folders become the map

## Migration Plan

1. Move files + fix internal imports
2. Update barrels and call sites
3. Update docs
4. Build + lint + targeted validates
5. No runtime feature flag needed; revert = restore files to old paths

## Open Questions

- None — scope locked to option A from exploration.
