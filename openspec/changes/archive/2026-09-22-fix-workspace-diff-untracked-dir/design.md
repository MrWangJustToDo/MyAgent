## Context

The diff view is built by pipelining git output into three consumers that never share a
parser:

```
git status --porcelain ──▶ parseGitStatus ──┬─▶ buildDiffTreeItems   (rows)
                                            ├─▶ fetchWorkspaceFileDiff  (per-file content)
                                            └─▶ fetchWorkspaceDiffStats (per-file +N/−M)
```

An audit of that input space (temp repo, real compiled modules from `packages/app/dist/utils/`)
found shapes the current parsing does not handle. This is the survey that decides the scope;
each row is an observed output, not a hypothesis:

| Input | Observed |
|---|---|
| untracked directory `?? brand-new/` | `type: "file"` row, `name: ""`, path ends `/` |
| nested untracked (`brand-new/sub/deep/file.ts`) | file not listed at all |
| `?? "src/has space.ts"` | row name carries a trailing quote (`has space.ts"`) |
| `?? "src/quo\"te.ts"` | split into a bogus directory `"src/quo` + file `"te.ts"` |
| tracked file modified next to untracked files | listed correctly |
| `M` / `D` / staged rename | listed correctly |
| untracked file inside a tracked directory | listed correctly |

Two of those — the untracked directory and the quoted path — are separate defects in the same
parse step, and the quoting one is broader: it hits any path git considers special (space,
quote, and non-ASCII when `core.quotePath` is true, which is the default). The reason the
untracked-directory shape was reported and the quoting one was not is simply that the reported
case (`openspec/changes/<name>/…`) is ASCII.

No path currently guarantees the three consumers receive a path that names a file, and only
`buildDiffTreeItems` would even notice.

## Goals / Non-Goals

**Goals:**

- Every changed file appears as a row with a path that resolves to a real file.
- One shared boundary guarantees that, so a consumer cannot be handed a directory.
- The untracked-directory case is visible in the panel — the observed failure.

**Non-Goals:**

- Reworking the diff view's layout, ordering, keyboard navigation, or reveal behaviour.
- Turning the panel into a git client (no staging, branching, or history operations).
- `.gitignore` semantics — unanchored `dist` is intentional, and those paths stay hidden.
- Making the panel list files git itself does not report.

## Decisions

### D1: Ask git for NUL-delimited output, rather than unquoting C-style escapes

**Choice:** request `-z` output and split the records on NUL.

**Alternative considered — implement git's C-style unquote.** Rejected: the quoting is only
entered for special paths and encodes `\n`, `\t`, `\\`, `\"` and octal escapes for non-ASCII.
Reimplementing it is a small, fiddly format where a mistake is silent (the row renders, the
path is just wrong), which is precisely the failure being fixed. `-z` is also unambiguous for a
path containing a newline, which a line-oriented parse cannot represent at all.

**Consequence:** `parseGitStatus` splits on NUL rather than newline. That changes the rename
handling: in `-z` output a rename is two records (`R` then the new path), so the current
`^(.*) -> (.*)$` split is replaced rather than patched. That split was already a latent bug of
the same class — `(.*)` is greedy, so a path containing ` -> ` or spaces on either side could
be cut in the wrong place — and it must not survive the change.

### D2: The boundary sits at the parse step, not at each consumer

**Choice:** the parse step emits only real file paths, so no consumer can receive a directory.

**Alternatives considered:**

- *Filter in `buildDiffTree` only.* Rejected: leaves `fetchWorkspaceFileDiff` and the untracked
  line counter exposed. The audit already showed the counter is handed the directory path and
  fails to read it, so the row loses its `+N`.
- *Filter in each of the three consumers.* Rejected: three places to keep in sync, and the
  next consumer added would reintroduce it.

### D3: The row set and the file set are the same set

**Choice:** the rows, the untracked line counting, and the per-file diff lookup are all derived
from the one parsed path set.

This is what makes the fix verifiable: if the panel shows a row, the same path must be readable.
The audit could only be trustworthy because it compared the rendered rows against what git
actually reported.

## Risks / Trade-offs

- **`--untracked-files=all` cost** in a repository with a large unignored tree. Not a concern
  here (`node_modules` and `dist` are ignored), and it is the only way untracked files are
  reported individually. Recorded so the trade-off is deliberate rather than discovered later.
- **The parse contract changes shape** (`-z`, records not lines). Mitigation: the rename path is
  re-derived and covered by a test, because it is the one place the two formats differ
  semantically rather than cosmetically.
- **A quoted path that used to render a wrong row now renders no row** if parsing still fails
  for an unanticipated shape. Acceptable: a missing row is visible and reportable, a row with a
  wrong path is silent.

## Migration Plan

No persisted state, user setting, or stored path changes — the input is re-read from git each
time the view is built. Reverting is confined to `packages/app/src/utils/`.

## Open Questions

- Whether `fetchWorkspaceFileDiff` can currently be reached with a directory-shaped path. If it
  can, it is a fourth consumer of the same defect and the boundary in D2 must cover it; if it
  cannot, that is worth a line in the code so the next reader does not have to re-derive it.
