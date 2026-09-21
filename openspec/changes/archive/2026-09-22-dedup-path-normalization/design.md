## Context

Two things came out of the same survey and they are solved by one change, because they meet
in the same files and the same rule.

**The rule.** `\` → `/` is spelled at 17 sites. The full expression was measured, not
counted by eye:

| Form | Sites | Example |
|---|---|---|
| `p.replace(/\\/g, "/")` | 12 | `file-icons.ts`, `lsp/shared/format.ts`, `tree-tool.ts` |
| `p.replace(/\\/g, "/").replace(/\/+$/, "")` | 5 | `workspace-path.ts`, `instruction-files.ts`, `command-analyzer.ts` |

The second form is the first composed with a trim, so there is exactly one rule, not two.
Two sites had already re-invented it as a private helper (`normalizeSeparators` in
`lsp/shared/format.ts`, `normalizeGitPath` in `workspace-git-paths.ts`), and two more
*cite* the convention in comments instead of sharing it.

**The third consumer.** The previous change fixed `parseGitStatus` and `parseDiffNumstat`.
A survey of every `git` invocation in the tree found three consumers that extract paths:

| Consumer | Command | State |
|---|---|---|
| `workspace-git-status.ts` | `git status --porcelain [-z]` | fixed |
| `workspace-diff-stats.ts` | `git diff HEAD --numstat [-z]` | fixed |
| `workspace-file-search.ts` | `git ls-files [--others]` | **broken** |

The remaining `git` calls (`workspace-git-info.ts`, `server/routes/env.ts`,
`turn-context/env-context.ts`) use the output as a boolean or verbatim text and extract no
path, so they are not consumers. That boundary is what makes the fix set complete rather
than "the ones we happened to find".

## Goals / Non-Goals

**Goals:**

- The rule `\` → `/` is written once and called from all 17 sites.
- Every consumer that extracts a path from git output reads it NUL-delimited.
- A new site that spells the rule out inline fails a check, so the count of 17 cannot grow
  back.

**Non-Goals:**

- A single path pipeline with defined stages. Callers keep their own semantics and their own
  order of operations; only the rule text is shared. A "canonical path service" would force
  decisions (whether to resolve, whether to trim) that differ legitimately per call site.
- Touching the sites' behaviour. This is a refactor plus one behaviour fix; each call site
  must produce byte-identical output to before.
- Windows-specific branches. Every case here is reachable on Linux, which is why it was
  testable — a Windows-only branch nobody can exercise is a branch that rots.

## Decisions

### D1 — The primitive lives in core, with two exports

```ts
export const toPosixPath = (p: string): string => p.replace(/\\/g, "/");
export const toPosixPathKey = (p: string): string => toPosixPath(p).replace(/\/+$/, "");
```

`toPosixPathKey` is explicitly the composed form rather than a third independently-written
expression, so the rule has one origin even though there are two entry points.

Core, not app: the 17 sites split 9 app / 8 core, so app-local placement would leave half the
duplication. `packages/app/README.md` already establishes the pattern and names this exact
failure mode for presentation helpers — *"hosts must not keep their own tool-name tables,
which drifted"* — and app already imports `defaultPath` / `CoreEnvPath` from core, so the
allowlist needs no widening.

Measured against the alternative of sharing via `CoreEnv.path.normalize`: that delegates to
`pathe`, which on a POSIX platform does not fold `\` at all (it is a legal filename byte), so
the Windows-shaped input this rule exists for would not be normalized on Linux. A literal
rule is required, not a host-dependent one.

### D2 — Only the path-extracting consumers move to NUL-delimited

`workspace-file-search` gets `-z` on both `git ls-files` and `git ls-files --others`, sharing
the record splitter from `workspace-git-paths.ts`.

The other three `git` callers stay line-oriented on purpose: `workspace-git-info` only asks
whether the tree is dirty (a non-empty string), `server/routes/env` and `env-context` embed
the status text into a prompt and never split it into paths. Converting them would be churn
with no observable effect.

### D3 — The enforcement is a validator, not a comment

A `validate-no-inline-path-normalization.mjs` in app's `scripts/` scans app + core sources for
`replace(/\\/g, "/")` outside the primitive and fails listing the offending files. The suite
runner discovers `validate-*.mjs` by glob, so it is covered without registration.

This is the decision that makes the change durable. The previous fixes were correct and did
not hold, because the next consumer was written by copying a neighbour rather than by
importing — and a comment in the neighbour is not a compile error. `workspace-git-paths.ts`
will keep its own `normalizeGitPath` only as a re-export of the primitive, so there is
nothing left to copy.

### D4 — Fix the third consumer in this change, not a follow-up

It is one call-site swap in a file this change already edits, and it shares the test file with
the primitive. A follow-up would re-open the same file and re-run the same suite for a change
whose whole point is that the third site was missed once.

## Open Question — resolved during the survey

*Does `workspace-file-search`'s broken path actually reach the UI?*

`fetchWorkspaceFileList` feeds `WorkspaceQuickOpen` (`Ctrl+P`), whose fuzzy matcher compares
against the stored string. For the non-ASCII case the stored string does not contain the file
name's characters at all (`"new dir/\344\270\255..."` vs `中文`), so the file cannot be
matched by any query — verified by running the real module. Confirmed a user-visible defect,
not a latent one.
