## Why

The instruction file is loaded with **first-found-wins** and **`@` references are not resolved at all**. Both are load-bearing and both are wrong for how these files are actually written.

Measured on this repo (evidence, not inference):

- `CLAUDE.md` is a 3.6 KB pointer — "See [AGENTS.md](AGENTS.md) for full architecture, code conventions, and detailed guidelines." `loadAgentDoc` finds `CLAUDE.md` first, `break`s, and **never reads `AGENTS.md`**. The 81 KB of architecture and conventions the pointer names were **silently absent from `<project_instructions>`**.
- A `@AGENTS.md`-style reference is copied through **literally**. Nothing scans for it; grep across the repo for any import-resolution logic (`@import`, `resolveIncludes`, `visited`, `maxImportDepth`, cycle guard) returns nothing.
- Claude Code's documented semantics are the opposite: `@path/to/file` is **expanded and loaded at launch** alongside the referencing file. So a project following the official convention gets a pointer line and none of the content.

The two are one problem: first-found-wins only works if composition is expressible, and composition only works if references are expanded. A thin `CLAUDE.md` + a fat `AGENTS.md` is the idiomatic layout that convention *prescribes*, and it is exactly the layout this loader renders empty.

A second, structural defect was found while wiring this up: the filename list, byte budget, discovery loop, and override-filename rule exist in **two parallel copies** — `agent/prompt/agent-doc-loader.ts` (system prompt) and `agent/turn-context/instruction-context.ts` (edit detection + re-injection), kept aligned by comments ("matches agent-doc-loader"). They disagree today: the turn-context digest hashes **raw file bytes**, so a change to an `@`-imported file would not be detected and the stale `<project_instructions>` would be re-confirmed as current for the rest of the session.

A third, smaller defect surfaced from dogfooding: the byte budget is compared in **bytes** but sliced in **characters**. The repo's own expanded instructions loaded **67583 bytes against a 65536-byte budget** — a CJK character is 3 bytes and an emoji 4, so an ASCII-sized slice overshoots by up to ~4x.

## What Changes

- **Expand `@path` references when loading an instruction file** (Claude Code syntax, max depth 5): relative references resolve against the file that contains them, a leading `/` is **project-root-relative**, references inside fenced blocks / inline code spans are left literal, and a token only counts when it ends in a file extension so npm-style prose (`@my-agent/app`) stays inert.
- **Nothing is silently dropped.** A missing target, a `../` escape, a directory, a cycle, or a depth/budget stop leaves the text as written **and records a notice** that is logged at bootstrap and rendered into `<instruction_context>` on re-injection.
- **Cycle detection is per chain, not global.** A file referenced twice in different branches still expands in both; a genuine `a → b → a` is cut.
- **One shared resolver** (`agent/prompt/instruction-files.ts`) owns the filename list, byte budget, discovery loop, override naming, and expansion. `agent-doc-loader.ts` and `instruction-context.ts` both consume it, so they cannot drift again.
- **Change detection covers imports.** The digest hashes the **expanded** text plus its notices, so editing an `@`-imported file re-injects the instruction block exactly like editing the referencing file.
- **The byte budget counts bytes.** Truncation finds the largest fitting character prefix (binary search) and cuts on a line boundary, so multi-byte content respects the budget instead of overshooting it.
- **First-found-wins is kept, deliberately.** `CLAUDE.md` then `AGENTS.md`, first match only — no implicit fallback. Composition is explicit via `@`; the "safety net" that appends `AGENTS.md` when `CLAUDE.md` exists is rejected because it double-injects on projects that maintain both files as equals.
- **This repo dogfoods it**: `CLAUDE.md` now references `@AGENTS.md`, so the repo's own 81 KB of guidance actually reaches the model.

## Capabilities

### New Capabilities

- `instruction-file-resolution`: which instruction file wins, how `@path` references expand (resolution, depth, cycle, containment, code regions), how failures are reported instead of dropped, and how the byte budget is applied and surfaced.

### Modified Capabilities

None. The turn-context re-injection behavior (digest-driven, sticky, cache-stable) is unchanged in *when* it fires; it now covers imported files, which is specified as part of the new capability rather than as a delta to an existing one.

## Impact

| Area | Change |
|------|--------|
| `packages/core` | New `agent/prompt/instruction-files.ts` (discovery + expansion + budget, single source of truth). `agent-doc-loader.ts` rewritten onto it (`DEFAULT_AGENT_DOC_*` now re-export the shared constants; `AgentDocLoadResult` gains required `importNotices`). `turn-context/instruction-context.ts` rewritten onto it; `LoadedInstructionContent` is now an exported type. `agent-factory.ts` logs import notices. `session-bootstrap-events.ts` / `dev-agent.ts` updated for the new shapes |
| Behavior | `CLAUDE.md` referencing `@AGENTS.md` now loads the referenced content (repo: 3.6 KB → 65450 bytes, within budget). Editing an imported file re-injects. A broken reference is visible instead of absent |
| Docs | `AGENTS.md` (new "Project instructions" section), `packages/core/ARCHITECTURE.md` (turn-context section) |
| Tests | New `validate:instruction-imports` (11 cases). Existing `validate:instruction-context` / `validate:instruction-budget` unchanged and still passing — the formatter treats absent notices as "none" |
| Not covered / unchanged | No nested-directory discovery (only the root + sibling override), matching today's behavior. No `~` or URL imports. The 5-hop depth and 64 KiB budget keep Claude Code's and Codex CLI's existing defaults |
| Risk | An instruction file that deliberately documented a filename in prose without backticks and without an extension-matching path is unaffected; one that wrote a bare `@some/file.md` meaning "see this file" now inlines it — which is the intended semantic, and any failure mode is reported rather than silent |
