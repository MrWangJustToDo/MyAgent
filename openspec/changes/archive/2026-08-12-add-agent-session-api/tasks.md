## 1. Internal Emitter base

- [x] 1.1 Add typed `Emitter` (or equivalent) primitive in `@my-agent/core` (internal path; export via `dev.ts` / curated if needed)
- [x] 1.2 Migrate `TodoManager` notify to Emitter (`change` + items); keep `onChange` shim if callers need it briefly
- [x] 1.3 Add Emitter `change` on `UsageTracker` with usage snapshot payload; emit from update paths
- [x] 1.4 Wire L1 status/error/pendingApproval to Emitter `change` (replace empty-only `subscribeState` as the primary notify path; shim OK)
- [x] 1.5 Wire chat queues + plan public state + UI messages (+ streaming wrap if needed) to the same Emitter pattern
- [x] 1.6 Migrate `AgentLog.onLog` to Emitter `entry` (shim `onLog`); keep Event→Log bridge writing into AgentLog as today
- [x] 1.7 Add `validate:agent-emitter` covering subscribe/unsubscribe and payload delivery for at least todos + usage + log entry

## 2. Protocol types

- [x] 2.1 Add `packages/core/src/agent-session/` (or agreed path) with `AgentSessionSnapshot`, `AgentSessionCommand`, `AgentSessionChannel`, `AgentSession` interface types
- [x] 2.2 Document TODO for incremental/patch `messages` delivery in types + short ARCHITECTURE note
- [x] 2.3 Export session public types from `@my-agent/core` (curated); keep internals on `dev.ts` as needed
- [x] 2.4 Add `validate:agent-session-types` (or equivalent) asserting command/channel discriminants round-trip JSON

## 3. LocalAgentSession (fan-in from Emitters)

- [x] 3.1 Implement `createLocalAgentSession(managed, manager?)` wrapping any ManagedAgent (root or subagent) + chat controller when present
- [x] 3.2 Implement `getSnapshot()` reading status/messages/queues/usage/todos/plan/auto/`subagents` summary (+ `parentId` when set)
- [x] 3.3 Implement `dispatch()` for send/steer/followUp/stop/approvals/toolResult/clientToolWaiting/compact/clear/rename/plan.*/auto.set/session.resume; on subagent sessions allow stop/read-related commands and return typed unsupported for the rest
- [x] 3.4 Implement `subscribe()` mapping domain Emitter events → channels (`state`/`messages`/`queues`/`usage`/`todos`/`plan`/`tool`/`summary`/`log`) and bus → `lifecycle`; omit `log` from default “all” unless explicitly requested
- [x] 3.5 Define default lifecycle filter (dedupe vs dedicated channels); document authoritative channel per concern
- [x] 3.6 Add helper to resolve/open a child session by subagent id (same Local factory); parent lifecycle/`subagents` summary stays on parent session
- [x] 3.7 Add `validate:local-agent-session` covering snapshot, dispatch stop/send smoke, subscribe unsubscribe, and subagent session reuse (same interface / child snapshot)

## 4. App migration to Session API

- [x] 4.1 Change `createAgentFromConfig` / adapter init to expose root `AgentSession` (Local) to the app
- [x] 4.2 Migrate `use-agent-chat` to session dispatch + subscribe (messages/queues/state)
- [x] 4.3 Migrate usage / todos / plan / footer hooks to dedicated session channels
- [x] 4.4 Migrate `use-task` / subagent panel hooks to open child `AgentSession` by id (same API), not `agentManager.getAgent` + direct `ui`/`usage`
- [x] 4.5 Remove app business reliance on direct `ManagedAgent` / `TodoManager` / `UsageTracker` field reads for those concerns (**BREAKING**)
- [x] 4.6 Run `pnpm build:app` + relevant app validates; fix hosts (cli/extension) compile

## 5. HTTP AgentSession (same contract)

- [x] 5.1 Add server routes under `/api/agent/*`: create/close, snapshot, command, SSE events (id = root or subagent)
- [x] 5.2 Keep CoreEnv routes separate; document two planes in ARCHITECTURE
- [x] 5.3 Implement `HttpAgentSessionClient` implementing `AgentSession` (REST + SSE demux); reuse for parent and child ids
- [x] 5.4 Wire CLI/extension optional remote agent URL (distinct from CoreEnv `--remote` if both used)
- [x] 5.5 Add `validate:agent-session-http` smoke (in-process server or mocked SSE framing), including child-id snapshot path

## 6. Docs and gate

- [x] 6.1 Update `packages/core/ARCHITECTURE.md` and `AGENTS.md`: Emitter (internal) → AgentSession (hosts) → HTTP; observe as advanced; subagent = same Session
- [x] 6.2 Note event dedupe / authoritative channels; note messages full-snapshot + incremental TODO; note AgentEventBus still for lifecycle
- [x] 6.3 Run `pnpm format`, `pnpm lint`, `pnpm typecheck`, and affected `pnpm build` (core → app → server/cli as touched)
- [x] 6.4 Confirm new/updated `validate:*` scripts for this change pass
