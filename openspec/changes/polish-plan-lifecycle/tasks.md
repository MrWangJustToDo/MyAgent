## 1. Core — persist + plan path state

- [x] 1.1 Extend `PlanModeState` / controller with `planFilePath` (and clear it on disable/complete)
- [x] 1.2 Wire `applyPlanArtifact` / `applyStructuredPlan` to auto-`savePlanFile` (overwrite active path; slug on first create)
- [x] 1.3 Keep `/plan save [name]` for explicit named save; ensure load sets `planFilePath`
- [x] 1.4 Add/extend validate script for auto-persist round-trip on create/update

## 2. Core — summary + prompts

- [x] 2.1 Add shared helper to format bounded plan summary (path, goal, numbered step titles, truncation)
- [x] 2.2 Use helper in `create_plan` / `update_plan` tool results and `toModelOutput`
- [x] 2.3 Update planning/ready/executing prompts for review/Build language and “plan lives in file + summary”
- [x] 2.4 Add retro-phase prompt builder referencing the active plan file

## 3. Core — retro + complete lifecycle

- [x] 3.1 Add `retro` phase; transition from `executing` when all plan-seeded todos are completed
- [x] 3.2 Emit `plan:retro` / `plan:complete` (and wire event-log bridge if needed)
- [x] 3.3 Add `complete_plan` tool (planning/ready restricted appropriately; available in `retro`) and `/plan done` escape hatch
- [x] 3.4 On complete: clear plan lifecycle state, phase `off`, reuse disable cleanup as appropriate
- [x] 3.5 Ensure tool restriction: `planning`/`ready` read-only; `executing`/`retro` allow mutate tools
- [x] 3.6 Validate phase transitions: ready → execute → all done → retro → complete → off

## 4. App — display and todos

- [x] 4.1 Footer/banner/`/plan status` copy: review / building i/n / retro (no vague lone `plan` when avoidable)
- [x] 4.2 Format `create_plan`/`update_plan` tool output via shared summary (static transcript, no scroll panel)
- [x] 4.3 Enrich `TodoToolOutputView` (or plan-aware wrapper) for plan-seeded todos: step order + status
- [x] 4.4 Update Help / keyboard labels / plan command usage for Build + `/plan done`

## 5. Docs and wrap-up

- [x] 5.1 Update `AGENTS.md` plan-mode section for lifecycle, auto-persist, retro, completion
- [x] 5.2 `openspec validate polish-plan-lifecycle --strict`
- [x] 5.3 `pnpm lint`, `pnpm format`, affected package builds (`build:core`, `build:app` as needed)
