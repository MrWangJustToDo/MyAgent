## 1. The suite runner

- [x] 1.1 `scripts/run-all-validators.mjs` — glob `validate-*.mjs` in the script
      directory, run each with `node` (no rebuild), bounded concurrency (4 measured ≈ 34 s for
      157; higher risks the ~4 GB-runner memory ceiling of a 24 GB build).
- [x] 1.2 Per-validator timeout (the slowest real one is 21.0 s; 90 s is ample) so a hung
      validator cannot stall the job until CI's global timeout.
- [x] 1.3 Summary: per-validator status + duration, then totals for passed / failed / skipped,
      and the last lines of output for each failure.
- [x] 1.4 Exit non-zero if any validator fails. A skip alone SHALL NOT fail the run, but skips MUST
      be counted and listed.
- [x] 1.5 Skip detection: treat a validator as skipped when it exits 0 AND its output carries a
      skip marker. Introduce one shared marker constant (the string already in use is
      `skipping`, e.g. `⚠️ … not found on PATH — skipping real-server validation`).
- [x] 1.6 Untracked-path guard: fail a validator whose output or source references a repo-relative
      `.agents/` read. Prefer detecting the *read* (a path built from the repo root) over
      detecting the string, so synthetic path values are not false positives — the previous
      incident was a real read, and three validators already use `.agents/...` only as literal
      data.
- [x] 1.7 Reuse the same runner file in the other packages (parameterised by script directory), or
      duplicate it per package if cross-package import is awkward under the `.mjs`/ESM setup.

## 2. Package wiring

- [x] 2.1 `packages/core/package.json` — `validate:all:core` → the runner. Do NOT change the 151
      existing `validate:*` definitions.
- [x] 2.2 Same for `node`, `server`, `app`, `playground`, `im-bridge` (`validate:all:<pkg>`),
      covering their 24 validators.
- [x] 2.3 Root script (e.g. `validate:all` in the root `package.json`) that runs every package's
      driver and aggregates the exit status, following the existing `build:*` convention.
- [x] 2.4 Confirm the runner behaves when a package has zero validators (no crash, reported as 0).

## 3. Prerequisites that cannot work on Windows

- [x] 3.1 `packages/core/scripts/validate-lsp-real-server.mjs` — replace
      `spawnSync("sh", ["-c", `command -v "${command}"`])` with a cross-platform probe (the
      codebase already has command-resolution logic in `@codent/node`; `node/scripts/`
      `validate-lsp-command-exists.mjs` covers adjacent ground). On Windows it currently cannot
      detect the server and degrades to the silent skip.
- [x] 3.2 Decide per validator whether a missing prerequisite is a **skip** or a **failure**, and
      make that explicit in the output using the shared marker (1.5). `validate-lsp-real-server`
      needs a real `typescript-language-server`; CI has none, so it will skip — that must be
      visible in the summary rather than reading as a pass.
- [x] 3.3 `packages/server/scripts/validate-agent-session-channels.mjs:103` prints
      `(no extensions loaded on temp root; skipping extension.toggle branch)` — route it through
      the same marker so the partial skip is reported.
- [x] 3.4 Audit the remaining external-dependency validators for the same silent-pass shape:
      `validate-lsp-extension`, `validate-lsp-lifecycle`, `validate-lsp-midstartup-shutdown`,
      `validate-lsp-transport`, `validate-tanstack-adapter`, `validate-agent-session-http`,
      `validate-coreenv-http`, `validate-env-workspace`, `node/validate-lsp-command-exists`.
      **Result:** three more real defects, all worse than a silent skip — see the note below.

### 3.4 findings (three POSIX-only process-count bugs)

`pgrep` does not exist on Windows, and the count helpers wrapped it in `catch { return 0 }`.
**0 is the value that means "all children gone"**, so the reaping assertions passed without
observing anything:

| Validator | Without `pgrep` (was) | Now |
|---|---|---|
| `validate-lsp-extension` | vacuous **pass** | explicit skip |
| `validate-lsp-lifecycle` | misleading **failure** (`lsp_diagnostics lazy-starts mock server (A)`) | explicit skip |
| `validate-lsp-midstartup-shutdown` | misleading **failure** | explicit skip |

A misleading *failure* is as bad as a false pass — it names the wrong thing and sends the next
person hunting a reaping bug that is not there. New `scripts/process-count.mjs` returns `null`
for "cannot observe" (never 0) and emits the marker itself, so gating on the platform alone is
not enough: a Linux box without `pgrep` on PATH gets the same loud skip.

## 4. CI

- [x] 4.1 `.github/workflows/ci.yml` — add one step `Run all validators` after `Build` (and after
      `Test`), calling the root driver. It reuses the build already in place.
- [x] 4.2 `validate:builtin-skills` keeps its dedicated step or folds into the suite — if it folds,
      confirm the suite still reports it by name (the suite is a superset, so a dedicated step is
      redundant unless it needs to run earlier). **Folded in:** the suite supersedes it, and
      `validate-builtin-skills.mjs` reports by name in the run log.
- [x] 4.3 Add a Windows runner: a separate `validators-windows` job (see below), not a matrix over
      `check` — the question is whether the *validators* hold up on Windows, and re-running
      lint/typecheck there would double cost while answering a different question.
- [x] 4.4 Budget: expect ≈ 88 s added per platform. Confirm the job did not materially regress.
      See the measured note below.

### 4.1 / 4.3 note: scope of the Windows job

The Windows job runs Checkout → Setup pnpm/node → Install → `wxt prepare` → `Build` → suite. It
deliberately does **not** run lint/typecheck: those are already covered on Linux, and duplicating
them would double the job for no added signal. The pnpm store cache step gained a Windows store
path (`~/AppData/Local/pnpm/store`) so the job is not a cold install every run.

No step needs `shell: bash`: every `run:` here is a single `pnpm`/`node` command with no pipes or
shell built-ins, so the default PowerShell on Windows is fine.

### 4.4 measured

`pnpm run validate:all` on this checkout: **180 passed, 0 failed, 1 skipped** in ≈ 77 s wall
(core 33.8 s + server 30.9 s + im-bridge 6.0 s + node 3.4 s + playground 0.03 s + app). The 1 skip
is `validate-tanstack-adapter` (no local OpenAI-compatible endpoint) — correctly reported as a
skip, not a pass.

## 5. Verification

- [x] 5.1 Local: run the full suite on Linux, confirm 0 failures and that the totals match the
      measured 181 (157 core + 24 non-core). **180 passed + 1 skipped = 181** ✓
- [x] 5.2 Local: simulate CI's clean-clone condition (no `.agents/`) and re-run — the suite must
      still pass. This is the exact condition that produced the previous red build.
- [x] 5.3 Sabotage: break one validator (make it fail) and confirm the suite exits non-zero and
      names it; delete the assertions from another (exit 0, nothing checked) and confirm it is
      reported as a skip rather than a pass.
- [x] 5.4 Sabotage: add a deliberate `.agents/` read to a validator and confirm the
      untracked-path guard catches it.
- [x] 5.5 Confirm the Windows run reports something meaningful — in particular that the LSP
      validators are reported as skipped, not passed, on a runner with no language server.

### 5.x evidence

| Task | Sabotage / condition | Result |
|---|---|---|
| 5.1 | full suite | 180 passed, 0 failed, 1 skipped |
| 5.2 | `.agents/skills` deleted | suite exit 0, same totals |
| 5.3a | `assert.fail()` injected into `validate-tool-presentation` | exit 1, names it |
| 5.3b | validator reduced to `console.log(...); process.exit(0)` | counted as **pass** |
| 5.3c | same, plus `[validator-skip]` marker | counted as **skip** |
| 5.4 | repo-root `.agents/skills` read added to a playground validator | exit 1, `reads ".agents/" relative to the repo` |
| 5.5 | PATH with no `pgrep` (the Windows condition) | 4 skips, 0 failures — previously 2 misleading failures + 1 vacuous pass |

5.3b is worth stating plainly: an `exit 0` validator that asserts nothing is **still counted as a
pass**, and cannot be detected from the outside. The contract is that a validator which skips work
must print the marker. Enforcement is social (a reviewer sees the skip in the summary) until a
future change makes the marker mandatory for a script with no assertions.

## 6. Follow-ups (not part of this change)

- [x] 6.1 `validate-format-read-file-result.mjs` has no `validate:*` npm entry (156 entries for
      157 files). The driver covers it; adding the entry is cosmetic but worth doing. **Covered by
      the glob** — it ran in the suite as `ok validate-format-read-file-result.mjs`.
- [ ] 6.2 Reconsider path-filtering only if the suite's unconditional cost becomes a problem.
- [ ] 6.3 `examples/` is eslint-ignored, so `examples/extensions/*.mjs` have no static check —
      the API-conformance probe written during `add-builtin-skills` could be committed as a
      validator so that class of drift is caught automatically.
- [ ] 6.4 Make the skip marker enforcement stricter: today a validator that asserts nothing and
      exits 0 is indistinguishable from one that verified everything unless it prints the marker.
      A heuristic (fail a validator that emits no assertion output yet exits 0) would close the
      gap but needs care to avoid false positives on quiet-but-real validators.
- [ ] 6.5 The `--quiet` flag only suppresses per-validator `ok` lines; per-package summaries and
      skips still print. Consider a `--json` mode if CI wants machine-readable results.
