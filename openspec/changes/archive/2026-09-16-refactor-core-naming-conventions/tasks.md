# Tasks: refactor-core-naming-conventions

## 1. Built-in extension factories

- [x] 1.1 Move LSP factory from `agent/lsp/index.ts` to new `agent/lsp/extension.ts`; `lsp/index.ts` re-exports it
- [x] 1.2 Delete bare aliases (`skillsExtension`, `memoryExtension`, `lspExtension`) and all three default exports; grep-audit first that nothing imports them (incl. dynamic imports)
- [x] 1.3 Update `managers/agent-factory.ts` and `src/dev.ts` re-exports to canonical names only
- [x] 1.4 Verify: `rg "export default" packages/core/src/agent` returns no extension matches; core builds; validate:lsp-parity, validate:skills-extension, validate:memory-extension pass

## 2. ManagedAgent field / accessor cleanup

- [x] 2.1 Rename `_status → currentStatus`, `_ui → uiChannel`, `_chatController → chatController` inside `managed-agent*.ts` (public getters/methods unchanged)
- [x] 2.2 Rename `getSkillRegister/setSkillRegister → getSkillRegistry/setSkillRegistry`; update call sites (`session-bootstrap-events.ts`, `agent-factory.ts`) and any `dev.ts` re-exports
- [x] 2.3 Verify: `rg "_status|_ui\b|_chatController|SkillRegister" packages/core/src` returns no code hits; typecheck + build pass

## 3. Descriptive file names

- [x] 3.1 Rename `subagent/output.ts → subagent-output.ts`, `subagent/prompt.ts → explore-prompt.ts`, `subagent/tools.ts → subagent-tools.ts`; update subagent barrel + importers
- [x] 3.2 Rename `lsp/tools/shared.ts → lsp/tools/tool-shared.ts`; update lsp tool imports
- [x] 3.3 Update `dev.ts` re-export paths and any `scripts/*.mjs` importing renamed modules in the same task
- [x] 3.4 Verify: full `validate:*` suite green after renames

## 4. Barrels for unbarreled directories

- [x] 4.1 Add `index.ts` to `src/utils/`, `src/agent/approval/`, `src/agent/media/`, `src/agent/run-helpers/`, `src/managers/stream-recovery/`
- [x] 4.2 Convert existing deep-path imports of those modules to barrel imports where the file already imports 2+ symbols from the same directory (no mechanical mass rewrite)
- [x] 4.3 Verify: typecheck, build core, affected validate scripts

## 5. File-size alignment (`.cursor/rules/040`)

- [x] 5.1 Split `src/dev.ts` (425 lines) into domain-scoped parts under 400 lines each (e.g. `dev-agent.ts`, `dev-managers.ts`, `dev-models.ts`) with `dev.ts` as the aggregating entry — `package.json` validate scripts keep importing `dist/dev.mjs`
- [x] 5.2 Evaluated extraction from `managed-agent.ts` (~1380 lines): the remaining methods are one-line delegations to composed controllers (`planMode`, `autoMode`, `run`, `approvals`) — moving them would relocate code without reducing complexity. Exception recorded per rule `040`'s own trade-off clause ("do not split files just to satisfy the limit when it would make the code harder to follow"); also noted in design.md D7.
- [x] 5.3 Verify: every `src/dev*.ts` file under 400 lines; full validate suite green

## 6. Docs: conventions + structure map

- [x] 6.1 Add "Core Naming Conventions" section to AGENTS.md: file naming (kebab-case, descriptive > generic), extension factories (`createXxxExtension`, no aliases/defaults), member/accessor rules (no `_` members; getter vs getXxx guidance), barrel expectations, no-compat rule for internal renames
- [x] 6.2 Fix AGENTS.md core file-structure map: dedupe `env.ts` entry, add missing directories (`media/`, `approval/`, `turn-context/`, `summary-stream/`, `stream/`), correct drifted paths
- [x] 6.3 Final acceptance pass against proposal success criteria: greps for canonical exports / underscores / SkillRegister / barrels / dev-file line counts, then `pnpm build`, `pnpm lint`, full `validate:*` suite
