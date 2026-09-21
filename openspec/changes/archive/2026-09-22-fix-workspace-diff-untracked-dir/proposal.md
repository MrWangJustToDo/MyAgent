## Why

The TUI's workspace diff view renders a nameless row for every **untracked directory**, and silently omits the files inside it. New work is therefore invisible exactly where a reviewer looks for it — most visibly a fresh `openspec/changes/<name>/` directory, whose `proposal.md`, `tasks.md` and spec never appear at all.

An audit of the input space found a second, broader defect in the same parse step: git quotes paths it considers special, so any path containing a space or a quote — and any non-ASCII path, which git octal-escapes by default — is parsed into a path that does not exist. The reported case was ASCII, which is the only reason it was the one noticed.

## What Changes

- Path extraction stops relying on line-oriented git output: the status and numstat queries are read NUL-delimited (`-z`), so a path is never quoted or escaped and a path containing a newline is representable.
- Rename handling is re-derived for that format rather than patched. The current split on ` -> ` is a latent bug of the same class — a path can contain that separator.
- A single boundary rejects records that do not name a file, so no consumer is handed a directory. Today the untracked line counter is handed one and fails to read it, which is why such a row also has no `+N`.
- Rows, per-file diff lookups and per-file line counts are derived from the same parsed paths, so a row and its statistics cannot disagree about the file they describe.
- The path rules are covered by tests whose expected values come from git's actual output for such paths.

Fixed as one change because the halves are not separable in practice: expanding the status removes the current symptom, and the parse boundary is what keeps the next consumer from reintroducing either defect. Fixing only the untracked-directory case would leave special-character paths silently wrong.

## Capabilities

### New Capabilities

- `workspace-diff-view`: what the TUI workspace panel shows for uncommitted work — the changed-file set it is built from, how git's output becomes real paths, how those paths become tree rows, and the requirement that every changed file is both listed and readable.

### Modified Capabilities

None. `workspace-panel` is the playground's WebContainer/Monaco panel and does not cover the TUI diff view; this capability is introduced instead of widening that one.

## Impact

- Affected code:
  - `packages/app/src/utils/workspace-git-status.ts` (`fetchGitStatus`, `parseGitStatus`)
  - `packages/app/src/utils/workspace-diff-stats.ts` (`parseDiffNumstat`, untracked line counts)
  - `packages/app/src/utils/workspace-diff-tree.ts` (`buildDiffTree`)
  - `packages/app/src/utils/workspace-git-diff.ts` (per-file diff lookup — see design.md Open Question)
- Consumers: `packages/app/src/components/FileTree.tsx`, `WorkspaceFileMode.tsx`, `hooks/use-workspace-git.ts`.
- Behaviour: strictly more files become visible and readable. The only rows this removes are ones whose path named a directory — i.e. the defect itself.
- Cost: `--untracked-files=all` walks untracked directories. No impact in this repository (`node_modules` and `dist` are ignored); recorded as a deliberate trade-off.
