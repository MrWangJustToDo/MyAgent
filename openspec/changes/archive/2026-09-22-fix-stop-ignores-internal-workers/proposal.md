# Change: Stopping a run must not be hijacked by internal workers

## Why

Pressing Esc while auto-compaction runs does nothing to the session. The user sees the compaction banner disappear, and then compaction starts again by itself, with no new submission in between.

The cause is not inside compaction. `stop()` in `packages/app/src/hooks/use-agent-chat.ts:346` decides whether to abort the session or to abort child subagents by asking whether any subagent is active — but the `subagents` snapshot **deliberately includes internal workers** (compaction, and any future memory summarizer):

```
packages/core/src/agent-session/local-session-snapshot.ts:28
  // Includes internal workers (compaction / memory summarizers): the task
  // panel doubles as an observability surface for hidden agents.
```

A compaction summarizer runs with status `compacting`, which `ACTIVE_STATUSES` counts as active (`packages/core/src/runtime-types/agent-status.ts:27-35`). So `activeChildren.length > 0` is satisfied by the summarizer itself, `stop()` takes the subagent-first branch, and **returns without ever dispatching `stop` to the session**:

```ts
// packages/app/src/hooks/use-agent-chat.ts:346
const activeChildren = session.getSnapshot().subagents.filter((c) => isActiveStatus(c.status));
if (activeChildren.length > 0) {
  for (const child of activeChildren) {
    void resolveAgentSession(child.id)?.dispatch({ type: "stop" });
  }
  return;                                  // ← the session is never stopped
}
void session?.dispatch({ type: "stop" });
```

The `subagent-first` branch is correct and intentional for `task` subagents: `runSubagent` sets `aborted: true` and appends `[Task cancelled by user.]` into the task summary so the parent model learns the delegation was cancelled. That protocol needs the parent run to continue. But it does not hold for internal workers — a compaction summarizer has no `parentTaskToolCallId` (`parentTaskId` is only assigned from `parentTaskToolCallId`, `packages/core/src/agent/subagent/run-subagent.ts:115`) and its outcome is never written back to the parent model. For those rows the branch is pure regression: the child stops, the session keeps running.

The recurring compaction follows from the session never being stopped:

1. The main run's controller is never aborted, so its status stays `compacting` and the engine loop keeps going.
2. The loop re-enters `onConfig`; the compaction middleware re-evaluates and finds `alreadyCompacted === false` — `applyCompactionResult` never ran, because no summary was produced — while the window is still over the trigger. It compacts again.
3. The post-run guard in `summarizeConversationBatch` (`packages/core/src/agent/compaction/auto-compact.ts:293`) cannot break the cycle either: it tests the **parent** signal, `result.aborted || options?.abortSignal?.aborted`, and the parent signal is precisely the one that was never aborted.

The user-visible loop is therefore a direct consequence of the skipped dispatch, not a compaction defect.

## What Changes

- `stop()` distinguishes a **user-visible task row** (identified by `parentTaskToolCallId`, already present on `AgentSessionSubagentSummary`) from an **internal worker row** (absent). Only task rows take the subagent-first branch; internal workers never make `stop()` skip the session.
- When the session is stopped while an internal worker is active, that worker is cancelled as part of stopping the session — it is not left running behind an aborted parent.
- The judgement "which subagent rows may suppress the session stop" is recorded as a requirement, so adding another internal worker cannot silently reintroduce the hijack.
- Regression coverage for both branches of `stop()`: internal-worker-only, and task-active. Neither is covered today — `packages/app/test/` contains no test that reaches this branch, which is how the regression survived.

Out of scope: whether internal workers belong in the `subagents` snapshot at all. They are intentionally visible (the task panel is an observability surface for hidden agents, per the comment above), and this change keeps that behaviour. It only stops them from hijacking cancellation.

## Impact

- Affected specs: `run-abort-ownership`
- Affected code:
  - `packages/app/src/hooks/use-agent-chat.ts` (`stop`)
  - `packages/core/src/agent/subagent/run-subagent.ts` (only if the internal-worker path needs an explicit cancellation marker)
  - `packages/app/test/` (new coverage for the `stop()` branches)
- Not affected: the `task` subagent cancellation protocol, the `subagents` snapshot shape and its visibility in the task panel, compaction's own trigger and summarization behaviour.
