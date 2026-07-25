## Context

`improve-plan-mode` shipped structured `create_plan` / `update_plan`, Shift+Tab toggle, `/plan save|load`, and a thin ready banner. Gaps vs Cursor Plan and user feedback:

- Plan body lives in controller memory; disk write is manual (`/plan save`).
- Transcript shows a short tool message; the model often narrates an overview instead of showing the plan.
- Footer labels (`plan`, `plan ready`, `plan N/M`) obscure that these are **phases of one mode**.
- Building uses a generic todo list UI.
- No mandatory wrap-up: phase can linger after all steps are done.

TUI constraint: do **not** add a focusable/scrollable plan panel (conflicts with terminal scroll / input). Prefer Static transcript summaries + file on disk.

## Goals / Non-Goals

**Goals:**

- Cursor-like lifecycle: explore → review → Build (`/plan execute`) → build with visible plan todos → **forced retro** → exit plan mode.
- Auto-persist plans under `.agents/plans/` on create/update.
- Clear, static plan summary in chat (path + goal + step titles).
- Clearer phase copy in footer/banner/prompts without breaking existing phase enum consumers unnecessarily.
- Richer presentation when todos are plan-seeded.

**Non-Goals:**

- Scrollable / focusable plan card or side panel in the TUI.
- Extra confirm dialog before execute (Build = `/plan execute` only).
- Cursor parallel Build / multi-agent plan trees.
- Hand-editing plan markdown inside the TUI (users may edit the file externally and `/plan load`).
- Renaming internal phase enum to exploring/review/building if a display-layer mapping is enough (prefer mapping first).

## Decisions

1. **Phases (internal vs display)**  
   Keep controller phases `planning | ready | executing` and add `retro` (then `off` on complete).  
   UI/copy mapping: `planning`→exploring/planning, `ready`→review, `executing`→building, `retro`→retro.  
   **Alternative considered:** Rename enum to Cursor words — deferred to avoid churn in events/middleware; display mapping is enough for this change.

2. **Auto-persist on apply**  
   On successful `applyStructuredPlan` / `applyPlanArtifact`, call `savePlanFile` (overwrite active path if set; else slug from goal). Store `planFilePath` on controller state.  
   `/plan save [name]` remains for explicit rename/copy.  
   **Alternative:** Persist only on ready enter once — rejected; updates must rewrite the same file during review.

3. **Static plan summary (no scroll card)**  
   `create_plan` / `update_plan` `toModelOutput` + app `formatCreatePlanOutput` emit a bounded text block: file path, goal, numbered step titles (truncate long lists with “+N more; see file”). Rendered in normal message/Static flow — no nested scroll viewport.  
   Full body: `read_file` on the plan path or external editor.

4. **Build gate**  
   Unchanged: `/plan execute` (and existing command path) starts building. No second confirmation. Ready banner keeps pointing at execute.

5. **Forced retro**  
   When phase is `executing`, plan todos are seeded, and all plan todos reach `completed`, controller transitions to `retro`, emits `plan:retro` (or reuse a documented event), injects a steer/prompt: review against the plan file (done / deviations / verification). Tools: same as normal agent (writes allowed) but prompt insists on retrospective, not new scope.  
   Completion: agent calls a small `complete_plan` tool **or** user `/plan done` after retro text — prefer **`complete_plan` tool** (or `plan_complete`) so the model closes the loop; `/plan done` as escape hatch. On complete → clear plan todos policy (existing disable behavior), phase `off`, emit `plan:exit` / `plan:complete`.  
   **Alternative:** Auto-exit without model retro — rejected (user required forced retro).

6. **Plan todo UI**  
   When `TodoManager` title is `Plan` (or plan-seeded flag), TodoToolOutputView / footer show `building i/n`, step numbers, optional link to `planFilePath`. Do not invent a second todo system.

7. **Read-only rules**  
   `planning` + `ready` stay mutate-restricted; `executing` + `retro` allow mutate tools. Retro must not re-lock tools (retrospective may need to note verification commands).

## Risks / Trade-offs

- [Risk] Auto-save floods `.agents/plans/` with drafts → Mitigation: overwrite same active file during a session; slug once per create.
- [Risk] Retro never finishes (model keeps coding) → Mitigation: tight retro prompt + `complete_plan` required; footer shows `retro` until done; optional nag if idle.
- [Risk] Markdown fallback path forgets persist → Mitigation: shared `applyPlanArtifact` always persists.
- [Risk] Display phase rename confuses users mid-session → Mitigation: Help + `/plan status` show both internal and display labels briefly if needed.
- [Trade-off] No inline plan editor → Acceptable under TUI scroll constraint; file + `update_plan` + chat revise.

## Migration Plan

- Behavior additive for existing sessions: old in-memory-only plans gain auto-save on next create/update.
- No session schema migration required beyond optional `planFilePath` on plan state (runtime).
- Rollback: feature-flag unnecessary; revert change restores prior prompts/footer.

## Open Questions

- Exact event name (`plan:retro` vs fold into `plan:ready`-style bus) — prefer new `plan:retro` + `plan:complete` for log bridge clarity.
- Whether retro should block `/plan` toggle-off until `complete_plan` (prefer: allow `/plan` exit to abort with warning, but normal path is complete_plan).
