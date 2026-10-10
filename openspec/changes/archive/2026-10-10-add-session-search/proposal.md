## Why

The agent can only reach past conversations by hand: the `<session_retrieval>` turn-context section
tells the model to grep the raw files itself, and the session logs are one JSON object per line, so a
grep hit only says *which* session matched — the model cannot read a match without parsing JSON it
has no tool for. Recall of earlier-session decisions is a frequent need and is currently the
hardest-to-use part of the workspace.

## What Changes

- Add a `session_search` tool: search past conversation in the session logs — the complete,
  authoritative record — and return bounded, readable matches (session id, role, message index,
  timestamp, snippet).
- Add a `session_read` tool: read one session's messages as text, paginated by message index — the
  read path the JSONL log lacks. Output is bounded per message and per page, spilling to the
  tool-output cache with a `cachedOutputPath` when large.
- Do **not** search the `compact-<N>.md` archives: compaction only appends a summary to the channel
  and never drops the pre-cut messages, and the session is persisted from that channel, so the log
  already holds the whole conversation — the archives are a derived, lower-fidelity duplicate.
- **Remove the transcript archive entirely** (it has no remaining reader): drop the writer
  (`write-compact-archive.ts`), the summary's `## Compact archives` section, the archive guidance in
  the frozen system prompt, and the `compaction-archive` capability. `stripCompactArchiveSections`
  stays only to drop the section from summaries persisted before the removal.
- Both tools are read-only, declared through `defineServerTool`, and available to the root agent only
  (matching the existing rule that cross-session recall is a root-agent decision, not a subagent's).
- Exclude the current session from search by default (its content is already the live conversation);
  an explicit `sessionId` still reads it.
- Correct the `<session_retrieval>` guidance, which describes the sessions as `*.session.json`
  holding "a whole conversation as a single long JSON line". The v7 format is
  `.agents/sessions/*.session.jsonl`, one message per line, and it is the complete conversation;
  point it at the new tools as the primary path.
- **No** new CoreEnv capability and no event-sourced log: the tools read the files that already
  exist, so they work in local and remote (`@codent/server`) hosts through `CoreEnv.fs`.

## Capabilities

### New Capabilities

- `session-search`: the `session_search` / `session_read` tools that retrieve past conversation from
  the on-disk session logs.

### Modified Capabilities

- `session-retrieval`: the guidance must state that the session log is the complete record
  (`.session.jsonl`, one message per line) and name the retrieval tools as the primary way to search
  history.

### Removed Capabilities

- `compaction-archive`: the greppable `.agents/transcripts/<sessionId>/compact-<N>.md` writer, its
  self-describing header, and the compaction summary's `## Compact archives` list. The session log is
  the complete record, so the archive had no remaining reader.

## Impact

- Affected code:
  - `packages/core/src/agent/tools/` — new `session-search-tool.ts` / `session-read-tool.ts` and
    `session-search/session-reader.ts`, registered in `create-tools.ts`
  - `packages/core/src/agent/turn-context/session-retrieval.ts` — corrected shape description +
    tool pointer; drop `listCompactArchives` and the transcripts history check
  - `packages/core/src/agent/compaction/` — delete `write-compact-archive.ts`; `auto-compact.ts` /
    `reactive-compact.ts` stop writing archives; `compaction-prompt.ts` keeps only
    `stripCompactArchiveSections` (legacy)
  - `packages/core/src/agent/prompt/default-prompt.ts` — drop the archive guidance line
  - `packages/core/scripts/` — new `validate:session-search`; delete `validate:compact-archive`
- Non-goals: event-sourced session log / SQLite FTS5; `event_search` / `trace`; fuzzy/embedding
  search; cross-workspace search; subagent access.
