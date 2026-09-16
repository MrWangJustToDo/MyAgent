# Tasks

## 1. Shared resolver (single source of truth)

- [x] 1.1 `packages/core/src/agent/prompt/instruction-files.ts` — `INSTRUCTION_FILENAMES` (`["CLAUDE.md", "AGENTS.md"]`), `INSTRUCTION_MAX_BYTES` (65536), `MAX_INSTRUCTION_IMPORT_DEPTH` (5)
- [x] 1.2 `resolvePrimaryInstruction()` — first existing file wins, reads + expands + budgets, returns `ResolvedInstructionFile { path, name, content, truncated, importNotices }`
- [x] 1.3 `resolveOverrideInstruction()` / `overrideFilenameFor()` — sibling `AGENTS.md` → `AGENTS.override.md`, expanded through the same path
- [x] 1.4 `truncateToBudget()` — byte-accurate (binary search over the largest fitting character prefix), line-boundary cut, reports truncation
- [x] 1.5 `expandInstructionImports()` + `findCodeRegions()` — the `@path` engine (below)

## 2. `@path` expansion engine

- [x] 2.1 Match `@` at line start or after whitespace; peel trailing punctuation; require a file-extension suffix so npm scopes stay inert
- [x] 2.2 Resolve relative references against the **including file's** directory; a leading `/` is **project-root-relative** (`@/openspec/AGENTS.md`)
- [x] 2.3 Skip references inside fenced blocks and inline code spans (`findCodeRegions`, CommonMark-shaped: fences need their own line + 3 chars; spans close on a same-length backtick run)
- [x] 2.4 Cycle guard: per-chain `visited` (copied per branch; shared byte counter), so a sibling re-reference still expands and a real cycle is cut
- [x] 2.5 Depth bound (`MAX_INSTRUCTION_IMPORT_DEPTH`) and byte-budget bound, each reported when it stops
- [x] 2.6 Containment: reject anything resolving outside `rootPath` (the `../` vector) and reject directories
- [x] 2.7 Delimit inlined regions (`<!-- import: … -->` / `<!-- end import: … -->`); leave every failure as written and record a notice

## 3. Wire both consumers onto the shared resolver

- [x] 3.1 `agent/prompt/agent-doc-loader.ts` rewritten: `DEFAULT_AGENT_DOC_FILENAMES` / `DEFAULT_AGENT_DOC_MAX_BYTES` re-export the shared constants; `AgentDocLoadResult.importNotices` added; `formatAgentDocResult` reports a notice count
- [x] 3.2 `agent/turn-context/instruction-context.ts` rewritten: discovery + resolution delegated; `INSTRUCTION_FILENAMES` / `INSTRUCTION_MAX_BYTES` re-exported; digest hashes **expanded text + notices**; `LoadedInstructionContent` exported; `formatInstructionContextSection` renders unresolved-import notices
- [x] 3.3 `managers/agent-factory.ts` logs each import notice (a broken reference was previously indistinguishable from a file without that content)
- [x] 3.4 `managers/session-bootstrap-events.ts` passes the new required field
- [x] 3.5 `dev/dev-agent.ts` + `turn-context/index.ts` export the new types/helpers for validation scripts

## 4. Dogfood on this repo

- [x] 4.1 `CLAUDE.md` references `@AGENTS.md` instead of a markdown link
- [x] 4.2 Verified against the real `CoreEnv` (`@my-agent/node`): `CLAUDE.md` loads, the 81 KB `AGENTS.md` content is inlined, no notices, and the result is **within** the 65536-byte budget (65450)

## 5. Coverage (core has no test runner; `validate:*` is the mechanism)

- [x] 5.1 `packages/core/scripts/validate-instruction-imports.mjs` + `validate:instruction-imports` script — 11 cases: inlining, code regions, scoped-package prose, cycles, depth, budget, `../` escape / directory / missing target, root-relative `@/path`, multi-byte budget, end-to-end `loadAgentDoc` + digest coverage, first-wins discovery
- [x] 5.2 **Mutation-tested each guard** (restore the defect → the guard must fail): expansion off; `visited` removed; code-region skip removed; extension requirement removed; containment removed; depth bound removed; digest switched to raw bytes (notices-only mutation was mis-aimed and re-run against the real digest source); character-count truncation; `@/path` treated as absolute. All nine bite
- [x] 5.3 Existing `validate:instruction-context` and `validate:instruction-budget` still pass (formatter tolerates absent notices)

## 6. Docs

- [x] 6.1 `AGENTS.md` — new "Project instructions" subsection under Prompt Cache: first-wins, `@` semantics, root-relative `/`, reported failures, shared module, byte budget
- [x] 6.2 `packages/core/ARCHITECTURE.md` — turn-context section updated with the loading/expansion contract and the validator names
- [x] 6.3 OpenSpec change recorded (`proposal.md` / `design.md` D1–D9 / this file / `specs/instruction-file-resolution/spec.md`)

## 7. Acceptance

- [x] 7.1 `pnpm lint` clean on changed files
- [x] 7.2 `pnpm typecheck` exit 0 (all packages)
- [x] 7.3 `pnpm build:core` OK
- [x] 7.4 App test suite 86/86; all `validate:*` scripts PASS
- [x] 7.5 `openspec validate --specs` / change validation clean
