## Context

`add-plan-mode` shipped phases (`off` → `planning` → `ready` → `executing`), mutate-tool exclusion, `## Plan` extraction, and `/plan` commands. Gaps vs Cursor / Claude Code: `task` is in `PLAN_MODE_EXCLUDED_TOOL_NAMES` (hurts exploration), plan quality depends on free-form markdown + regex, and approve/execute UX is footer + slash only.

## Goals / Non-Goals

**Goals:**

- Planning stays read-only for workspace mutation while allowing parallel `task` exploration
- Plans become structured first-class artifacts (tool + UI), with markdown extraction as fallback
- Users can clarify requirements, toggle mode quickly, and persist plans to disk
- Phased delivery: P0 → P3 without breaking existing `/plan` flow

**Non-Goals:**

- Cursor-style cloud plan canvas / multi-plan trees
- Allowing mutate tools or unrestricted MCP during planning
- Changing TodoManager internals beyond plan seeding

## Decisions

1. **`task` allowed in planning/ready** — Subagents already use read-only tools; excluding `task` was overly cautious and regresses vs Claude Explore. Keep excluding write/edit/delete/copy/move, `kill_command`, and MCP. Middleware still blocks if somehow invoked incorrectly.

2. **Phased tools** — P0 only changes exclude set + prompts. P1 adds `create_plan` / `update_plan` that call into `PlanModeController` (same ready seeding as extraction). Keep `extractPlan` as fallback when the model writes `## Plan` without calling the tool.

3. **Clarifying questions (P2)** — Prefer a lightweight `ask_plan_questions` tool or structured prompt section with numbered options rendered in app; do not block planning forever if the user skips answers.

4. **Mode switch (P2)** — Bind Shift+Tab when input focused and idle (or always when not in approval deny-reason mode) to `togglePlanMode()`, matching Cursor muscle memory. Keep `/plan` as the explicit command.

5. **Persistence (P3)** — Write under `.agents/plans/<slug>.md` via CoreEnv fs; load on demand via `/plan load` or ready UI. Session still holds in-memory plan for the active agent.

6. **Block messages** — When a forbidden tool is filtered from the list but the model still emits a call, middleware MUST return the existing plan-mode block reason (already implemented). Ensure tools are only excluded (not renamed) so we never surface a bare `Unknown tool` for policy — if TanStack reports unknown for excluded tools, keep them registered but middleware-skipped OR document that exclusion causes unknown; prefer **exclude from offered list + middleware** (current). The screenshot `Unknown tool: task` is from exclusion; allowing `task` fixes that case. For other blocked tools, if the provider still somehow calls them after exclusion, middleware handles it — no change needed beyond prompt clarity.

## Risks / Trade-offs

- [Risk] Model uses `task` for speculative mutate work via shell in subagent → Mitigation: subagent tool set has no `run_command` / write tools today.
- [Risk] Dual plan paths (tool vs markdown) diverge → Mitigation: both funnel through `PlanModeController.onPlanReady` / same seeding.
- [Risk] Shift+Tab conflicts with terminal multiplexers → Mitigation: document; keep `/plan` primary for constrained terminals.
- [Risk] Persisted plans stale after code changes → Mitigation: treat as starting point; execute still runs against live tree.

## Migration Plan

- Opt-in behavior changes; existing `/plan` continues to work.
- P0 is a small behavior change (task available). Ship first.
- No schema migration for sessions beyond optional plan file path field later.

## Open Questions

- Exact clarifying-question UI for CLI vs extension (shared component vs CLI-only first).
- Whether `create_plan` should auto-transition to `ready` or require user confirm before `ready`.
