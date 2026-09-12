# Proposal: Unify Run Abort Ownership

## Why

Cancelling a run currently requires three independently maintained mechanisms to agree: `RunCoordinator` (per-run `AbortController` stack), `AgentRunner.resolveAbortController` (a fallback that can silently create a *second* controller), and `AgentChatController`'s manual `runGeneration`/`pumpDepth` counters. Their cooperative invariants (old pump must skip outcome/finalize, `pumpDepth` must not go negative, main/subagent paths must always pass the coordinator's controller) are documented only in comments — and a "double AbortController" bug (cancel aborted one controller while `chat()` listened to the other, so the LLM stream kept running) has already occurred. Every new call site or async branch in the pump risks reintroducing hard-to-reproduce double-finalize / un-cancelled-stream bugs.

## What Changes

- Make `RunCoordinator` the **single creation point** for run `AbortController`s; `AgentRunner.run` no longer auto-creates a fallback controller for the main/subagent run path (ad-hoc callers get an explicit, named opt-in).
- Replace numeric `runGeneration` comparisons in `AgentChatController` with a **run token object** (`token.isCurrent`) so "check you are still the active run" is enforced by API shape rather than convention.
- Consolidate `pumpDepth` with the existing `runChain` promise serialization (or justify and formalize its nesting rule with typed guarantees instead of comment-only invariants).
- **Serial `task` cascade (audit correction)**: the originally suspected gap does not exist — `ManagedAgent.abort()` already cascades to running child subagents (`cascadeAbortToChildren`, since `885174f`). Scope reduced to: fix the stale comment in `task-tool.ts:154-160` and add a regression test locking the cascade behavior.
- Add concurrency regression tests covering the abort/unwind matrix: abort during stream, abort during tool phase, cancel-then-immediately-resend, old-pump unwind after new run starts, and parent-abort cascade to a running serial `task` subagent.

## Capabilities

### New Capabilities

- `run-abort-ownership`: Single-source-of-truth rules for run cancellation — who creates the run `AbortController`, how cancellation propagates to the LLM stream and in-flight tools, and how a stale pump recognizes it is no longer current.

### Modified Capabilities

<!-- None: agent-lifecycle-events covers event emission contracts, not abort ownership; no existing spec constrains run cancellation. -->

## Impact

- `packages/core/src/managers/run-coordinator.ts` — becomes sole `AbortController` factory for managed runs.
- `packages/core/src/agent/runner/agent-runner.ts` — `resolveAbortController` fallback restricted/removed for managed paths; `AgentRunnerRunInput.abortController` becomes required on managed paths.
- `packages/core/src/managers/controllers/agent-chat-controller.ts` — `runGeneration` → run token; `pumpDepth` consolidation; `interruptCurrentRun` sequence simplification.
- `packages/core/src/agent/subagent/run-subagent.ts` and `managers/run-agent.ts` — call sites must pass the coordinator-owned controller explicitly.
- `packages/core/src/managers/managed-agent.ts` — no code change; `cascadeAbortToChildren` is the existing cascade mechanism and is now regression-tested.
- No host-facing API changes (CLI/App/Extension/im-bridge); behavior is bug-fix level. Session persistence formats untouched.
