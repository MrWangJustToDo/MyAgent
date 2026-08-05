## 1. Authoring schema and parsing

- [x] 1.1 Make `verification` required on `create_plan` / `update_plan` (`create-plan-tool.ts` / shared schema); quality guidance lives in prompts (no command-name blacklist in the tool gate)
- [x] 1.2 Add helper to parse Verification checklist items from plan markdown (or tool input string) into a stable ordered list
- [x] 1.3 Reject empty / whitespace-only verification in tool execute before `applyPlanArtifact`

## 2. complete_plan gate

- [x] 2.1 Extend `complete_plan` input with `verificationResults: { item, passed, evidence }[]`
- [x] 2.2 Implement gate: cover all parsed Verification items; reject on missing coverage or any `passed: false`; allow N/A single-item path when plan has no Verification section (legacy)
- [x] 2.3 Confirm `/plan done` (user force) still exits without the agent gate

## 3. Prompts and task guidance

- [x] 3.1 Update `buildPlanModePlanningPrompt` for mandatory behavioral Verification and incomplete-explore rules
- [x] 3.2 Update executing + retro prompts to require Verification evidence before done / `complete_plan`
- [x] 3.3 Expose task completion status to the model; prompt/description guide trustworthy/extendable judgment from flags (not hardcoded 429-only rules)

## 4. Validation and docs

- [x] 4.1 Add `validate:plan-verification` script covering parse + complete_plan gate helpers
- [x] 4.2 Update AGENTS.md / ARCHITECTURE plan sections for the verification contract
- [x] 4.3 Run scoped format/lint on touched files and `pnpm build:core`
