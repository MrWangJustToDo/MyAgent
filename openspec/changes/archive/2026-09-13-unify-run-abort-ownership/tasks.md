# Tasks: Unify Run Abort Ownership

> 决策（2026-09-13）：pump 级测试（原 1.1/1.2/1.3 及依赖它的 5.1）移出本 change，另立 follow-up change（repo 无现成完整 pump harness，需 ManagedAgent + AgentManager + fake adapter 贯通）。本 change 以单测级覆盖收尾。

## Moved out（follow-up change：pump 级 abort/unwind 测试）

- abort/unwind matrix 测试：abort during streaming、abort during tool phase、cancel-then-immediately-resend、old-pump unwind after new run starts
- single-finalize 断言：interrupt 路径 + 旧泵自然完成同 run → 恰好一次 finalizeRun
- 持久化测试：aborted run 的 incomplete tools 以 cancelled 落盘并在 resume 后存活

## 1. Characterization tests (land first, green on current code)

- [x] 1.4 Add a test pinning the historical double-controller shape: managed-path `AgentRunner.run` without a coordinator controller must be rejected (type-level after step 3; guarded until then)
- [x] 1.5 Add regression test locking the existing serial-`task` cascade: parent `ManagedAgent.abort()` aborts a running child subagent via `cascadeAbortToChildren` (audit correction — behavior already exists since `885174f`)

## 2. RunToken introduction

- [x] 2.1 Implement `RunToken` (`id`, `isCurrent`, `invalidate`) in `RunCoordinator`; `beginRun()` returns the token and registers the run's `AbortController`
- [x] 2.2 Route `interruptCurrentRun` and any supersede path through `token.invalidate()` before cancel/cleanup steps
- [x] 2.3 Move `pumpDepth` reset adjacent to token invalidation (single owner function); replace negative-guard comment with token-currency precondition

## 3. Switch pump to token checks

- [x] 3.1 Capture token at pump entry in `AgentChatController`; replace `generation !== runGeneration` checks with `token.isCurrent` (pump loop, executeStream, continuation phase)
- [x] 3.2 Gate outcome adjudication + finalize on `token.isCurrent`; remove `runGeneration` field once no readers remain
- [x] 3.3 Ensure steer/followUp enqueue paths and `defer-mid-run-queue` consult token currency so stale pumps cannot swallow new input

## 4. Single controller ownership in runner paths

- [x] 4.1 Split `AgentRunnerRunInput` so managed paths require `abortController`; name the detached opt-in for ad-hoc callers and document it as unreachable from managed runs
- [x] 4.2 Sweep call sites: `managers/run-agent.ts`, `agent/subagent/run-subagent.ts`, `managers/run-stream-recovery.ts` — pass coordinator-owned controller; recovery restarts link child signals, never new root controllers (verified: all managed callers already pass the coordinator controller; `resolveAbortController` now throws otherwise)
- [x] 4.3 Cascade regression coverage: matrix test asserts parent abort aborts a running serial-`task` child (via `cascadeAbortToChildren`); verify task tool settles `aborted: true` and prefork assertions unchanged (tests task 1.5, no rewiring)
- [x] 4.4 Delete superseded comment-only invariant docs in `agent-chat-controller.ts` and `agent-runner.ts` replaced by the type/API guarantees; remove the stale "parent cancel must not cascade / app layer cancels" comment in `task-tool.ts:154-160`

## 5. Validation

- [x] 5.1 Existing validate suites green (run-coordinator / run-finalize / task-prefork / task-run-state / agent-run-finalization / run-abort-ownership); typecheck + build pass. Pump 级 matrix 测试已移出（见 Moved out）
- [x] 5.2 `pnpm typecheck` and `pnpm build:core` pass; lint/format changed files
- [ ] 5.3 Manual smoke: CLI cancel mid-tool, cancel mid-stream, cancel-then-resend — status/events/queues project correctly to host
