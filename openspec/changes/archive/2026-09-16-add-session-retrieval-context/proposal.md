## Why

The model is told how to reach past conversation, but **the guidance is spread across four places that age differently**, and one of them is already wrong.

Measured on this repo:

| Site | Carrier | When it reaches the model |
|---|---|---|
| `formatCompactArchivesSection` | compaction summary | after this session compacts |
| `buildCompactArchiveMarkdown` | archive file header | only when the model goes to read one |
| `AGENTS.md:802` | project instructions | always — and `AGENTS.md` is loaded at **65469 / 65536 bytes**, right at the budget |
| `ARCHITECTURE.md:439` | developer docs | never (not loaded) |

Two of those are frozen or near-frozen, so a wording change reaches only some of them:

- **The archive file header is written once and never rewritten** (`resolveNextCompactSequence` → `compact-<N>.md`, monotonic). Its prose can never be corrected for archives already on disk — and it has **already drifted**: only the summary carries the "newest → oldest" rule; the file header never mentions it, so a model that opens slice `compact-1` has no signal to look at `compact-3`.
- **`AGENTS.md` is at its byte ceiling.** Adding anything there evicts whatever is last — already measurable: the file's final sections are truncated out of `<project_instructions>` today.

The same "how to search" instruction therefore exists in up to three copies, one of which can never be updated, and none of which is the natural home for it: `AGENTS.md` describes the repository, not the live state of a workspace.

There is also a **coverage gap**. Guidance about archives only ever attaches to the *compaction summary*, so it exists only after this session compacts. On this repo 247 sessions exist but only 47 have archives — a model asked about something from an earlier session has **no path at all** to the other 200, and no statement that they exist.

## What Changes

- **One turn-context section carries the retrieval guidance** (`<ctx kind=session_retrieval>`), emitted only when the workspace has conversation history to search. It states what exists, where, and how each shape is read — including that uncompacted sessions are single-line JSON where grep locates the file but cannot extract the conversation, and that the current session's own files are redundant with the live context.
- **The section is fully static, behind a one-time existence gate** — no counts, no per-session paths, no per-turn directory walks. Anything volatile changes the section hash and re-injects the whole block: a count changes whenever a session is created or pruned, and this session's paths change on every compaction. Neither changes what the model should do, and the paths are already delivered by the compaction summary's `## Compact archives` list.
- **The archive file header becomes purely self-describing** — `session` / `sequence` / `timestamp` / `cutIndex` and the body. The "prefer grep / do not load this file" line is removed: a model that has opened the file is already following the retrieval guidance, so repeating it there is self-defeating, and as frozen prose it can never be revised.
- **`## Compact archives` keeps its path list but loses its usage prose.** The list stays with the summary because it is the natural companion to "turns 1-140 were compacted": the summary names what was removed, the list names where it went. That co-location cannot be reproduced from a turn-context section appended later. What goes is the prose — the list is *data* and does not age, while the surrounding instructions duplicated the new section. A scope line is added instead, because this list is **current-session only** while the new section is cross-session, and the two must not be confused.
- **`AGENTS.md` keeps the mechanism, loses the model-facing instructions.** It describes how compaction writes a greppable archive and attaches a list — repository knowledge. `Search newest → oldest`, `prefer grep` and similar move to the one live site, freeing budget on a file that is currently truncating.
- **Nothing is lost for existing workspaces.** Archives already on disk keep their old headers (they cannot be rewritten); the live turn-context section supersedes their guidance by being the single place the model is pointed at first.

## Capabilities

### New Capabilities

- `session-retrieval`: the single source of truth for how the model reaches past conversation — when the guidance is emitted, what it must state about each on-disk shape, the ban on volatile content (counts), and the guarantee that usage guidance is not duplicated elsewhere.
- `compaction-archive`: the archive artifact and its list — the self-describing file shape, monotonic naming, and the scope contract for the summary's `## Compact archives` list (path data plus scope, no usage prose).

### Modified Capabilities

None. No existing spec states any of this: `context-compaction` specifies the keep window, cut points, and split-turn summarization, but never the archive artifact, its list, or retrieval guidance.

## Impact

| Area | Change |
|------|--------|
| `packages/core` | New `agent/turn-context/session-retrieval.ts` (discovery + rendering). `managed-agent.ts` computes the section once; `managed-agent-prompt.ts` adds the `session_retrieval` section. `write-compact-archive.ts` — header prose removed, `formatCompactArchivesSection` reduced to a scope line + list |
| Turn context | New kind `session_retrieval`, main-agent only (not added to `SUBAGENT_ALLOWED_KINDS`: subagents do local searches, cross-session recall is the root agent's job) |
| Docs | `AGENTS.md` — compaction section reduced to the mechanism and the new section named; `packages/core/ARCHITECTURE.md` — turn-context section updated |
| Tests | `validate-compact-archive` prose assertions replaced with shape+scope assertions, plus a guard that usage prose has not returned. New `validate:session-retrieval` for the section's gating, content, and no-drift contract |
| Not covered | Reading a session for the model (only pointing at it); pruning/retention of `.agents/`; subdirectory or cross-project history |
| Risk | A model that used to learn "search newest-first" only from the summary now learns it from the section — strictly broader reach, and it appears even when this session never compacted |
