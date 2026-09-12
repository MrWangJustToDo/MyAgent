# Design: Unify Run Abort Ownership

## Context

Today a run's cancellation correctness is coordinated across three places:

1. **`RunCoordinator`** (`packages/core/src/managers/run-coordinator.ts`) — owns `pendingAbortControllers` (a stack keyed by run), created per run in `prepareForRun` / `executeManagedAgentRun` (`managers/run-agent.ts:266-314`). `managed.abort(reason)` fires the current controller.
2. **`AgentRunner.resolveAbortController`** (`agent/runner/agent-runner.ts:86-102`) — if `input.abortController` is omitted, creates a *fresh* controller linked to an optional signal. Intended as a fallback for ad-hoc callers; main/subagent paths "don't use it today" (comment at `:60-62`), but nothing prevents a call site from silently relying on it — this is the historical "double AbortController" bug (cancel fired one controller while `chat()` listened to the other; the stream kept running).
3. **`AgentChatController`** (`managers/controllers/agent-chat-controller.ts:50-52, 104-119, 323-440`) — manual `runGeneration` counter (bumped on interrupt so the unwinding old pump skips outcome/finalize) and `pumpDepth` nesting counter (reset to 0 on interrupt, `Math.max(0, ...)` guard in the old pump's finally), plus a `runChain` promise that serializes pump entries.

All invariants are comment-only. `interruptCurrentRun` is a 7-step ordered sequence whose correctness depends on every async callback in the old pump checking `generation !== runGeneration` before touching shared state.

Constraints:
- Host-facing behavior must not change (CLI / App / Extension / im-bridge observe the same status/event projections).
- Subagents share the run skeleton (`agent/run/run-agent-skeleton.ts`) and must follow the same ownership rules.
- Stream recovery re-runs (`run-stream-recovery.ts`) create new run attempts within one logical run; ownership rules must cover attempt-level controllers too.

## Goals / Non-Goals

**Goals:**
- One creation point for run `AbortController`s; type-level impossibility of a second one on managed paths.
- "Am I still the current run?" answered by an object identity check, not numeric comparison convention.
- Single finalize guarantee for an interrupted run.
- Regression tests for the abort/unwind matrix.

**Non-Goals:**
- Reworking stream-recovery strategies or their retry budgeting (separate change).
- Changing event emission contracts (`agent-lifecycle-events` spec untouched).
- Restructuring `AgentChatController` beyond abort-related state.
- Persistence format changes.

## Decisions

### D1: `RunCoordinator` is the sole controller factory; runner fallback becomes explicit opt-in

- `AgentRunnerRunInput` splits into two shapes: managed callers MUST pass `abortController` (required field on the managed-path input type); an explicitly named escape hatch (e.g. `createDetachedAbortController()` or a `detached: true` input variant) remains for ad-hoc callers, and its doc comment states it must never be reachable from the managed run path.
- **Why not delete the fallback outright?** Ad-hoc `AgentRunner` consumers (dev scripts, probes) legitimately run without a coordinator. Making the detached path *named* converts an accidental hazard into a deliberate choice.
- **Alternative considered**: have `resolveAbortController` throw when no controller is given. Rejected — it would force every ad-hoc caller to fabricate controllers and would not prevent them from *passing the wrong* (non-coordinator) controller, which is the actual bug shape.

### D2: Run token replaces `runGeneration`

- `RunCoordinator.beginRun()` returns a `RunToken` (`{ readonly id: string; get isCurrent(): boolean; invalidate(): void }`). `interruptCurrentRun` and any supersede path invalidate the current token. Pump iterations capture their token at entry and check `token.isCurrent` where they previously compared `generation !== runGeneration`.
- **Why an object over a counter?** The counter works today, but every *new* check site must remember to compare against the right captured value and skip the right steps. `token.isCurrent` bundles "capture + compare + invalidate" into one API, so a forgotten check is a visible API omission, and review of pump code greps for `isCurrent` uniformly.
- `pumpDepth` stays as a plain counter for now, but its reset rule moves next to the token invalidation (single function owns both), and the negative-guard comment is replaced by the token-currency precondition (a non-current pump never decrements — depth drift becomes structurally impossible rather than guarded).

### D3: Finalize-once via token, not idempotent-guard duplication

- `finalizeRun` keeps its existing idempotent guard, but the token invalidation now *precedes* any finalize path; the interrupt path and the old pump both check `token.isCurrent` before finalizing, so exactly one of them can proceed. This keeps a single mechanism (token currency) responsible for the guarantee instead of generation + guard + finalizeRun's own guard.

### D4: Recovery attempts and subagents inherit the same controller

- `run-stream-recovery.ts` restart paths reuse the coordinator's controller for the same logical run (new attempt controllers, if any, are linked as children signals, not new roots).
- `run-subagent.ts` passes the subagent's coordinator token/controller explicitly; parent teardown invalidates the child token via existing destroy paths.

### D5: Serial `task` cascade — audit correction, comment fix + regression test

- **Correction**: the original premise (serial `task` cascade missing) was wrong. `ManagedAgent.abort()` already cascades to running child subagents via `cascadeAbortToChildren` (`managed-agent.ts:1387-1413`, landed in `885174f`, 2026-08-24): children in running/compacting/thinking/responding status receive `child.abort(reason)`. The serial `task` subagent is a child managed agent, so parent abort already stops its stream.
- What is actually stale is the comment at `task-tool.ts:154-160` ("parent cancel must not cascade… The app layer cancels via agentManager → sub.abort()") — it describes a mechanism that exists elsewhere (ManagedAgent cascade) in misleading terms. Fix: rewrite the comment to point at `cascadeAbortToChildren`.
- No rewiring: passing the parent signal into the serial `runSubagent` call would be redundant. Child still owns its controller; parent→child cascade flows through the existing child-registration path, matching prefork semantics.
- Add a regression test locking the cascade behavior (parent abort ⇒ running child aborted), so the invariant that currently lives in `cascadeAbortToChildren` is pinned by a test rather than only by code reading.

## Risks / Trade-offs

- [Missed `isCurrent` check in a rarely-exercised branch reintroduces a stale-pump bug] → The matrix test suite (spec requirement 4) is written **before** the refactor lands (characterization tests against current behavior), so the refactor must keep them green.
- [Stricter input type ripples into existing call sites / probes in `tmp/`] → Call-site sweep is mechanical; `tmp/` scripts are not part of the package and may break silently — acceptable, noted in tasks.
- [Token object adds allocation per run] → Negligible (one small object per run, not per chunk).
- [Behavior change is invisible if tests don't pin the old bug] → Add one test that reproduces the historical double-controller shape (runner invoked without controller on managed path = type error / explicit opt-in required).

## Migration Plan

1. Land characterization tests (green on current code).
2. Introduce `RunToken` alongside `runGeneration` (both mechanisms live briefly; token is authoritative).
3. Switch controller pump checks to token; remove `runGeneration`.
4. Restrict `AgentRunner` input types; sweep call sites (`run-agent.ts`, `run-subagent.ts`, `run-stream-recovery.ts`).
5. Remove comment-only invariant docs superseded by types.

Rollback: steps 3–4 are single reverts; token and generation coexist in step 2 so any intermediate state is shippable.

## Open Questions

- Whether `runChain` and `pumpDepth` can fully merge: `runChain` serializes pump *entries*, `pumpDepth` tracks *nested* pumps (re-pump within an entry). Likely they stay distinct but co-located; resolve during implementation and record the outcome in the design note if it deviates from D2.
