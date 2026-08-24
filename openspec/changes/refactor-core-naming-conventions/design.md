# Design: core naming and organization conventions

## Context

This is a conventions-alignment change, not a redesign. Every decision below optimizes for
**smallest safe diff** while leaving a written rule behind so the inconsistency does not
regrow. The codebase has no test framework; correctness is guarded by `tsc`, ESLint, and
the `validate:*` script suite — every task must keep those green, which also means any
rename must update `scripts/*.mjs` imports that pull from `dist/dev.mjs`.

## Decisions

### D1 — One canonical extension factory: `createXxxExtension`

The three built-ins each export `createXxxExtension` (used by `agent-factory.ts`), a bare
alias (`skillsExtension` / `memoryExtension` / `lspExtension`), and a default export.
Nothing outside core imports the aliases or defaults (verified via grep; only `dev.ts`
re-exports them).

Decision: keep `createXxxExtension`, delete aliases and defaults. Rationale:
- `create*` matches the repo-wide factory convention already used everywhere else
  (`createNodeEnv`, `createDirectModelProvider`, `createTaskTool`, …).
- Default exports are un-greppable and break barrel re-export ergonomics.
- LSP additionally gets its factory moved from `lsp/index.ts` to `lsp/extension.ts`,
  matching the `memory/extension.ts` / `skills/extension.ts` placement, so "where do I
  find a built-in extension?" has one answer: `<domain>/extension.ts`.

Risk: none beyond import updates in `agent-factory.ts` and `dev.ts`.

### D2 — Underscore-backed fields: rename, don't rationalize

`_status`, `_ui`, `_chatController` exist because each backs a same-named public getter or
accessor (`get status()`, `get ui()`, `getChatController()`). Two options were considered:

- **Keep underscores, document as "getter backing fields"** — rejected: codifies the
  exception the user flagged; three of 34 privates would still differ.
- **Rename to descriptive names** (chosen): `_status → currentStatus`,
  `_ui → uiChannel`, `_chatController → chatController`. No name collision: fields live in
  a different namespace than methods, so `chatController` (field) + `getChatController()`
  (method) coexist legally.

All three are confined to `managed-agent*.ts` (verified). Per the project's
no-backward-compatibility rule for internal refactors, call sites switch to new paths and
names directly — no deprecation shims, aliases, or re-exports of old identifiers.

### D3 — Accessor duality is documented, not mass-converted

ManagedAgent exposes both getters (`get status`) and `getXxx()` methods. Converting one
form to the other would touch host packages (`app/`, `cli/`, `extension/`, `server/`) with
zero behavior gain — out of scope per proposal Non-Goals. Instead AGENTS.md gains a rule:

> Property-like hot reads may be getters; everything else uses `getXxx()` / `setXxx()`
> methods. Within one feature area, pick one form and stay consistent. Underscore-prefixed
> members are not allowed.

The misnomer `getSkillRegister/setSkillRegister` IS fixed now (→ `SkillRegistry`) since it
is a plain rename with three call-site files and no compatibility shims.

### D4 — Descriptive renames over file moves

Generic names are renamed **in place** rather than moved into new directories:

| Current | New | Content |
|---|---|---|
| `subagent/output.ts` | `subagent/subagent-output.ts` | cancel notice + summary truncation |
| `subagent/prompt.ts` | `subagent/explore-prompt.ts` | explore system prompt |
| `subagent/tools.ts` | `subagent/subagent-tools.ts` | read-only subagent tool set |
| `lsp/tools/shared.ts` | `lsp/tools/tool-shared.ts` | helpers shared by lsp tool modules |

(`tools/util/helpers.ts` is deferred: it holds `withDuration` which is imported widely;
renaming it rides along with the future tools-layout change rather than churning imports
twice.)

Rationale for in-place renames: directory moves would fight the pending
`core-structure-convergence` change and inflate this diff without adding rules.

### D5 — Barrels only where deep-path imports already cluster

Barrels added to `utils/`, `approval/`, `media/`, `run-helpers/`, `managers/stream-recovery/`.
No top-level `src/agent/index.ts`: that barrel's surface would span ~20 domains and become
a coupling magnet; cross-domain imports keep using direct paths there. This matches the
existing split where domain barrels exist but `agent/` itself is intentionally open.

### D6 — No backward compatibility for internal renames

Per project decision: directory / file / export changes land as the new shape directly.
Old export paths, alias identifiers, and default exports are deleted in the same task that
introduces the new ones — no re-export bridges, deprecation warnings, or staged dual
exports. Call sites (including `dev.ts` and `scripts/*.mjs`) are updated in the same task,
which is safe because the whole monorepo compiles as one workspace.

### D7 — `.cursor/rules` alignment (best-effort where impractical)

The workspace's Cursor rules apply to this change with varying directness:

| Rule | Relevance |
|------|-----------|
| `010-affected-package-builds` | Validation strategy already scoped to package builds — aligned |
| `040-file-size-limit` | **In scope**: `dev.ts` is 425 lines (> 400). Split into domain-scoped entry parts (`dev.ts` re-exports from `dev-agent.ts`, `dev-managers.ts`, …) so every file is under the limit. `managed-agent.ts` (~1340 lines) also exceeds it; a full split is runtime-risk churn, so this change extracts only cohesive, low-risk chunks into the existing partial-file pattern (`managed-agent-*.ts`) on a best-effort basis — exceeding the limit there is acceptable per the rule's own trade-off clause and documented |
| `060-docs-for-runtime-and-exports` | Covered: AGENTS.md structure map + conventions section update in the same tasks as renames |
| `070-task-validation-efficiency` | Aligned: scoped lint/format, validate once at task end |
| `020/030/050` | Not triggered (no new components, cursor rules, or utilities) |

### D8 — Validation strategy

Each task ends green under: `pnpm typecheck`, targeted builds of touched packages,
`pnpm exec eslint <files>`, and the full `validate:*` suite at the end (scripts import
`dist/dev.mjs`, so renames require updating both `src/dev.ts` re-exports and script
imports in the same task). A final grep-based acceptance pass mirrors the success
criteria in proposal.md.

## Risks

- **Stale external references**: docs (AGENTS.md) reference old paths — refreshed in-task.
- **Silent alias usage**: if any package imported a default export dynamically it would
  break at runtime, not compile time — mitigated by grep audit before deletion.
- **Rename churn vs in-flight changes**: two other changes are open
  (`app-session-only-remote`, `core-structure-convergence`); neither touches the files
  renamed here except `dev.ts`, which is merge-trivial.
