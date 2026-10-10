## Context

Past conversation lives on disk in one authoritative shape:

- **Session logs** — `.agents/sessions/<id>.session.jsonl`, the append-only source of truth
  (`SESSION_DIR` / `SESSION_LOG_SUFFIX`, `persistence/types.ts`). One line is one message plus a
  state snapshot, so message text is nested in JSON and a line match is not directly readable.
- **Compact archives** — `.agents/transcripts/<sessionId>/compact-<N>.md` (`COMPACT_TRANSCRIPT_ROOT`,
  `write-compact-archive.ts`) are *derived*: compaction appends a summary to the channel without
  removing the pre-cut messages (`apply-compaction-result.ts`), the session is persisted from that
  channel (`session-store.ts`), and the `context-compaction` spec calls the retained prefix the
  "frozen pre-summary slice of the chronological channel". So the log already contains the whole
  conversation, and the archive is a lower-fidelity serialization of it (tool results truncated to
  2000 chars). It is therefore **not** a search source.

Today the only retrieval aid is the `<session_retrieval>` turn-context section
(`turn-context/session-retrieval.ts`), which tells the model to grep those paths itself. The section
describes the sessions as `*.session.json` holding "a whole conversation as a single long JSON line"
— the legacy v6 shape; v7 is `.session.jsonl`, one message per line. The guidance is therefore stale
*and* the manual read path it implies (parse JSON, filter by role) has no tool behind it. This change
adds the tools and corrects the guidance.

## Goals / Non-Goals

**Goals:**

- Give the agent a first-class way to search and read its own past conversations.
- Work with the formats already on disk; add no new storage and no native dependency.
- Keep results bounded so recall cannot blow the context window.
- Stay consistent with the existing rule that cross-session recall is a root-agent concern.

**Non-Goals:**

- Event-sourced session log, SQLite FTS5, `event_search` / `trace`.
- Semantic / embedding / fuzzy search — this is literal text matching.
- Cross-workspace search; indexing; incremental caches.
- Giving the tools to subagents.

## Decisions

- **Two tools, not one.** `session_search` finds; `session_read` renders a session as text. The
  split mirrors the two jobs a reader actually does (locate, then read) and keeps each result shape
  simple. A single "do everything" tool would have to both return matches and dump conversations,
  which invites context blowups.
  - Alternative: one tool with a `sessionId` mode switch. Rejected — the two have different output
    shapes and bounds.
- **`session_search` reads the session logs only.** Returns `{ sessionId, role?, timestamp?,
  snippet, messageIndex? }`, newest-session-first. A line match in `.session.jsonl` is parsed (not
  echoed as raw JSON).
  - Alternative: also search the `compact-<N>.md` archives. Rejected — the log is the complete
    conversation (compaction only appends a summary), so the archives are a derived, lower-fidelity
    duplicate; searching them duplicates every hit and can even surface truncated tool text.
- **Remove the transcript archive.** With `session_search` reading the complete log, nothing reads
  `.agents/transcripts/` any more, so the writer, the summary's `## Compact archives` section, the
  archive guidance in the frozen system prompt, and the `compaction-archive` capability are all
  deleted. `stripCompactArchiveSections` is kept (in `compaction-prompt.ts`) only to drop the section
  from summaries persisted before the removal.
  - Alternative: keep writing the archives as a belt-and-braces snapshot. Rejected — it duplicates
    the log on disk and in I/O with no consumer.
- **Literal, case-insensitive substring match.** Predictable, cheap, and safe. Regex is deliberately
  out of scope: it adds ReDoS surface and the model can over-specify a pattern that silently matches
  nothing.
- **Current session excluded unless named.** Its content is the live conversation; default inclusion
  would duplicate context. An explicit `sessionId` overrides.
- **Bounded by construction.** Match count (`limit`, default ~20), snippet length, and total result
  size reuse the shared `output-limits` (grep-style caps). `session_read` truncates per message and
  per page, and spills a large page to the tool-output cache (`maybeCacheOutput` →
  `cachedOutputPath`) so the model gets a bounded preview plus a path.
- **Root-only.** Registered in `create-tools.ts` and left out of the subagent tool factory, matching
  `session-retrieval`'s "Subagents do not receive the guidance" requirement.
- **Format constants are shared.** The tools resolve the sessions directory and suffix from
  `persistence/types.ts`, so a layout change cannot leave a private copy behind.
- **Read through `CoreEnv.fs`** (`readdir` / `exists` / `readFile`), so the tools work in remote
  (`@codent/server`) hosts with no new capability.

## Risks / Trade-offs

- [Large workspaces: scanning every session log is O(total history)] → cap files scanned and bytes
  read per call; report truncation; a future index can replace the scan without a tool-signature
  change.
- [Whole-file reads of big JSONL logs] → skip files over a size ceiling (or `stat` first) and read
  line-by-line; the ceiling is per-file, not a hard failure.
- [Guidance text change re-injects the section once] → acceptable and one-time; the corrected text
  is still static (no counts/paths), so the prompt-cache property is preserved.
- [Guidance lives in one place while the tool has its own description] → the section names the tool;
  the tool description states its own inputs/outputs. Neither restates the other's content.
- [Expectation of relevance ranking] → results are ordered newest-first by session time, not by
  score; the tool description says so.

## Migration Plan

Additive: new tools plus a guidance-text correction. No data migration, no rollback beyond removing
the tools. Validate with a new `validate:session-search` (session-log hits parsed, current-session
exclusion, role filter, bounding + page spill, archives ignored, subagent exclusion).

## Open Questions

- Should `session_search` allow limiting by time window? (Leaning: defer until requested; the
  newest-first order plus `limit` covers most needs.)
- Should `AGENTS.md`'s `.agents/` layout table drop the `.agents/transcripts/` row? (Done in this
  change; existing on-disk directories are simply ignored and left for the user to delete.)
