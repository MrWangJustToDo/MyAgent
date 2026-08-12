## 1. Projection + middleware

- [x] 1.1 Add summary detectors + `getModelVisibleMessages` (look-back + **summary-first**; no tool pair splits)
- [x] 1.2 Skip summary + turn_context in `findCutPoint`
- [x] 1.3 Middleware `onConfig` returns projected `messages` (never write projection back to channel)
- [x] 1.4 `validate:message-chain-projection`

## 2. Compact append (channel only)

- [x] 2.1 Append summary UIMessage to channel on compact success (auto / manual / reactive)
- [x] 2.2 Delete Context compact fields usage entirely (no dual-read / no migrate)
- [x] 2.3 Reset turn_context admitted hash on compact

## 3. Remove dual-write; require channel; delete AgentContext + outdated APIs

- [x] 3.1 Remove `syncContextFromUIMessages` and all dual-write call sites
- [x] 3.2 Always `ensureUIChannel` for main + subagent LLM runs; delete headless no-channel consume
- [x] 3.3 Move `runBaselineCount` / canonical merge onto ManagedAgent; keep pure merge helper
- [x] 3.4 Delete `AgentContext` class, re-exports, and related validates; fix all call sites
- [x] 3.5 Remove outdated public APIs (`getSummaryMessage`, `getCompactIndex`, Context `getMessagesForLLM`, etc.) with **no** compatibility aliases
- [x] 3.6 Remove `useAgentContext` (hosts use channel/session message subscriptions)

## 4. Session schema hard break

- [x] 4.1 Resume → channel.setMessages(`uiMessages` only); ignore obsolete compact fields if present
- [x] 4.2 Stop writing `summaryMessage`/`compactIndex`/`compactMessages` from types + save path
- [x] 4.3 Update session validates (no migration tests)

## 5. App UI + docs + verify

- [x] 5.1 Compact checkpoint row; turn_context hidden
- [x] 5.2 `/compact` `/resume` `/clear` on channel SoT
- [x] 5.3 ARCHITECTURE + AGENTS + openspec session/unified-message-chain specs (post-compact channel re-project + baseline; hard break; no compat notes as supported paths)
- [x] 5.4 lint, format, build:core, build:app, affected validate:*
