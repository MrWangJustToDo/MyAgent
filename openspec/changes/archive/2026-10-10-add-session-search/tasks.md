## 1. Shared session reader

- [x] 1.1 Add `packages/core/src/agent/tools/session-search/session-reader.ts`: enumerate session logs (dir + `.session.jsonl` suffix from `persistence/types.ts`), with per-file size ceiling and a cumulative scan budget
- [x] 1.2 Parse a `.session.jsonl` into `{ sessionId, messageIndex, role, timestamp, text }` by folding lines and extracting `parts[].content` (text only), reusing the persistence line/suffix constants
- [x] 1.3 Expose a literal, case-insensitive search over session messages, returning bounded matches (session id, role, message index, snippet)

## 2. `session_search` tool

- [x] 2.1 Add `packages/core/src/agent/tools/session-search-tool.ts` using `defineServerTool` with `{ query, sessionId?, role?, limit? }`
- [x] 2.2 Exclude the current session by default; allow explicit `sessionId` to override
- [x] 2.3 Bound snippet length, result count, and total size via the shared `output-limits`; report withheld matches
- [x] 2.4 Add `present` / `toModelOutput` so a match reads as `sessionId · role · time · snippet`

## 3. `session_read` tool

- [x] 3.1 Add `packages/core/src/agent/tools/session-read-tool.ts` using `defineServerTool` with `{ sessionId, offset?, limit? }`
- [x] 3.2 Render messages as text (role + text; one-line summary for tool calls) bounded to the window
- [x] 3.3 Report remaining messages and how to request the next window; fail clearly on an unknown session id

## 4. Registration & scope

- [x] 4.1 Register both tools in `packages/core/src/agent/tools/create-tools.ts`
- [x] 4.2 Ensure neither tool appears in the subagent tool set (`create-tool-sets.ts` / subagent tool factory)
- [x] 4.3 Export the new factories / readers from the dev entry for validators
- [x] 4.4 Read-only: no fs writes and no session-state mutation in either tool

## 5. Guidance correction

- [x] 5.1 Fix `packages/core/src/agent/turn-context/session-retrieval.ts`: `.session.jsonl`, one message per line (drop the legacy single-line `.session.json` claim)
- [x] 5.2 Name `session_search` / `session_read` as the primary path in the rendered section; keep the body static (no counts/paths)

## 6. Coverage

- [x] 6.1 Add `packages/core/scripts/validate-session-search.mjs` covering session-log hits, current-session exclusion, role filter, bounding, page spill, archives-ignored, and unknown-session error
- [x] 6.2 Assert the subagent tool set excludes both tools, compact archives are not searched, and guidance no longer describes the stale format
- [x] 6.3 Register `validate:session-search` in `packages/core/package.json`
- [x] 6.4 Run the full core validator suite plus typecheck/lint

## 7. Remove the transcript archive

- [x] 7.1 Delete `packages/core/src/agent/compaction/write-compact-archive.ts`; move `stripCompactArchiveSections` into `compaction-prompt.ts`
- [x] 7.2 Stop writing archives in `auto-compact.ts` and `reactive-compact.ts`
- [x] 7.3 Drop the archive-instruction lines from the compaction prompts and the frozen `default-prompt.ts`
- [x] 7.4 Simplify `session-retrieval.ts` (`hasSessionHistory` = sessions only; remove `listCompactArchives`)
- [x] 7.5 Update barrels (`compaction/index.ts`, `turn-context/index.ts`, `dev-agent.ts`)
- [x] 7.6 Remove `validate:compact-archive`; update `validate-summarization-segments` / `validate-session-retrieval`
- [x] 7.7 Update `AGENTS.md` + `README.md`; run the full suite
