## Why

Plan mode can finish with green lint/build while behavioral bugs remain (e.g. session media resume returning dehydrated messages). Agents treat optional `verification` and a soft retrospective as done, so gaps only surface when a second agent or the user re-scans. We need the plan lifecycle to require executable acceptance criteria and evidence before exit.

## What Changes

- Make plan **Verification** mandatory when authoring via `create_plan` / `update_plan` (non-empty checklist; outcome quality guided by prompts, not a hardcoded command blacklist).
- Strengthen planning / executing / retro prompts so verification items drive work and cannot be skipped.
- Gate `complete_plan`: require structured verification results; reject completion when any item failed or is missing.
- Optionally seed verification items as plan-bound todos during execute (or keep them as a checked list at retro only — design will pick one).
- On explore/`task` failure signals (`limit reached`, truncated summary, all 429), planning must not finalize a plan from that incomplete research (prompt + light tooling guidance).
- Docs: AGENTS.md / ARCHITECTURE plan sections updated for the new contract.
- **Not in scope:** syncing execution progress into `.agents/plans/*.md`; automatic second-review agent; changing session todo as source of truth for step progress.

## Capabilities

### New Capabilities

- `plan-verification`: Acceptance criteria and evidence gates across plan authoring, build, and retrospective completion.

### Modified Capabilities

- (none in `openspec/specs/` — plan mode lives in prior change specs; this change introduces `plan-verification` rather than forking archived `plan-mode` deltas.)

## Impact

- `@my-agent/core`: `create-plan-tool` / `complete_plan` schemas, `plan-prompts`, possibly `PlanModeController` / todo seeding, task/subagent guidance for failed exploration.
- `@my-agent/app`: plan ready banner / help copy if verification is shown.
- Validation script for `complete_plan` gating and schema.
- Existing sessions/plans with missing verification remain loadable; new authoring requires verification.
