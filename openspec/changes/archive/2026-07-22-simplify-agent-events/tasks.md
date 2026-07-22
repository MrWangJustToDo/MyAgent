## 1. Lifecycle tool events

- [x] 1.1 In `extensions-middleware.ts`, emit `agent:tool-end` / `agent:tool-error` before the `ExtensionRunner` early-return; keep extension bus emit only when runner exists
- [x] 1.2 Add or extend a core validation script covering tool-end/error without an extension runner

## 2. Compaction start kind

- [x] 2.1 Change `AgentStatusController.beginCompaction` to accept `kind: "auto" | "reactive"` and emit the matching `compaction:*-start` event only
- [x] 2.2 Update `handleReactiveCompact` so reactive start is not duplicated (beginCompaction owns the start emit)
- [x] 2.3 Update auto-compact call sites to pass `"auto"` (or rely on default)
- [x] 2.4 Extend validation for reactive compact to assert no `compaction:auto-start` on reactive path

## 3. Dead events and payloads

- [x] 3.1 Emit `session:restore` from `ManagedAgent.restoreSession` after successful restore
- [x] 3.2 Emit `subagent:destroyed` from destroy / autoDestroy paths for subagents
- [x] 3.3 Align `subagent:completed` payload with `{ subagentId, summary }`; update Event→Log and any app readers of `output`
- [x] 3.4 Remove direct `log.approval` from `syncApprovals`; rely on Event→Log for `agent:tool-approval-request`

## 4. Documentation

- [x] 4.1 Update `ARCHITECTURE.md` completion table and layer diagram (hooks → extensions; Event→Log only on the bus)
- [x] 4.2 Update §2.2 bootstrap / §2.3 EventBus constructor / §3.3 middleware stack to match `buildAgentRunner`
- [x] 4.3 Replace §4.4 hooks vs approval and §8.4 hook bridge with ExtensionEventBus (L4) vs AgentEventBus (L2)
- [x] 4.4 Document L1–L4 observation model, `llm:*` (per iteration), and `turn:summary`

## 5. Verify

- [x] 5.1 Run relevant `pnpm --filter @my-agent/core run validate:emit-agent-event` / `validate:event-log-bridge` / reactive-compact validates
- [x] 5.2 Run `pnpm lint`, `pnpm format`, and `pnpm build:core`
