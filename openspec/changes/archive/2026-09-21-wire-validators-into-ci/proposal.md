# Change: Run the validator suite in CI, on Linux and Windows

## Why

CI runs exactly **one** `@codent/core` validator (`validate:builtin-skills`, added by
`add-builtin-skills`) plus the two `codent-cli` release checks. The other **180** validators —
157 in core, 24 across node/server/app/playground/im-bridge — were written as gates and run only
when someone remembers to type them.

That is not a coverage gap, it is an active hazard. Two examples from a single day:

- `validate:builtin-skills` was wired into CI and immediately went red, because it read
  `.agents/skills` — a gitignored path that does not exist on a fresh clone. It had passed
  locally for as long as it existed. `validate:skills-extension` carries the **identical** bug
  and is still red today, masked only by never being run.
- `validate-format-read-file-result.mjs` has **no `validate:*` entry at all** — 156 npm entries
  for 157 files. It is unreachable from any npm script; nothing has ever run it.

A validator nobody runs is worse than no validator: it reads as coverage in review while
providing none, and it rots silently (this repository has already recorded that lesson for
`validate:render-smoke`).

**The blocker was believed to be cost. It is not.** Measured on this checkout:

| | |
|---|---|
| core build (once) | 3.2 s |
| 157 core validators, concurrency 4, **no rebuild** | 34.4 s |
| 24 non-core validators | 50.9 s |
| **total** | **≈ 88 s** |

The 483 s figure that made this look expensive comes from the current script definitions: **151 of
156** core `validate:*` entries embed `pnpm run build &&`, so running them through npm as-is pays
3.2 s × 151 ≈ 483 s of redundant builds. Running the same files against the one build CI already
produces costs 34 s. The expense is an artifact of how the scripts are written, not of the tests.

## What Changes

- **A driver per package runs its validators against the existing build.** `validate:all:<pkg>`
  globs `scripts/validate-*.mjs` and runs each with `node`, with no per-script rebuild. Discovery
  is by the `validate-*` filename convention, which every validator already follows.
- **The `pnpm run build &&` prefix stays.** Those scripts must remain correct standalone and
  pre-wiring-agnostic; the driver simply does not go through them. Changing 151 definitions would
  be large, risky churn for no gain.
- **CI gains one step** (`Run all validators`) after `Build`, calling the per-package drivers.
  It reuses the build that is already there.
- **The job runs on Linux and Windows.** A matrix over `ubuntu-latest` + `windows-latest`, which
  is what actually justifies a Windows support claim — and is the only way a POSIX-only validator
  is ever caught.
- **Silent-pass becomes visible.** A validator that exits 0 without asserting anything cannot be
  told from one that verified everything. The driver records, per validator, whether it ran its
  assertions or skipped, and the summary reports skips separately from passes.
- **A validator must not read a path git does not track.** The driver fails a validator that
  reads from the repo's `.agents/` (or any other gitignored location) instead of a temp fixture.
  This is the check that would have caught the failure above before CI did.
- **Two POSIX-only prerequisites get fixed or pinned**, so "green on Windows" means something:
  `validate-lsp-real-server` probes for its server with `spawnSync("sh", ["-c", "command -v …"])`,
  which cannot work on Windows and degrades to the silent skip.

## Not In Scope

- Path-filtering by changed files. A validator's inputs span packages, so an incorrect filter
  reintroduces the exact problem this change removes (a check that does not run). Unconditional
  until the suite is too slow to run unconditionally.
- Rewriting the 151 `validate:*` definitions, or removing their build prefix.
- The ~160 scripts' individual correctness beyond what the suite already asserts.
- Adding the missing `validate:format-read-file-result` npm entry (the driver globs the directory,
  so the file runs either way; the entry is cosmetic).
- Making the 8 external-service-dependent validators (real LSP server, HTTP providers) hermetic.

## Impact

- Affected specs: `validator-ci-coverage` (new capability)
- Affected code:
  - new `scripts/run-all-validators.mjs` in each package that has validators (core first)
  - `packages/core/package.json`, `packages/{node,server,app,playground,im-bridge}/package.json`
    (`validate:all:<pkg>` entries)
  - `.github/workflows/ci.yml` (one step + the Linux/Windows matrix)
  - `packages/core/scripts/validate-lsp-real-server.mjs` (prerequisite probe, POSIX-only)
  - `packages/server/scripts/validate-agent-session-channels.mjs` (partial-skip reporting)
