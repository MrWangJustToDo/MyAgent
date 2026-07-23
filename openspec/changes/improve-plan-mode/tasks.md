## 1. P0 — Allow task + richer prompts

- [x] 1.1 Remove `task` from `PLAN_MODE_EXCLUDED_TOOL_NAMES` and update any comments/docs that say task is blocked
- [x] 1.2 Expand `buildPlanModePlanningPrompt` / ready prompts: prefer `task`, clarify questions, richer plan structure
- [x] 1.3 Add/update validate script asserting `task` is not in the plan exclude set; update AGENTS.md plan-mode table
- [x] 1.4 Run core validate + `pnpm build:core` / lint / format for P0

## 2. P1 — Structured plan tools + ready UX

- [x] 2.1 Add `create_plan` / `update_plan` tools wired to `PlanModeController` (ready transition + todo seed)
- [x] 2.2 Keep `## Plan` extraction as fallback; share one apply-plan path
- [x] 2.3 App: dedicated ready banner/actions (execute / revise / exit) beyond footer text
- [x] 2.4 Validate scripts + docs for structured plan tools

## 3. P2 — Clarifying questions + keyboard toggle

- [x] 3.1 Clarifying-questions tool or convention + app surface for Q&A in planning
- [x] 3.2 Bind Shift+Tab to toggle plan mode from chat input; document in Help / keyboard labels
- [x] 3.3 Validate / smoke keybinding does not break approval or autocomplete flows

## 4. P3 — Persist plans

- [x] 4.1 Save current plan markdown under `.agents/plans/`
- [x] 4.2 Load saved plan into ready state (`/plan load` or UI)
- [x] 4.3 Docs + validate round-trip save/load

## 5. Wrap-up

- [x] 5.1 `openspec validate improve-plan-mode --strict`
- [x] 5.2 Final lint / format / affected package builds
