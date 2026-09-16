# Tasks

## 1. Retrieval section (single home for the guidance)

- [x] 1.1 `packages/core/src/agent/turn-context/session-retrieval.ts` — `hasSessionHistory()` (one-time existence gate over sessions dir + transcript root), `listCompactArchives(sessionId)`, `formatSessionRetrievalSection({ archivePaths, hasHistory })`, and the `session_retrieval` open/close constants
- [x] 1.2 `hasSessionHistory()` returns false on an unreadable/missing workspace rather than throwing, and performs no per-turn work
- [x] 1.3 `formatSessionRetrievalSection` returns `undefined` when there is no history; otherwise emits the static body (what exists, both shapes and how each is read, current-session-is-redundant)
- [x] 1.4 No per-session paths in the rendered section — the summary supplies them — so the body is fully static; `listCompactArchives` stays exported for callers that need discovery
- [x] 1.5 No counts, timestamps, or other volatile values anywhere in the rendered text

## 2. Wire the section into turn context

- [x] 2.1 `managed-agent-prompt.ts` — add `sessionRetrieval?: string` to `DynamicTurnContextInput` and emit a `session_retrieval` section (after `mode`, before `extension` sections)
- [x] 2.2 `managed-agent.ts` `getDynamicTurnContextSections()` — compute the section once per agent and reuse; pass `archivePaths` for this session's id
- [x] 2.3 Do **not** add `session_retrieval` to `SUBAGENT_ALLOWED_KINDS`
- [x] 2.4 Export what validation scripts need via `agent/turn-context/index.ts` and `dev/dev-agent.ts`

## 3. Archive header becomes self-describing

- [x] 3.1 `buildCompactArchiveMarkdown` — drop the "prefer grep / do not load this entire transcript" line; keep `# Compact archive` + `session`/`sequence`/`timestamp`/`cutIndex` + body
- [x] 3.2 Leave `writeCompactArchive`, `resolveNextCompactSequence`, and `parseCompactSequence` unchanged (naming and monotonicity are already correct)

## 4. Summary list: path data + scope, no usage prose

- [x] 4.1 `formatCompactArchivesSection` — reduce to a heading, a one-line current-session scope statement, and the path list (newest marked)
- [x] 4.2 Remove the "newest → oldest", "File shape:", and "Do not load whole archive files" prose, which now lives only in the retrieval section
- [x] 4.3 Keep `extractCompactArchivePaths` / `stripCompactArchiveSections` / `maybeAppendCompactArchive` behaviour unchanged — the list must stay in the summary text for path recovery across successive compactions

## 5. Docs

- [x] 5.1 `AGENTS.md` — compaction section reduced to the mechanism (greppable slice written, list attached) and a pointer that the model-facing retrieval guidance is the turn-context section; removes text that currently sits on a file loading at 65469/65536 bytes and truncating its tail
- [x] 5.2 `packages/core/ARCHITECTURE.md` — turn-context section: note the new kind, its one-time gating, and its exclusion from the subagent allowlist
- [x] 5.3 Both markdown files formatted with prettier

## 6. Coverage

- [x] 6.1 New `packages/core/scripts/validate-session-retrieval.mjs` + `validate:session-retrieval` script — gating (history vs none, empty dir is not history), both shapes described, current-session exclusion stated, no volatile values, section unchanged when this session gains an archive, absent for subagents
- [x] 6.2 `validate-compact-archive` — replace the prose assertions (`newest → oldest`, `File shape:`, `Do not load whole archive files`) with shape + scope assertions
- [x] 6.3 `validate-compact-archive` — add a **no-drift guard**: the summary block and the archive header must not reintroduce usage prose (this is the drift the change exists to remove, so it must fail the build if it returns)
- [x] 6.4 Mutation-test each guard: remove the existence gate; re-add usage prose to the summary block; re-add it to the archive header; make the path list unsorted; add a volatile count. All must fail the relevant validator
- [x] 6.5 Confirm the existing `validate:compaction-*`, `validate:prompt-cache`, `validate:turn-context` suites still pass

## 7. Acceptance

- [x] 7.1 prettier + eslint on changed files
- [x] 7.2 `pnpm typecheck` and `pnpm build:core`
- [x] 7.3 `pnpm --filter @my-agent/app test` and the full core `validate:*` sweep green
- [x] 7.4 `openspec validate --specs` green
