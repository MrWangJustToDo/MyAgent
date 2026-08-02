## Why

Main agents and subagents already share `ManagedAgent` + `AgentRunner` middleware, but outer orchestration still forks: chat uses `AgentChatController` (multi-phase pump, queues, session persist) while subagents use `runSubagent` (single shot, optional UI, detached outcome). That duplication makes stream consume / prepare→run→consume→finalize harder to reason about and blocks later work (interactive subagents, multiple root agents) without a clear shared skeleton. AgentSession already unified the host surface; this change aligns the **internal run skeleton** without changing product behavior.

## What Changes

- Extract a small shared **single-run** path used by both chat phases and subagent runs: prepare → `runAgentStream` → consume → apply outcome (path-aware).
- Unify stream consumption (`ui` vs `headless`) so chat `executeStream` and `runSubagent` do not maintain parallel consume logic; remove or fold unused `runManagedAgent({ bridgeUI })` dual path where it overlaps.
- Keep **two profiles** on top of the skeleton: InteractiveChat (pump, steer/followUp, approvals, session persist, `path: "chat"`) vs Worker (single shot, tool/isolation rules, `path: "detached"`, optional `bridgeUI`).
- Document extension points for later interactive subagent sessions and multi-root agent instances **without** implementing those products now.
- **BREAKING** (internal/core only as needed): delete redundant helpers / dead bridge paths; no host-facing behavior change expected. No backward-compatibility shims for removed internals.
- Update `ARCHITECTURE.md` / `AGENTS.md` so main vs subagent flows are described as shared skeleton + profiles.

## Capabilities

### New Capabilities

- `agent-run-skeleton`: Shared single-run orchestration contract (consume modes, outcome path, UI channel attach) used by chat and worker runs.
- `agent-run-profiles`: Explicit InteractiveChat vs Worker profile boundaries — what must stay different (queues, persist, detached terminal, tool sets) vs what must share the skeleton.

### Modified Capabilities

- (none — product/session semantics unchanged; this is structural orchestration inside `@my-agent/core`)

## Impact

- **Packages:** `@my-agent/core` primarily (`run-agent.ts`, `agent-chat-controller.ts`, `agent/subagent/run-subagent.ts`, `agent/ui-channel.ts`, related validates/docs). App/CLI/server should not need UI changes if semantics are preserved.
- **APIs:** Host `AgentSession` contract stays; internal helpers may move/rename. Obsolete internal run helpers may be removed without shims.
- **Non-goals this change:** interactive subagent chat, multi-root agent product UX, compact-via-session wiring, message incremental patches, merging ExtensionEventBus into Session.
