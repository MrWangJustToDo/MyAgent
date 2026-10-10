## 1. Correct the spec

- [ ] 1.1 Replace the `Domain utility directories expose barrels` requirement with the
      consumer-based barrel policy (no directory roster)
- [ ] 1.2 Drop `src/agent/run-helpers/` from every location it appears — the directory does not exist
- [ ] 1.3 Confirm `src/agent/` stays barrel-free in the rewording: the clause is the stated rationale,
      not a second instruction competing with the first
- [ ] 1.4 `openspec validate align-organization-spec-with-reality --strict` passes

## 2. Enforce it

- [ ] 2.1 Add rule 4 to `packages/core/scripts/validate-module-organization.mjs`: a `packages/…` or
      `src/…` path named in `AGENTS.md` / `CLAUDE.md` / `openspec/specs/**/spec.md` resolves under the
      repo root or under `packages/core/`
- [ ] 2.2 Resolve directory references written with a trailing slash; ignore non-path words, globs, and
      anything explicitly marked planned or out-of-repo
- [ ] 2.3 Emit the document, the line, and the unresolved path in the failure message, so the fix is a
      one-line lookup
- [ ] 2.4 Document in the script header why rule 4 is existence-only, naming the 81-site measurement
      that ruled out the stronger "2+ symbols must use the barrel" form

## 3. Invert the checks

- [ ] 3.1 Delete a directory referenced from a doc → rule 4 fails naming the doc and path; restore → passes
- [ ] 3.2 Confirm rule 2 (dead barrels) still passes on the current tree — no barrel was re-added and no
      live barrel was removed

## 4. Verify

- [ ] 4.1 `pnpm build` clean
- [ ] 4.2 `pnpm typecheck` 0 errors
- [ ] 4.3 `pnpm lint` clean
- [ ] 4.4 `pnpm run validate:all` — the new gate passes and the count is 199 + 0 regressions
- [ ] 4.5 `grep -rn run-helpers openspec/specs` returns nothing
