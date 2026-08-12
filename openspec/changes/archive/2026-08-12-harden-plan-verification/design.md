## Context

Plan mode already has phases (`planning` → `ready` → `executing` → `retro` → `off`), structured `create_plan` / `update_plan` / `complete_plan` tools, and a Verification markdown section — but `verification` is optional and `complete_plan` only needs a free-text note. Agents routinely exit after lint/build while behavioral regressions slip through. Exploration via `task` can hit iteration limits or 429s; incomplete research still becomes a plan.

Constraints: keep session todos as execution progress source of truth; do not require writing progress into `.agents/plans/*.md` in this change; prefer prompt + schema gates over heavy new runtime subsystems.

## Goals / Non-Goals

**Goals:**

- Mandatory Verification checklist on plan authoring (non-empty; content quality via prompts).
- Retro/`complete_plan` cannot succeed without per-item pass/fail evidence.
- Executing prompts require running verification (or documenting blockers) before claiming done.
- Planning must not finalize from clearly failed/truncated exploration.
- Small validate script covering schema/gating helpers.

**Non-Goals:**

- Persisting step checkboxes into plan markdown files.
- Auto-spawning a second review agent.
- Changing CoreEnv, session media, or compaction.
- Hard-blocking `/plan done` from the user CLI (user override remains allowed; agent tool path is gated).

## Decisions

1. **Gate at tool schema + prompts (not a new phase)**  
   - **Why:** Lowest churn; fits existing retro phase.  
   - **Alt:** New `verifying` phase — clearer UX but more controller/UI work; defer.

2. **`verification` becomes required string with checklist semantics**  
   - Format: markdown list lines (or newline-separated items). Parser extracts items for `complete_plan` matching (normalize by trimmed text / index).  
   - **Why:** Keeps plan file human-readable; no new SessionData fields required for v1.  
   - **Alt:** Structured `verificationItems: string[]` on the tool — better typing, slightly more UI; accept if schema change is easy alongside string field.

3. **`complete_plan` requires `verificationResults: { item: string, passed: boolean, evidence: string }[]`**  
   - Tool execute rejects when: empty results, count/mismatch vs plan verification items, or any `passed: false`.  
   - User `/plan done` may still force-exit (document as escape hatch).  
   - **Why:** Enforces agent honesty without trapping humans.

4. **Verification todos: prompt-first in v1; optional seed in P1**  
   - v1: executing/retro prompts insist on running Verification before complete.  
   - Optional follow-up task: seed Verification lines as plan-bound todos at execute — only if cheap with existing TodoManager.  
   - **Why:** Avoids double bookkeeping bugs in the first slice.

5. **Explore failure: prompt rules + task tool description**  
   - `task` `toModelOutput` includes completion status; planning prompt tells the agent to judge trustworthy/extendable from those flags before `create_plan`.  
   - No new event bus type required for v1.  
   - **Why:** Fixes the observed failure mode without subagent architecture changes.

6. **Do not sync progress into plan files**  
   - Confirmed product choice from prior discussion; session todos remain authoritative for step progress.

## Risks / Trade-offs

- [Agents invent fake evidence] → Mitigation: evidence must cite command name or file path; validate script can only check structure, not truth — human review of ready banner still matters.  
- [Old plans without Verification] → Mitigation: `update_plan` requires verification going forward; loading old plans into ready still works; complete_plan on old plans: if no verification section, require at least one explicit result covering "no checklist — smoke validate" or allow complete with warning once. Prefer: if plan has no Verification section, complete_plan requires `verificationResults` with a single item explaining N/A + smoke checks run.  
- [User blocked by strict agent] → Mitigation: `/plan done` remains force exit.  
- [Prompt-only explore rule ignored] → Mitigation: strengthen task tool description; future: surface `truncated`/`limitReached` on task output for middleware (out of scope unless cheap).

## Migration Plan

1. Ship schema + prompt changes; add validate script.  
2. No session migration.  
3. Rollback: revert tool schemas/prompts; old clients unaffected (in-process tools).

## Open Questions

- None blocking — Verification-as-todos deferred to optional task if time permits.
