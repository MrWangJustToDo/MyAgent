## 1. Summarizer input & prompt

- [x] 1.1 Update `summarizeConversation` / `auto-compact` to build segmented summarizer input: `<to_compress>` from `messages[summaryOffset:llmCutIndex]` and `<still_in_context>` from `messages[llmCutIndex:]` (plus existing previous-summary handling)
- [x] 1.2 Extend `compaction-prompt.ts` with anti-duplication rules: prioritize to-compress; use still-in-context only to align Goal/Next; do not restate kept turns in detail
- [x] 1.3 Ensure summarization budget still applies (prefer truncating tool-result bulk in serialization before dropping still-in-context); keep `cutIndex` / apply assembly unchanged
- [x] 1.4 Add a focused validation script for segmented prompt construction (labels present, cut index unchanged)

## 2. Transcript archive

- [x] 2.1 Add `writeCompactArchive` helper: serialize compressed slice via `serializeConversation` (or shared helper), write `.agents/transcripts/<sessionId>/compact-<n>.md` under CoreEnv `rootPath`
- [x] 2.2 Wire archive write after successful summary on auto-compact, `/compact`, and reactive compact paths; failures are non-fatal (log/emit optional; omit pointer)
- [x] 2.3 Append `## Compact archive` (path + grep/read guidance) to summary only when write succeeds; use session id with agent-id fallback
- [x] 2.4 Add `.agents/transcripts/` to root `.gitignore` if not already covered
- [x] 2.5 Add validation for archive write + pointer presence / omission on failure

## 3. Docs & verification

- [x] 3.1 Update compaction docs (`AGENTS.md` and/or `packages/core/ARCHITECTURE.md`) for full-context summarizer input and archive path/behavior
- [x] 3.2 Run `pnpm lint`, `pnpm format`, and `pnpm build:core` (or affected package build) and fix issues
