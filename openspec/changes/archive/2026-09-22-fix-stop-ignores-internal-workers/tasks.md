## 1. Identify user-visible task rows

- [x] 1.1 Confirm the discriminator on the existing snapshot type: `AgentSessionSubagentSummary.parentTaskToolCallId` is present for `task` rows and absent for internal workers (`packages/core/src/agent-session/types.ts:93`; assigned only from `parentTaskToolCallId` at `packages/core/src/agent/subagent/run-subagent.ts:115`)
- [x] 1.2 Re-verify the assignment matrix at all four `runSubagent` call sites, so the discriminator is not resting on a single example:
  - `agent/subagent/task-tool.ts` — task binding present
  - `managers/middleware/task-prefork-middleware.ts` — task binding present
  - `agent/compaction/auto-compact.ts` — absent (internal)
  - `agent/subagent/progress-summary.ts` — absent (internal)
- [x] 1.3 Export a shared predicate for "this subagent row may take the subagent-first stop branch" rather than inlining the check at the call site, so the rule has one home

## 2. Fix the stop decision

- [x] 2.1 In `packages/app/src/hooks/use-agent-chat.ts` (`stop`, currently line 346), filter the active set to task-bound rows for the subagent-first branch
- [x] 2.2 Make the session stop unconditional: it MUST run whether or not task rows were stopped, preserving the `task` subagent cancellation protocol (child first — its cancel notice must be readable by the parent)
- [x] 2.3 Keep internal workers from being left running behind an aborted session (abort the session; confirm the cascade reaches the worker, since `cascadeAbortToChildren` gates on active status)
- [x] 2.4 Leave the `subagents` snapshot and its task-panel visibility unchanged — internal workers stay visible

## 3. Regression coverage

- [x] 3.1 Add a `stop()` branch test: internal-worker-only active set still aborts the session
- [x] 3.2 Add a `stop()` branch test: active `task` subagent is stopped and its cancellation is reported to the parent
- [x] 3.3 Assert the negative directly — a compaction summarizer active at stop time must not leave the session run un-aborted (the observable was "compaction restarts with no new submission")
- [x] 3.4 Sabotage both new tests (revert the filter to the unfiltered active set) and confirm they fail with a message naming the suppressed stop, then restore

## 4. Verification

- [x] 4.1 `pnpm --filter @codent/app test`
- [x] 4.2 `pnpm --filter @codent/app validate:render-smoke` (render layer is touched)
- [x] 4.3 Full validator suite: `node scripts/run-all-validators.mjs`
- [x] 4.4 `pnpm lint` and `pnpm typecheck`

## 5. Follow-ups (not part of this change)

- [ ] 5.1 Audit `packages/core/src/managers/run-stream-recovery.ts`: it never calls `isAbortError`, gating on a bare `options.signal?.aborted` even though the predicate exists precisely because "signal presence can be unreliable" (its own doc comment). Decide whether recovery should consult the predicate.
- [ ] 5.2 Decide whether the compaction middleware should check the run signal synchronously before entering `autoCompact`, rather than only after the summarizer returns (`packages/core/src/agent/compaction/auto-compact.ts:293`)
- [ ] 5.3 Decide whether a tool row that is pending execution (awaiting approval / client tool) should defer the auto-compaction trigger, so its loading row is not held across a compaction. Observed symptom is unconfirmed as this scenario; needs a reproduction first.
