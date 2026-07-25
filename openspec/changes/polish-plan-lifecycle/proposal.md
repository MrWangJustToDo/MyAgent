## Why

Plan mode after `improve-plan-mode` is mechanically complete but feels rough versus Cursor: `create_plan` leaves the artifact mostly invisible (tool message + LLM overview), persistence is opt-in via `/plan save`, footer `plan` conflates mode with a hint, execution todos are generic, and finishing never forces a retrospective or clean exit. Users need a Cursor-like explore → review → Build → done lifecycle that fits the TUI (no scrollable plan card that fights terminal scrolling).

## What Changes

- Auto-persist plan markdown to `.agents/plans/` on successful `create_plan` / `update_plan` (and markdown fallback); keep `/plan save` as optional rename/copy.
- Surface a **static, non-scrolling** plan summary in the transcript (path, goal, numbered step titles) so the plan itself is clear without a dedicated scroll region.
- Clarify phase UX copy toward Cursor semantics: exploring / review / building (map from existing `planning` / `ready` / `executing`); footer indicates phase + progress, not a vague `plan` badge.
- Enrich plan-seeded todo presentation during building (step index, progress, plan association).
- **Forced retrospective** after all plan todos complete: enter a short `retro` phase, agent reviews against the plan file, then **complete** and exit plan mode (`off`).
- `/plan execute` remains the sole Build gate — no extra confirm dialog.
- Docs / Help / prompts updated for the lifecycle; no scrollable plan card UI.

## Capabilities

### New Capabilities

- _(none)_

### Modified Capabilities

- `plan-mode`: Lifecycle polish — auto-persist, static plan summary display, clearer phase labeling, richer plan todos, mandatory retro + formal completion.

## Impact

- Core: `PlanModeController` phases/events, `create_plan`/`update_plan` + plan-store wiring, plan prompts, optional auto-complete / retro steers.
- App: Footer / banner copy, `create_plan`/`update_plan` output formatting (Static-friendly summary), Todo UI when plan-seeded, `/plan` status messaging, Help / keyboard labels.
- Docs: `AGENTS.md` plan-mode section.
- Validation: plan persist-on-create, phase transitions including retro → off, summary formatting helpers.
