## 1. Survey the input space before writing the fix

- [x] 1.1 Build a throwaway git repo covering the matrix, and run the real compiled modules against it (the modules are not exported from the package, so drive `packages/app/dist/utils/*.mjs` directly)
- [x] 1.2 Confirm each row of the matrix and record the observed output — at minimum: untracked directory, nested untracked directory, untracked file inside a tracked directory, modified, deleted, staged rename, and paths containing a space, a quote, and non-ASCII characters
- [x] 1.3 Confirm the escaping is real rather than theoretical: `git status --porcelain` quotes special paths and octal-escapes non-ASCII, and `git diff HEAD --numstat` does the same — check both, since they are separate consumers
- [x] 1.4 Establish which consumers receive the raw git output: `parseGitStatus`, `parseDiffNumstat`, and the rename split in the status parser. Confirm whether `fetchWorkspaceFileDiff` can be reached with a directory-shaped path (design.md Open Question)
- [x] 1.5 Record the survey result — it is the evidence the rest of this task list rests on, and it is what the tests in §4 should be derived from

## 2. Replace line-oriented parsing at the source

- [x] 2.1 Request NUL-delimited output from the status query (`-z`) and split records on NUL, so no path arrives quoted or escaped
- [x] 2.2 Re-derive rename handling for the record format: `-z` emits the rename as two records, so the current greedy `^(.*) -> (.*)$` split must be replaced, not patched — it could already cut a path containing ` -> ` or spaces in the wrong place
- [x] 2.3 Apply the same NUL-delimited approach to the numstat parse (`parseDiffNumstat`), including its rename notation, so the statistic key matches the row key for special paths
- [x] 2.4 Confirm a non-git directory still degrades to the empty map as it does today

## 3. Enforce the boundary in one place

- [x] 3.1 Add one shared predicate for "this path names a file" (non-empty, no trailing `/`) and apply it where records become paths, so no consumer can receive a directory
- [x] 3.2 Guard the untracked line counter so it does not attempt to read a directory, returning no stat rather than a failed read
- [x] 3.3 Keep the tree builder from turning a directory-shaped path into a `file` row even if one should reach it, since the builder is the last place a nameless row can be created
- [x] 3.4 Record in the code why the boundary exists at the parse step rather than in each consumer, so a future consumer does not re-add the check locally

## 4. Test the path rules

- [x] 4.1 Test that a directory-shaped record yields no row, and that no row has an empty name
- [x] 4.2 Test that an untracked directory's files each appear as their own row (the regression: they previously appeared not at all)
- [x] 4.3 Test that a path containing a space, a quote, and non-ASCII characters parses to the real path, for both the status parse and the numstat parse
- [x] 4.4 Test that a rename is split correctly, including when either side contains a space
- [x] 4.5 Test that a modified tracked file is still listed alongside untracked files
- [x] 4.6 Take the expected strings from git's own output for these paths rather than hand-writing them, so the tests pin the real escape behaviour
- [x] 4.7 Sabotage the halves separately and confirm each fails a distinct test naming the symptom: (a) revert to line-oriented parsing, (b) remove the file-path predicate, (c) leave numstat line-oriented while the status parse is fixed

## 5. Verify

- [x] 5.1 `pnpm --filter @codent/app test`
- [x] 5.2 `pnpm --filter @codent/app validate:render-smoke` (the diff view renders)
- [x] 5.3 Full validator suite: `node scripts/run-all-validators.mjs`
- [x] 5.4 `pnpm lint` and `pnpm typecheck`
- [x] 5.5 Manual confirmation in the TUI: with a wholly untracked directory present, every file inside it is listed and openable, and no nameless row appears
- [x] 5.6 Manual confirmation in the TUI: a changed file whose path contains a space or non-ASCII characters is listed, opens, and shows its counts
