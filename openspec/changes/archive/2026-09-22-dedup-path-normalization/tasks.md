## 1. Survey before touching anything

- [x] 1.1 Enumerate every `replace(/\\/g, "/")` site in `packages/app/src` and `packages/core/src`, and record its full expression (one-step vs one-step-plus-trailing-trim) and the variable it applies to
- [x] 1.2 Enumerate every `git` invocation in the tree and classify each as path-extracting or not — the classification is what makes the fix set complete, and the previous change's set was derived from which consumers were noticed
- [x] 1.3 Reproduce the third consumer's defect against the real compiled module, on Linux, with a file whose path contains a quote and one with non-ASCII characters; record what is stored versus what is on disk
- [x] 1.4 Confirm the defect reaches the UI: the stored path must fail to match a query made of the file's own characters
- [x] 1.5 Record which of the 17 sites need the trailing-trim form, since the two forms must stay distinguishable in the primitive's API

## 2. One definition of the rule

- [x] 2.1 Add the primitive to core with both exported forms — the substitution, and the substitution composed with a trailing-separator trim
- [x] 2.2 Export both from core's public entry, and confirm `validate:core-imports` still passes with app importing them
- [x] 2.3 Replace all 17 sites, preserving each one's existing semantics — a site that only normalized must not gain a trim, and vice versa
- [x] 2.4 Replace the two private helpers already standing in for the rule (`lsp/shared/format.ts`, `workspace-git-paths.ts`) with the shared one, leaving no second definition to copy
- [x] 2.5 Confirm each touched call site produces byte-identical output for both POSIX and Windows-shaped input — this is a refactor and must not change behaviour

## 3. Fix the third consumer

- [x] 3.1 Request NUL-delimited output from `git ls-files` and `git ls-files --others --exclude-standard`, reusing the shared record splitter
- [x] 3.2 Stop normalizing inside the loop — the shared parse already yields the real path
- [x] 3.3 Confirm the fallback walk is still reached when git returns nothing, and that a non-git directory still degrades as it does today
- [x] 3.4 Do not convert the consumers that only test for change or embed the output as text; record why they are excluded

## 4. Test the rule and the consumer

- [x] 4.1 Test the primitive directly: backslash input, forward-slash input, a trailing separator, multiple trailing separators, and the empty string
- [x] 4.2 Test that the key form does not trim a separator that is not trailing
- [x] 4.3 Test the file list against a real repository containing a path with a space, a quote, and non-ASCII characters — expected values taken from git's own output, not hand-written
- [x] 4.4 Test that the non-ASCII file is matchable by a query using its own characters (the user-visible assertion, not just the stored string)
- [x] 4.5 Test that the file list is unchanged for ordinary paths
- [x] 4.6 Sabotage the halves separately and confirm each fails a distinct test naming its symptom: (a) revert the file list to line-oriented output, (b) make the key form trim a non-trailing separator
- [x] 4.7 Confirm the first failing message names the user-visible symptom, not the internal representation

## 5. Make it hold

- [x] 5.1 Add a validator that fails when a source module spells the substitution out instead of calling the primitive, naming the offending modules
- [x] 5.2 Confirm the validator is picked up by the suite runner's glob without being registered
- [x] 5.3 Confirm the validator passes against the definition module and fails when a site is re-inlined
- [x] 5.4 Confirm the primitive's own file is the only place the substitution appears

## 6. Verify

- [x] 6.1 `pnpm --filter @codent/app test`
- [x] 6.2 `pnpm --filter @codent/app validate:render-smoke`
- [x] 6.3 `pnpm --filter @codent/app validate:core-imports`
- [x] 6.4 Full validator suite: `node scripts/run-all-validators.mjs`
- [x] 6.5 `pnpm lint` and `pnpm typecheck`
- [x] 6.6 Manual confirmation in the TUI: a file whose path contains a space, a quote, or non-ASCII characters is listed in `Ctrl+P` and opens
- [x] 6.7 Confirm the count of inline substitutions in the tree is one, by re-running the §1.1 search
