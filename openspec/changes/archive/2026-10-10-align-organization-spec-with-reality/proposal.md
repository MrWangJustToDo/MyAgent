# Change: Align the organization spec with the policy it contradicts

## Why

`openspec/specs/core-code-organization/spec.md` carries a requirement — *Domain utility directories
expose barrels* — that **contradicts `AGENTS.md` and names a directory that does not exist**:

> Each domain utility directory SHALL provide an `index.ts` barrel. The directories in scope are
> `src/utils/`, `src/agent/approval/`, `src/agent/media/`, `src/agent/run-helpers/`, and
> `src/managers/stream-recovery/`.

Three independent problems, all verifiable today:

| Problem | Evidence |
|---------|----------|
| It contradicts the barrel policy | `AGENTS.md:361-363` — "The top-level `src/agent/` namespace is **intentionally barrel-free**; cross-domain imports use direct module paths there." The requirement demands barrels at `agent/approval/` and `agent/media/` — both inside that namespace. |
| It names a directory that is gone | `src/agent/run-helpers/` does not exist under `packages/core/src`. The requirement is the only place in the repo that mentions it (`grep -rn run-helpers` → this spec, lines 58 and 66). `run-helpers/index.js` cannot resolve, so the scenario it states is unsatisfiable. |
| Four of its five barrels are deleted | A follow-up audit found the four in-scope barrels under `agent/` and `utils/` were imported by nobody. They were removed as dead weight. Only the policy survives, because the policy was right and the list was wrong. |

The spec was **unenforceable and never enforced**: no gate read it, so the divergence was invisible
for as long as it existed. The list reads as a snapshot of one author's intent at one moment
("these directories had better have a barrel"), which the codebase then decided against — the same
class of staleness as a comment describing code that has moved.

## What Changes

- **Rewrite the requirement** to state the *policy* rather than a directory list: a barrel exists
  when a directory is consumed as a unit, and adding one to a directory with no such consumer is the
  dead-weight shape it is there to prevent. The `src/agent/` barrel-free clause stays (it was already
  correct) and is moved out of the requirement body into a stated rationale.
- **Drop the directory list**, including the vanished `src/agent/run-helpers/`. A hard-coded list is
  what rotted; a rule about the *relationship* between a barrel and its consumers cannot.
- **State the two directions the old text conflated** — "a barrel that exists must be consumed" and
  "a documented path must exist" — as separate, checkable rules, so each can be enforced by a gate.
- **Add the enforcement.** `validate:module-organization` gains rule 4: a repository path named in a
  project documentation file or in a main spec resolves to a real file or directory. This is the
  check that would have caught the stale `run-helpers` entry.

No **BREAKING** changes: no code moves, no export changes. This is a specification correction plus
the gate that keeps it from re-diverging. It is a **prerequisite** for the `middleware/` ownership
work (`middleware-ownership`), which relocates modules that this spec's directory list would
otherwise have constrained.

## Capabilities

### Modified Capabilities

- `core-code-organization`: the barrel requirement is restated as a policy with two enforceable
  rules, and the stale directory list (including `src/agent/run-helpers/`) is removed.

## Impact

| Area | Change |
|------|--------|
| `openspec/specs/core-code-organization/spec.md` | Rewrite the barrel requirement; one requirement becomes two |
| `packages/core/scripts/validate-module-organization.mjs` | Add rule 4 (documented-path existence) |
| `packages/core/package.json` | No change — the gate is already registered |
| Code | **None.** No module moves, no import changes |
| Behavior | None |

## Non-Goals

- Requiring a barrel in every domain directory (the opposite policy; `AGENTS.md` forbids it for `agent/`)
- Re-adding the four deleted barrels (they had no consumer; the policy says they should not exist)
- Making the "consume 2+ symbols through the barrel root" convention enforceable — 81 import sites
  reach around an existing barrel, so that rule would fight a documented convention at scale
- Gate rule 3's watch-list expansion beyond the symbol it was created for

## Success Criteria

1. No requirement in `openspec/specs/` names a repository path that does not resolve — verified by
   the new gate rule, not by reading
2. `validate:module-organization` rule 4 fails when a documented path is removed, demonstrated by
   inverting the check (delete a referenced directory → gate fails; restore → gate passes)
3. `src/agent/run-helpers/` appears nowhere in `openspec/specs/`
4. `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `validate:all` all pass
