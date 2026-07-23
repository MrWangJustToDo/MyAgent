## Why

Plan mode v1 is usable but rough compared to Cursor / Claude Code: it blocks the read-only `task` subagent (causing `Unknown tool: task`), plan output is fragile chat markdown extraction, and UX for review/execute is thin (footer + `/plan` only). Users need exploration-quality planning and a clearer approve → build loop.

## What Changes

- **P0**: Allow `task` during `planning` / `ready`; improve plan-mode prompts to prefer parallel read-only exploration and richer plan structure.
- **P1**: First-class plan artifact via `create_plan` / `update_plan` tools (structured steps, files, risks); dedicated ready-state UI for review / execute / revise (keep `## Plan` extraction as fallback).
- **P2**: Clarifying-question flow before finalizing a plan; Shift+Tab (or equivalent) to toggle plan mode from the input.
- **P3**: Persist plans as editable markdown under `.agents/plans/` (save / resume / re-execute).
- Clarifying error messages when a blocked tool is invoked (no opaque `Unknown tool` for policy blocks).

## Capabilities

### New Capabilities

- _(none — extends existing plan-mode)_

### Modified Capabilities

- `plan-mode`: Allow read-only `task` while restricting mutate tools; structured plan tools + richer prompts; clarifying questions; keyboard mode switch; plan file persistence; improved ready UX.

## Impact

- Core: `packages/core/src/agent/plan/*`, task tool availability in `plan-tools.ts`, prompts, optional new plan tools, middleware block messages.
- App: Footer / plan ready UI, keybindings (`Shift+Tab`), `/plan` command copy, message rendering for plan cards.
- Docs: `AGENTS.md` plan-mode section, Help text.
- Validation: update/add core validate scripts for plan tool exclude set and plan artifact parsing.
