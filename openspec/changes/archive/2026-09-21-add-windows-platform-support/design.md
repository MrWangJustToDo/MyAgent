## Context

`packages/node/src/environment/shell.ts` already resolves a shell per platform: `win32` detection
(`:35`), Git Bash discovery across three candidate paths (`:68-85`), `powershell.exe` with argv
`["-Command"]` (`:58`), and `-l -c` reserved for non-Windows or bash paths (`:40`, `:49`). A
second, separate mechanism decides process-tree cleanup (`taskkill /T /F` on Windows, `:157-170`).

So the intended design was already "adapt to the platform shell". The tools broke that contract by
handing the selected shell a bash command string:

```
packages/core/src/agent/tools/glob-tool.ts:44   set -o pipefail; fd … 2>/dev/null | head -n N
packages/core/src/agent/tools/glob-tool.ts:71   find … 2>/dev/null
packages/core/src/agent/tools/glob-tool.ts:84   set -o pipefail; find … | head -n N
packages/core/src/agent/tools/grep-tool.ts:132  set -o pipefail; rg … 2>/dev/null | head -n N
packages/core/src/agent/tools/grep-tool.ts:193  set -o pipefail; … 2>/dev/null | head -n N
packages/core/src/agent/tools/tree-tool.ts:86   treeCommand + " 2>/dev/null"
packages/core/src/agent/skills/skill-loader.ts:88  find … -name SKILL.md … 2>/dev/null
packages/node/src/index.ts:171                    command -v … >/dev/null 2>&1
```

`set -o pipefail` is not a valid PowerShell option, so on Windows these are parse errors, not
degraded results.

The `CoreEnv` surface available to tools is worth stating precisely, because it constrains the fix:

| Member | Signature | Executes via |
|---|---|---|
| `runCommand` | `(command: string, opts?) => CommandResult` | platform shell, `-c`/`-Command` (sandbox-aware) |
| `exec` | `(command: string, opts?) => CoreEnvExecResult` | `node:child_process.exec` → `shell: true` |
| `commandExists?` | `(command: string) => boolean` | `command -v` probe |

Neither `runCommand` nor `exec` accepts an argv array — both are string shells. There is therefore
no way to launch a binary without a shell string today, which is why the bash-isms are structural
rather than incidental.

Two reference implementations converged on avoiding this entirely. opencode spawns ripgrep as an
argv array (`["--no-config", "--json", "--hidden", "--no-messages", "--glob=!**/.git/**", "--",
pattern, path]`) and truncates in-process; gemini-cli does the same and pairs it with
`escapeShellArg(arg, shell)` carrying an explicit per-shell branch. Neither injects `pipefail` or
`| head -n`, and neither has a Unix→PowerShell command translation layer — both steer the model
with per-shell prompt text instead.

The second defect is independent. `command-safety/command-parser.ts:86` calls
`parseWithLanguage("command:bash", …)` unconditionally. `command-approval-policy.ts:75-81` grants
the default auto-allow only when `report.ok` is true; `:89-91` returns `SUBAGENT_DENY_MESSAGE` for
subagents on anything that is not auto-allowed. Parse failure therefore denies every subagent
`run_command` — and on Windows the bash grammar matches nothing. Only `tree-sitter-bash.wasm` is
bundled (`packages/node/node_modules/tree-sitter-wasms/out/`), so there is no PowerShell grammar
to switch to.

### Constraints

- Development happens on Linux. No Windows shell, no Windows runner, no way to execute
  `powershell.exe`. Every platform-specific behaviour in this change is **unverifiable in this
  environment** and must be labelled as such.
- `run_command` legitimately accepts shell syntax — it is the model-facing escape hatch and MUST
  keep its string contract.
- `CoreEnv` is the only abstraction boundary; `@codent/core` cannot import Node APIs, and the HTTP
  server exposes the same surface remotely.

## Goals / Non-Goals

**Goals:**

- Remove every bash-ism the tool layer generates, by launching search binaries without a shell.
- Make binary availability deterministic rather than inferred from a Unix exit code.
- Make command safety aware of the shell it is analysing, and stop the failure mode where an
  unavailable grammar silently disables a subagent's ability to run commands.
- Fix the peripheral path conversions that assume POSIX (LSP file URIs, workspace-relative paths,
  sandbox deny globs).

**Non-Goals:**

- Windows console encoding and CRLF normalization (L5). Both reference projects leave this
  incomplete — gemini-cli closed its CP936 UTF-8 bug (#27142) as `not_planned` — so there is no
  implementation to converge on.
- Bundling or downloading ripgrep. opencode downloads it at runtime, gemini-cli vendors a binary
  into the repo; both add a supply-chain and platform-matrix burden we do not need to take on now.
  We keep resolving from `PATH`.
- Adding a PowerShell tree-sitter grammar or a host PowerShell parser subprocess. gemini-cli drives
  `[System.Management.Automation.Language.Parser]::ParseInput` through a real PowerShell process;
  that requires Windows to work at all and cannot be tested here.
- Per-shell prompt guidance steering the model away from `&&` (opencode ships four profiles). Real
  gap, deliberately deferred — see Open Questions.

## Decisions

### D1: Add an argv-based execution primitive to `CoreEnv`

**Decision.** Add `execFile(file: string, args: string[], options?) => CoreEnvExecResult` to
`CoreEnv`, implemented in Node via `node:child_process.execFile` and mirrored over HTTP at a new
`/api/command/exec-file` route. `exec` and `runCommand` keep their string contracts.

**Why not reuse `exec`.** `exec(command: string)` forwards to `child_process.exec`, which spawns
`shell: true`; passing an argv array through it would still be a shell string one layer down. It is
also the remote wire contract, so widening its signature changes the server API.

**Why not `runCommand`.** It is sandbox-aware and shell-based by design, and is what `run_command`
uses. Reusing it for internal search plumbing cannot remove the shell.

**Alternative considered:** build the command string but escape per platform. Rejected — it keeps
every Unix-ism and only changes who is responsible for them; neither reference project does this.

### D2: Truncate in-process, not with `| head -n N`

**Decision.** Capture the child's stdout, then truncate to `fetchCount` entries before parsing. A
byte ceiling guards against pathological output, reusing `maybeCacheOutput`'s existing spill-to-file
behaviour for large results.

**Consequence.** `fetchCount` is `offset + limit + 1`; today the shell truncates lines before the
tool ever sees them, so a search over a huge tree never materialises the full list. After this
change the full result is captured first, which is more memory for very large trees. This is the
same trade-off both reference projects accept (opencode caps a rolling byte window and spills to a
file). Mitigation is the byte ceiling, and the `glob`/`grep` validate scripts must be extended to
assert truncation still happens at the same boundary.

### D3: Prefer a deterministic binary probe over exit-code sniffing

**Decision.** Resolve search binaries with `commandExists` **before** running them, and keep an
exit-code heuristic only as a fallback for hosts that do not implement `commandExists`. Replace the
`COMMAND_NOT_FOUND = 127` constant (`search-command.ts:10`) with a platform-aware predicate.

**Why.** 127 is POSIX-shell-only for "command not found": cmd.exe reports 9009, PowerShell reports
1 (and 1 is also ripgrep's "no matches", so it cannot be disambiguated by code alone). Probing first
is exact on every platform and removes the ambiguity entirely. This mirrors what the LSP extension
already does — `commandExists` exists precisely to enable probe-before-spawn (`env.ts:276-282`).

**`commandExists` itself must change.** The `command -v` probe at `packages/node/src/index.ts:171`
is POSIX-only. It must resolve through `resolveCommandPath` and, when that is inconclusive, scan
`PATH` honouring `PATHEXT` on Windows rather than shelling out.

### D4: Command analysis becomes shell-aware, and degrades loudly

**Decision.** `command-safety` learns which shell the command will run under and selects a grammar
accordingly. When no grammar exists for that shell, the layer MUST:

1. still classify commands named in its built-in command tables (so known read-only commands keep
   working), and
2. report the gap explicitly, instead of emitting an approval-required denial that implies a user
   prompt would unblock it.

**Why this shape.** The dangerous property today is not that analysis is conservative — it is that
an unavailable grammar is indistinguishable from "the model asked for something suspicious". A user
cannot act on `SUBAGENT_DENY_MESSAGE`, and the model cannot either, so the real cause (no grammar
for this shell) is invisible. Making the gaps explicit is what turns a silent capability loss into a
reportable condition, consistent with this project's existing rule that missing optional capability
must warn rather than fail silently.

**How the shell is determined.** Platform alone is insufficient: a Windows host with Git Bash found
at `C:\Program Files\Git\bin\bash.exe` (`shell.ts:70`) genuinely has bash, so `win32` must not
imply "no bash grammar". `CoreEnv` therefore gains an optional shell-kind accessor so the answer
comes from the same resolution that actually picks the shell.

**Safety invariant.** Unparsed MUST NOT mean auto-allowed. The built-in-table fallback in (1) may
grant read-only status only for commands the tables already know; anything unrecognised stays on the
conservative path.

**Alternative considered:** bundle a PowerShell grammar and parse it for real. Rejected for now —
it adds a second grammar to the tarball and to `validate:self-contained`'s assertions, and a
grammar-only fix would still not cover `cmd.exe`, so the "unavailable grammar" path would remain
reachable and untested. It is the right long-term answer and is captured as an Open Question.

### D5: Widen the command tables rather than special-casing Windows

**Decision.** Add Windows-native commands to the arity table and file-command sets (`dir`, `type`,
`copy`, `del`, `move`, `where`, `findstr`, …) as additional entries beside the POSIX ones, and make
`where` the Windows counterpart of `which`.

**Why.** `command-arity.ts:17-67` and `command-analyzer.ts:82-98` are lookup tables, not branches.
Adding entries is additive: existing POSIX behaviour is untouched, and `errorerase`/`md`/`move`
already appear in `WRITE_OPS` (`:93-98`) with the comment "cmd.exe variants (kept for parity with
opencode; not primary on bash hosts)" — the precedent for platform-neutral tables already exists.

### D6: Fix path conversion at the three affected boundaries

- **LSP file URIs** (`agent/lsp/shared/format.ts:5-15`): `uriToPath` returns
  `decodeURIComponent(url.pathname)`, so `file:///C:/foo` becomes `/C:/foo`. Strip the leading
  separator when the remainder matches a drive-letter path. `pathToFileUri` already normalizes
  `\` → `/` correctly (`:47-52`), so only the reverse direction is wrong.
- **Workspace-relative paths** (`app/src/utils/workspace-path.ts:11-15`): stop assuming the root
  ends with `/`. Normalize the root before prefix matching so a Windows root does not silently
  return the absolute path unchanged.
- **Sandbox deny globs** (`node/src/environment/os-sandbox.ts:70`): `~/.ssh` and friends are
  resolved from a literal tilde. Resolve `~` through the host home directory instead. Note this is
  latent correctness rather than a Windows bug — `SandboxManager.isSupportedPlatform()` already
  gates the sandbox off on Windows (`:81-83`).

## Risks / Trade-offs

- **Nothing here can be verified on Windows in this environment.** → Every platform-specific
  requirement must be marked unconfirmed, and the change is not complete until it has run on a
  Windows host. Adding a Windows CI job is the durable answer and is listed as a task, because a
  platform path with no runner will rot — opencode's Windows shell tests are gated behind
  `if (process.platform === "win32")` and therefore never execute in their Linux/macOS CI.
- **Adding `execFile` touches `CoreEnv` and the HTTP server.** A remote host must implement the new
  route or tools would silently fall back. → Implement the Node adapter and the server route in the
  same change, and feature-detect: when `execFile` is absent, fall back to the shell-string path so
  a remote host on an older server does not lose `glob`/`grep` entirely.
- **Truncation moves from the shell into the tool (D2).** Peak memory rises for very large
  result sets, and the truncation boundary is now ours to get right. → Byte ceiling plus explicit
  assertions in the glob/grep validate scripts.
- **The read-only fallback in D4 (1) is a new safety-relevant path.** A table-driven classifier that
  grants auto-allow is exactly the kind of thing that is wrong in the permissive direction. → It may
  only ever grant read-only status for commands already present in the built-in sets, it must never
  grant write or external-directory status, and any command not in the tables keeps the
  conservative outcome. This invariant needs a validate script, not just review.
- **`where` and `which` differ in exit codes and output format.** → `commandExists` returns a
  boolean, so format differences stay internal; tasks must cover the "multiple matches" and
  "PATHEXT variants (.cmd/.exe/.bat)" cases.

## Migration Plan

1. Add `execFile` (and the shell-kind accessor) to `CoreEnv`, the Node adapter, and the server
   route, behind feature detection so older remote hosts keep working through the existing
   shell-string path.
2. Move `glob`, `grep`, `tree`, and `skill-loader` to argv spawning with in-process truncation,
   one tool at a time, running the search validate scripts after each.
3. Replace the `commandExists` probe and the `127` heuristic.
4. Make command analysis shell-aware, add the loud degradation path and the widened tables.
5. Fix the three path boundaries (D6).

**Rollback.** Each step is independently revertible; steps 2-3 remove shell strings but keep the
string-based path behind feature detection, so reverting one tool restores its previous behaviour
without touching `CoreEnv`.

## Open Questions

- **Should we ship per-shell prompt guidance for shell operators?** opencode ships four profiles
  and tells the model that `&&` is unavailable in Windows PowerShell 5.1 (`;`, or
  `if ($?) { … }`). Without it, a model that writes `a && b` fails on Windows even after this
  change. This is arguably the highest-value remaining item and is not covered by L1–L4.
- **Should a PowerShell tree-sitter grammar be bundled**, matching opencode's two-grammar design?
  It would let D4 parse PowerShell for real instead of degrading, at the cost of a larger tarball
  and new `validate:self-contained` assertions.
- **Is `execFile` the right abstraction name on `CoreEnv`**, given `exec` already exists and the
  two differ only in argv-vs-string? A single `exec(command, { argv })` overload would be tidier at
  the call site but is a breaking change to the remote wire contract.
- **Where should the Windows CI job live**, and does the project want one before or after this
  change lands? Landing first means the platform paths are unverified on merge.
