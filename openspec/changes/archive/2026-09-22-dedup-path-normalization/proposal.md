## Why

The workspace quick-open file list (`Ctrl+P`) silently drops files whose paths git
considers special. It is the **third** consumer of a pattern that was already fixed twice:

```
git status --porcelain      ──▶ parseGitStatus     ✱ parser fixed
git diff HEAD --numstat     ──▶ parseDiffNumstat   ✱ parser fixed
git ls-files [--others]     ──▶ splitStreamingLines ✖ still broken
```

`git ls-files` output is read line-oriented and split on newlines. Git quotes paths
containing spaces or quotes, and octal-escapes non-ASCII bytes by default
(`core.quotePath=true`). Reproduced against the real compiled module on Linux — this is not
a Windows-only defect:

| On disk | `git ls-files --others` | What quick-open stores |
|---|---|---|
| `new dir/has space.ts` | `new dir/has space.ts` | `new dir/has space.ts` ✓ |
| `new dir/quo"te.ts` | `"new dir/quo\"te.ts"` | `"new dir/quo/"te.ts"` ✖ invents a directory |
| `new dir/中文.ts` | `"new dir/\344\270\255\346\226\207.ts"` | `"new dir//344/270/255/...` ✖ **file not findable at all** |

The consequence is a file that exists but cannot be opened from the picker, because the
stored path is not the file's path. The previous change's spec already states the rule this
violates — *"the view SHALL NOT rely on line-oriented output for path extraction"* — but it
was written for two consumers and this is a third, in a different view.

The same survey counted **17 sites** that spell out one path rule(`replace(/\\/g, "/")`,
five of them also stripping trailing slashes). Two of them *cross-reference* the others in
comments instead of calling them:

```ts
// command-analyzer.ts
// matches the convention the rest of the codebase already uses for path keys
// (`workspace-diff-stats` and `FileTree` both normalise with `replace(/\\/g, "/")`)
```

When code points at another module in a comment rather than calling it, the convention is
drifting — which is what let the third git consumer be written against a stale assumption.

## What Changes

- **One path primitive, spelled once.** A single module in core owns `\`→`/` normalization
  and the trailing-separator-stripping key form. All 17 sites call it. Semantics are
  preserved per site: a site that only needed `\`→`/` still only normalizes; a site that
  needed a comparison key still strips. This is de-duplication, **not** a forced single
  pipeline — callers keep their own purpose.

- **The third git consumer stops parsing paths by hand.** `workspace-file-search` uses the
  shared NUL-delimited reader instead of splitting lines, so a quoted or non-ASCII path
  survives.

- **The rule is enforced, not just documented.** A validator fails when a module spells the
  normalization out instead of calling the primitive, so the 18th site cannot be added by
  copying the 17th. This is the mechanism the codebase already uses for presentation
  helpers, and the failure mode here is exactly the one that produced this change.

## Capabilities

### New Capabilities

- `path-normalization`: one definition of "a path written the POSIX way", the sites that
  consume it, and the requirement that git output is never parsed line-oriented.

### Modified Capabilities

- `workspace-diff-view`: its existing requirement forbids line-oriented path extraction for
  the two commands that view uses. The requirement is widened to say *which* extraction
  reads git output, so a fourth consumer cannot read it as covering only the diff view.

## Impact

- Affected code:
  - `packages/core/src/utils/posix-path.ts` (new — the primitive)
  - 17 call sites in `packages/app/src` (9) and `packages/core/src` (8)
  - `packages/app/src/utils/workspace-file-search.ts` (`fetchWorkspaceFileList`)
- Consumers of the fixed list: `packages/app/src/components/WorkspaceQuickOpen.tsx`.
- Behaviour: a file that exists becomes findable. Nothing that was listed stops being listed
  — the only paths this rejects are ones that name no file.
- Cost: none measurable. `git ls-files -z` is the same query; the primitive is one function
  call where an inline regex was.
