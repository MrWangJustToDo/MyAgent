## 1. Shared consume helper

- [x] 1.1 Add package-internal `consumeAgentStream` (or equivalent) with `ui` | `headless` modes wrapping `AgentUIChannel.consumeRun` and headless message consume
- [x] 1.2 Centralize `ensureUIChannel(managed)` as the sole UI attach helper for skeleton/UI runs
- [x] 1.3 Point `runSubagent` consume path at the helper (bridgeUI + headless); keep `subagent:ui-update` via optional `onUpdate`
- [x] 1.4 Point `AgentChatController.executeStream` consume at the same helper (ui mode)

## 2. Shared single-run skeleton

- [x] 2.1 Add `runAgentOnce` (or equivalent) covering stream start + consume + `applyRunOutcome` with caller-selected `outcomePath` (`chat` | `detached`)
- [x] 2.2 Migrate chat `executeStream` to call the skeleton without changing pump/queue/approval/persist ownership
- [x] 2.3 Migrate `executeSubagentRun` core to call the skeleton once; keep spawn/tools/summary/autoDestroy/usage aggregation in the Worker profile wrapper
- [x] 2.4 Remove or fold unused/overlapping `runManagedAgent({ bridgeUI })` bridge path once callers are migrated; update any in-repo imports

## 3. Validation

- [x] 3.1 Add or extend `validate:*` covering consume modes (ui vs headless) and outcome path selection (chat vs detached) at least at helper level
- [x] 3.2 Confirm existing related validates still pass (`validate:subagent-bridge-ui`, `validate:subagent-run-stats`, `validate:agent-run-finalization`, `validate:local-agent-session` as applicable)
- [x] 3.3 Smoke-check mentally/docs: task tool preview, headless compact/memory entrypoints still call Worker path with headless consume

## 4. Docs and gate

- [x] 4.1 Update `packages/core/ARCHITECTURE.md` and `AGENTS.md`: shared skeleton + InteractiveChat vs Worker profiles; note future seams (interactive child, multi-root Session) without claiming they are implemented
- [x] 4.2 Run `pnpm format`, `pnpm lint`, `pnpm typecheck`, and affected `pnpm build:core` (app only if imports break)
- [x] 4.3 Confirm no host-facing observe/reintroduced dual observation path; Session remains the host API
