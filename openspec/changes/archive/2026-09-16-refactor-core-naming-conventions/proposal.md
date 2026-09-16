# Refactor: core naming and organization conventions

## Why

A full audit of `packages/core/src` found several naming / organization rule sets applied inconsistently. Each individual case is small, but together they make navigation and onboarding harder and invite further drift:

1. **Built-in extensions are inconsistent** — three built-ins (Skills, Memory, LSP) live in different file placements (`skills/extension.ts`, `memory/extension.ts`, `lsp/index.ts`) and each exports **two factory names plus a default export** (`createSkillsExtension` + `skillsExtension` + `default`, likewise memory and lsp).
2. **ManagedAgent private fields mix conventions** — `_status`, `_ui`, `_chatController` use an underscore prefix while 30+ sibling privates (`error`, `runner`, `textAdapter`, …) do not.
3. **Accessor misnomer** — `getSkillRegister()` / `setSkillRegister()` hold a `SkillRegistry`, not a "register".
4. **Generic file names hide intent** — `subagent/output.ts`, `subagent/prompt.ts`, `subagent/tools.ts`, `tools/util/helpers.ts`; plus `lsp/tools/shared.ts` collides conceptually with the `lsp/shared/` directory.
5. **Barrel coverage is uneven** — `utils/`, `approval/`, `media/`, `run-helpers/`, `managers/stream-recovery/` have no `index.ts`, so deep-path and barrel import styles coexist across the package.
6. **AGENTS.md structure map has drifted** — `env.ts` is listed twice; recently added directories (`media/`, `approval/`, `turn-context/`) are missing.

## What Changes

- **Extension factories**: keep exactly one canonical export per built-in (`createXxxExtension`), delete the bare-name aliases and default exports, move LSP's factory into `agent/lsp/extension.ts`.
- **ManagedAgent fields**: remove all underscore-prefixed privates (rename to descriptive names); fix the `SkillRegister → SkillRegistry` misnomer (internal rename — public method surface unchanged where it is part of the curated API).
- **Descriptive file names**: rename generic-named modules inside `agent/subagent/` and `agent/tools/util/` so file names state their content; resolve the `lsp/tools/shared.ts` vs `lsp/shared/` collision.
- **Barrels**: add `index.ts` to `utils/`, `approval/`, `media/`, `run-helpers/`, `managers/stream-recovery/`.
- **Docs**: refresh the AGENTS.md file-structure map and add an explicit naming-conventions section (files, extension factories, accessors) so future code has a rule to follow.

All changes are internal to `packages/core` (plus docs and `.cursor/rules` alignment). No
runtime behavior changes. Per project decision, renamed files / directories / exports land
as the new shape directly — **no backward-compatibility shims** (no old-path re-exports,
alias deprecations, or staged dual exports); call sites switch in the same task.

Additionally, this change aligns core with the workspace's `.cursor/rules` conventions
where practical — notably the 400-line file-size limit (`040`): `dev.ts` (425 lines) is
split into domain-scoped entry parts, and `managed-agent.ts` (~1340 lines) gets
best-effort cohesive extractions into the existing `managed-agent-*.ts` partial pattern.

## Capabilities

### New Capabilities

- `core-code-organization`: naming and layout rules for packages/core — extension factory exports, ManagedAgent field/accessor style, descriptive module names, barrel coverage, and doc accuracy.

## Impact

| Area | Change |
|------|--------|
| `packages/core/src/agent/lsp/` | factory moved to `extension.ts`; aliases/default removed |
| `packages/core/src/agent/skills/`, `agent/memory/` | aliases/default removed |
| `packages/core/src/managers/managed-agent.ts` (+ partials) | underscore-backed fields renamed |
| `packages/core/src/managers/{session-bootstrap-events,agent-factory}.ts` | call sites of renamed SkillRegistry accessors |
| `packages/core/src/dev.ts` | split under 400 lines (`dev-*.ts` domain parts); re-export list updated to canonical names only |
| `packages/core/scripts/*.mjs` | imports updated where they touch renamed files/exports |
| `packages/app`, `packages/cli`, others | none expected (verified: no external usage of removed aliases) |
| `AGENTS.md` | structure map + new naming-conventions section |

## Non-Goals

- Merging the run-pipeline directories (`agent/run`, `agent/run-helpers`, `agent/runner`, `managers/run-*`) — high-churn structural move, separate proposal
- Restructuring `agent/tools/` layers (flat tools vs `util/` vs `runtime/` vs `websearch/providers/`)
- Inverting the `runtime-types/hosts.ts` dependency shim
- Mass-converting `getXxx()` methods to getters (or vice versa) on ManagedAgent's public API — that breaks host packages for zero behavior gain; instead the convention documents when each form applies
- Fully splitting `managed-agent.ts` under the 400-line rule — only cohesive low-risk chunks move into existing partial files; the remainder is a documented exception (`.cursor/rules/040` trade-off clause)
- Removing `dev.ts` (validation entry point stays; it is split, not removed)

## Success Criteria

1. Exactly one factory export per built-in extension; `rg "export default"` finds no extension default exports in core
2. No underscore-prefixed private fields in `managed-agent*.ts`
3. No `SkillRegister` identifiers remain
4. The five listed directories have `index.ts`; no renamed module keeps stale references
5. Every file in `src/dev*.ts` is under 400 lines
6. `pnpm build`, `pnpm typecheck`, `pnpm lint`, and every `validate:*` script pass
7. AGENTS.md structure map matches `ls packages/core/src` output
