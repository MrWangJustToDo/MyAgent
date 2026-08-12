## 0. Typed AgentEvent envelope

- [x] 0.1 Define shared envelope + per-`AgentEventType` payload map (replace open `data` bag)
- [x] 0.2 Update `emitAgentEvent` / `ManagedAgent.emitEvent` call sites to typed payloads
- [x] 0.3 Update Event→Log rules and lifecycle filter to read `payload` (keep emission contracts)
- [x] 0.4 Align Session `lifecycle` channel payload with the same AgentEvent shape
- [x] 0.5 Add `validate:agent-event-envelope` (JSON round-trip + narrow key event types)

## 1. Session types and Local completeness

- [x] 1.1 Extend `AgentSessionSnapshot` with `name`, `mode`, `lastStreamDurationMs`, `mcp`, `extensions`, richer `subagents`
- [x] 1.2 Add/complete commands: `compact`, plan save/load/list/complete, `mcp.refresh`, extension toggle/invoke, clarify `session.clear` vs Host.create
- [x] 1.3 Implement Local dispatch + snapshot projection for new fields/commands
- [x] 1.4 Allow meaningful subagent commands beyond `stop` where safe
- [x] 1.5 Extend `validate:local-agent-session` for new snapshot fields and commands

## 2. AgentSessionHost (Local)

- [x] 2.1 Define `AgentSessionHost` interface (`create` / `connect` / `list` / `destroy`)
- [x] 2.2 Implement `createLocalAgentSessionHost` wrapping `agentManager` + `SessionStore`
- [x] 2.3 Export Host from `@my-agent/core` public API; document session-safe vs runtime exports
- [x] 2.4 Add `validate:agent-session-host` smoke (create → list → connect child → destroy)

## 3. App Session-only cutover

- [x] 3.1 Change adapter `InitResult` / `createAgentFromConfig` to return Host + Session (no ManagedAgent to UI)
- [x] 3.2 Migrate `use-agent` / `use-agent-chat` / usage / todos / log hooks off ManagedAgent objects
- [x] 3.3 Migrate slash commands: compact, plan, mcp, clear, resume, rename, auto
- [x] 3.4 Migrate Footer, SubagentPanel, ExtensionPanel, Debug, keybindings/input-controls
- [x] 3.5 Move or duplicate pure UI helpers (`getToUI`, compaction formatters) so app does not need runtime core APIs
- [x] 3.6 Document app `@my-agent/core` import allowlist; add validate/lint for forbidden imports
- [x] 3.7 Manual Local CLI smoke: chat, plan, compact, subagent panel, resume picker

## 4. HTTP parity

- [ ] 4.1 Server: persist/serve tool buffer + summary snapshots for remount
- [ ] 4.2 Http client: implement `getSummaryStreamSnapshot`; cache tool/summary SSE for remount
- [ ] 4.3 Catalog routes: list + align create/destroy with Host
- [ ] 4.4 Implement `createHttpAgentSessionHost`
- [ ] 4.5 Upgrade `validate:agent-session-http` to live Local-vs-HTTP parity smoke (include typed lifecycle)

## 5. Host wiring and docs

- [ ] 5.1 CLI: `--agent-remote` creates HTTP Host; Local path uses Local Host
- [ ] 5.2 Extension/playground: Session-only bootstrap (remote Host when configured)
- [ ] 5.3 Update AGENTS.md / ARCHITECTURE / Help for three planes + Session-only app + event envelope
- [ ] 5.4 Final lint/format/build for affected packages
