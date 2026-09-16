## 1. Wire projection cache

- [x] 1.1 Add `revision` counter to `AgentUIChannel` (+1 on every messages change)
- [x] 1.2 Add fingerprint (channel revision + message count + last message id/len + policy key) next to projection site
- [x] 1.3 On `onConfig`, reuse cached wire array on fingerprint hit (`WireProjectionCache`)
- [x] 1.4 Invalidate on compact / structural reset
- [x] 1.5 Add `validate:wire-projection-cache` for hit/miss/invalidate

## 2. Docs and follow-up

- [x] 2.1 Update `ARCHITECTURE.md` wire-projection cache note
- [x] 2.2 Run scoped format/lint + package validate scripts for touched files

## Notes

- Session `messages` transport remains full `UIMessage[]`; full/patch delta delivery was tried in this change and reverted (local in-process has no perf benefit — app still ends in full `setMessages`; remote SSE already had server-side delta encoding).
