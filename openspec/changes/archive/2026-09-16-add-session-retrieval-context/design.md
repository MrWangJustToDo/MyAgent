## Context

Turn context is injected as synthetic `<ctx kind=...>` user messages by the turn-context middleware, hash-admitted per kind: a section is re-injected only when its content hash changes (or a periodic refresh threshold is crossed). Sections are therefore expected to be *stable* — a section whose content churns forces re-injection of the whole block and invalidates the prompt-cache prefix.

This design is shaped by that contract, and by a survey of where the same guidance already lives (see proposal: four sites, two of them frozen).

## Goals / Non-Goals

**Goals**

- A model working in a workspace with history knows that earlier sessions are on disk, what shapes they take, and how to read each one.
- Exactly one site carries usage guidance, and it is the site that is always current.
- The guidance costs nothing when there is no history (fresh clone, project that never ran an agent).
- No section content changes merely because a session was created or pruned.

**Non-Goals**

- Building retrieval: reading, summarizing, or indexing a past session is the model's own work with grep and `read_file`. This change only tells it that the material exists and how it is shaped.
- Pruning or retention of `.agents/`. The counts measured here (247 sessions, 753M) are an observation, not a mandate.
- Cross-project or subdirectory history.
- Rewriting archive files already on disk.

## Decisions

### D1: Turn context is the single home for usage guidance

**Decision.** How to search conversation history is stated in one place: a turn-context section. Every other site either carries no usage prose (archive header) or carries only data (the summary's path list).

**Why.** Of the four sites, this is the only one that is (a) always current, (b) always present once history exists, and (c) not shipped with the repository. The archive header is frozen at write time and had already drifted from the summary; `AGENTS.md` is at its byte ceiling (65469/65536, with its tail already truncated) and describes the repository rather than the live state of a workspace.

**Rejected:** teaching the guidance in `AGENTS.md` and having the runtime only list paths. It is where a reader would look first, but it evicts real content under a budget that is already truncating, and it is the wrong kind of content — repository knowledge, not runtime state.

### D2: Static text behind a one-time existence gate — no counts, no per-session paths

**Decision.** The section body is constant. It is emitted iff the workspace has conversation history, computed once per agent. No file counts, no per-turn walks, and **no this-session archive paths**.

**Why no counts or paths.** Both are volatile. Counts change whenever a session is created or pruned; this session's paths change on every compaction. Either one changes the section hash, re-injecting the whole block and invalidating the cache prefix after it. With a fully static body, one admission settles the section for the session's life.

**Where the paths come from instead.** The compaction summary appends `## Compact archives` with this session's paths, and the summary is projected to the head of the model-visible chain. So the summary already carries the paths, and repeating them in the section would buy nothing while forcing a re-injection per compaction. Existence, by contrast, is near-constant — gating on it keeps the section stable while still omitting it entirely on a fresh clone.

**Why this is not a coverage hole.** The summary list sits *after* the summary body, i.e. below the cut point, so further compaction displaces it along with the turns it named. The section's shape description ("compacted slices live at `transcripts/<sessionId>/compact-<N>.md`, plain text, search newest first") does not depend on that list's position, so the guidance outlives it.

**Trade-off:** the model cannot be told how much is there, so it cannot calibrate how hard to search. Accepted — one `ls` answers that if it matters.

### D3: Main agent only

**Decision.** `session_retrieval` is not added to `SUBAGENT_ALLOWED_KINDS`.

**Why.** Subagents run one delegated search and are already told to be narrow. Cross-session recall is a root-agent decision ("this depends on something from an earlier session"), and the guidance is a standing invitation to wander that a subagent does not need.

### D4: The summary's `## Compact archives` keeps its path list, loses its prose

**Decision.** `formatCompactArchivesSection` becomes a scope line plus the path list. It loses "newest → oldest", "File shape:", and the "do not load whole files" instruction.

**Why keep the list there.** The summary says "turns 1-140 were compacted"; the list immediately answers "into these files". The co-location is the point — splitting them puts the statement and the location in two places separated by the rest of the conversation. It cannot be reproduced from a later-appended turn-context section.

**Why strip the prose.** The prose — not the list — is what drifted (the file header lacked "newest → oldest"). The list is *data* and does not age; the surrounding instructions were a second copy of D1's content. After stripping, this block can state only two things, both of which remain true: these paths exist, and they belong to this session.

**Why the scope line.** This list is current-session only; the new section is cross-session. Without a stated boundary a model may read the new section as another rendering of this list and conclude that the only reachable history is this session's — defeating D1 for the 200 sessions that never compacted.

### D5: Keep the path list out of the extraction mechanism's way

**Decision.** `extractCompactArchivePaths` and `stripCompactArchiveSections` are unchanged.

**Why.** Paths survive successive compactions by being recovered from the previous summary *text* (a regex over backticked paths). The block therefore has to stay in the summary for the mechanism to keep working. This also rules out deleting the section outright: it would lose prior paths mid-chain and leave a stripper matching nothing.

### D6: Existing archives are not rewritten

**Decision.** Archives already on disk keep their old headers, including the removed prose.

**Why.** They are immutable artifacts of past sessions (monotonic `compact-<N>` naming); rewriting them would be a migration over user data to delete one sentence. The cost is bounded: the stale prose only appears *after* the model has already followed the current guidance to open the file. Documented as a known limitation rather than fixed.

### D7: The header becomes self-describing

**Decision.** `buildCompactArchiveMarkdown` emits `# Compact archive` plus `session` / `sequence` / `timestamp` / `cutIndex` and the body.

**Why.** A model reading the file has already acted on D1's guidance, so a "prefer grep, do not load this file" line is self-contradictory advice at that point. Removing it also removes the only copy that could never be revised.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Guidance is duplicated again later (the drift this change exists to remove) | A validator asserts the summary block and the archive header contain no usage prose, so re-adding it fails the build |
| Two blocks mention archives; a reader conflates their scopes | The summary block states current-session scope explicitly (D4) |
| A model ignores the invitation and never searches | Cannot be forced; the section only removes the "no path exists" state, which is the actual defect |
| Section appears in workspaces whose history is irrelevant to the task | It is one short block, emitted only when history exists, and stable thereafter — no per-turn cost |
| Old archives keep stale prose (D6) | Bounded and self-limiting: it is only reachable after the model already followed current guidance |

## Migration Plan

No data migration and no state change. The section is computed at agent creation per session; the prose changes take effect on the next compaction for new archives and for the summary list. Existing archives are left alone (D6).

## Open Questions

- Whether a retention policy for `.agents/` is wanted at all — 753M of sessions and 94M of logs accumulate. Out of scope; this change only points at what exists.
- Whether the guidance should also cover `.agents/logs/` (structured agent logs, not conversation). Deferred: no evidence a model has needed them, and every addition to the section is a standing distraction.
