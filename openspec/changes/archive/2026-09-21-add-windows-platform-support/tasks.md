## 1. Execution primitive (D1)

- [x] 1.1 Add `execFile(file, args, options?) => CoreEnvExecResult` to the `CoreEnv` interface in
      `packages/core/src/env.ts`, documented as the shell-free counterpart of `exec`
- [x] 1.2 Add an optional shell-kind accessor to `CoreEnv` so command safety can learn which shell
      was actually resolved, rather than inferring it from the platform
- [x] 1.3 Implement `execFile` in the Node adapter (`packages/node/src/index.ts`) via
      `node:child_process.execFile`, honouring `cwd`, `env`, `timeout`, and abort
- [x] 1.4 Return the same `{ stdout, stderr, code }` shape as `exec`, normalizing a spawn error
      (binary missing) into a non-zero `code` rather than a thrown error
- [x] 1.5 Expose `execFile` over HTTP in `packages/server/src/routes/command.ts` as
      `/api/command/exec-file`
- [x] 1.6 Wire the remote client (`packages/server/src/client*`) so a remote environment provides
      `execFile` over RPC
- [x] 1.7 Feature-detect: tools MUST fall back to the existing shell-string path when `execFile` is
      absent, so a remote host on an older server keeps `glob`/`grep` working
- [x] 1.8 Resolve the search binary through `resolveCommandPath` before spawning so a project-local
      install is used, keeping parity with the LSP spawn path

## 2. Migrate search tools off shell strings (L1, D2)

- [x] 2.1 Rework `glob-tool.ts`: replace `buildFdCommand` / `buildFindCommand` string builders with
      argv builders, dropping `set -o pipefail`, `2>/dev/null`, `| head -n`, and the quoted-pattern
      interpolation (`glob-tool.ts:34`, `:44`, `:71`, `:73`, `:84`)
- [x] 2.2 Rework `grep-tool.ts` the same way (`:132`, `:193`)
- [x] 2.3 Rework `tree-tool.ts` so stderr suppression is a spawn option, not `" 2>/dev/null"` (`:86`)
- [x] 2.4 Rework `skill-loader.ts` so `SKILL.md` discovery no longer shells out to `find` (`:88`)
- [x] 2.5 Implement in-process truncation to `fetchCount` entries in a shared helper, replacing the
      `| head -n` boundary
- [x] 2.6 Add a byte ceiling for captured output, routing oversized results through
      `maybeCacheOutput` instead of inlining them
- [x] 2.7 Verify the paginated page is byte-identical to the pre-change output for a fixed
      repository tree and pattern set
- [x] 2.8 Add an automated check that no tool body emits `set -o pipefail`, `2>/dev/null`,
      `| head -n`, or an equivalent shell-ism (guard against regression, as a `validate:*` script)

## 3. Binary discovery and exit-code semantics (L2, D3)

- [x] 3.1 Rewrite `commandExists` in `packages/node/src/index.ts:167-177` to avoid `command -v`,
      resolving through PATH (honouring `PATHEXT` on Windows) while keeping the project-local
      short-circuit
- [x] 3.2 Cover Windows extension resolution in the probe: `.exe`, `.cmd`, `.bat`, and the
      multiple-match case
- [x] 3.3 Replace `COMMAND_NOT_FOUND = 127` in `search-command.ts:10` with a platform-aware
      missing-binary predicate, keeping the "exit 1 = no matches" rule intact
- [x] 3.4 Probe before running: prefer `commandExists` for candidate selection, using exit codes
      only as the fallback for hosts without it
- [x] 3.5 Confirm an empty successful search does not trigger the fallback path

## 4. Command safety portability (L3, D4, D5)

- [x] 4.1 Thread the resolved shell kind into `parseCommandTree`
      (`command-safety/command-parser.ts:86`) so the grammar is chosen per shell instead of always
      `command:bash`
- [x] 4.2 Add an explicit "grammar unavailable for this shell" signal to `CommandSafetyReport`
      alongside the existing `ok` flag
- [x] 4.3 Implement the table-driven fallback so known read-only commands stay classifiable when no
      grammar exists, granting read-only status only for commands already in the built-in sets
- [x] 4.4 FAIL-SAFE INVARIANT: assert that an unavailable grammar can never grant write or
      external-directory status, and never auto-allows an unrecognised command
- [x] 4.5 Make the degradation visible (a `grammarUnavailable` flag on the report that hosts can
      surface through their own observability; a one-time `console.warn` was tried first and
      removed — see §10)
      rather than only changing the approval outcome
- [x] 4.6 Fix the subagent consequence: a parse gap MUST NOT surface as
      `SUBAGENT_DENY_MESSAGE` for a command the tables classify as read-only
      (`command-approval-policy.ts:75-91`)
- [x] 4.7 Add Windows-native entries to `command-arity.ts` (`dir`, `type`, `where`, `findstr`, …),
      treating `where` as the platform counterpart of `which`
- [x] 4.8 Add the corresponding read-only / write classifications in `command-analyzer.ts`, keeping
      tables additive so POSIX entries are untouched
- [x] 4.9 Add a `validate:*` script asserting POSIX classification is unchanged after the Windows
      entries land, plus the section-4.4 invariant

## 5. Peripheral path handling (L4, D6)

- [x] 5.1 Fix `uriToPath` in `agent/lsp/shared/format.ts:5-15` so `file:///C:/foo` does not become
      `/C:/foo`; verify the round-trip against `pathToFileUri`
- [x] 5.2 Fix `workspace-path.ts:11-15` so the relative-path computation does not assume a
      `/`-terminated root, and a path inside the workspace is never returned absolute
- [x] 5.3 Resolve `~` through the home directory for `os-sandbox.ts:70` deny rules instead of
      emitting literal `~/.ssh` paths
- [x] 5.4 Add `validate:*` coverage for each of the three conversions, using Windows-shaped inputs
      (`C:\…`, `file:///C:/…`, and a `/`-less root) so the assertions run on Linux

## 6. Verification and close-out

- [x] 6.1 Run the full matrix: `pnpm build`, `pnpm lint`, `pnpm typecheck`, the core `validate:*`
      scripts, and `pnpm --filter @codent/app test`
- [x] 6.2 Run `validate:self-contained` and `validate:runtime-specifiers` in `packages/codent` if the
      server route change affects the bundled release host
- [ ] 6.3 Add a Windows CI job (GitHub Actions `windows-latest`) running build + typecheck + the new
      portability validators, so the platform paths have a runner
- [x] 6.4 Record explicitly which requirements remain UNCONFIRMED: every behaviour that depends on a
      real PowerShell or cmd.exe cannot be validated in a Linux environment
- [ ] 6.5 Confirm the whole change on a Windows host before marking any platform-specific
      requirement as done; if no host is available, keep the change open rather than archiving it

## 7. Unconfirmed on Windows (task 6.4)

Everything below was verified only by typecheck, build, and the new `validate:*` scripts on
**Linux**. None of it has executed under a real PowerShell or cmd.exe, and no Windows runner
exists in CI yet (task 6.3). Treat these as UNCONFIRMED until task 6.5 runs:

- **argv execution against PowerShell/cmd** — that `execFile` reaches `powershell.exe`/`cmd.exe`
  without a shell string, and that stdout/stderr arrive intact.
- **`setup -o pipefail` removal under a real non-POSIX shell** — the premise of the change was
  reproduced analytically (PowerShell has no such option) but never observed. The *presence* of
  the constructs is asserted by `validate:tool-shell-portability`; their behaviour on Windows is not.
- **Windows `PATH`/`PATHEXT` resolution against a real filesystem** — asserted with an injected
  `exists` and explicit `isWindows`, which is what makes it testable on Linux, but a real
  `where.exe`/`.cmd`/`.bat` shim layout has not been traversed.
- **cmd.exe exit code 9009** and PowerShell's exit-1-for-missing-binary collisions — the predicate
  is asserted by unit test, the codes themselves are taken from documentation.
- **Shell classification of a real resolved shell** — `getShellInfo()` is asserted to classify
  strings, but no host has actually reported `powershell.exe` through CoreEnv at runtime.
- **The fallback's classification of real Windows command lines** — the tokenizer and tables are
  asserted on Linux against representative strings. A genuine PowerShell pipeline (cmdlets,
  `|` object flow, here-strings) has not been parsed, and the tables were written from the
  documented cmd.exe command set rather than observed behaviour.
- **`npm`-style `.cmd` shims being spawnable via `execFile`** — Node's `execFile` cannot execute
  a `.cmd` without a shell on Windows (it needs `cmd.exe /c`, or the `shell` option). The search
  tools only spawn `rg`/`fd`/`find`/`tree`/`grep`, which are `.exe`, so this does not affect the
  migrated paths — but a `.cmd` shim would need the shell and is NOT covered.
- **Encoding / CRLF** — explicitly out of scope (L5), and therefore also unverified.

## 8. Post-review corrections (code review follow-up)

A review of the first implementation found that two of the migrated behaviours had *regressed on
Linux* — the platform every check here runs on — while all of the scripts above stayed green. The
review items were reproduced first, then fixed. Two reported items were disproved and are
recorded as such so the reasoning is not re-litigated.

### Regression: search tools returned empty when `rg`/`fd` were absent

The argv migration deleted the old rule "non-zero exit + empty stdout ⇒ try the next candidate"
and replaced it with a `missing` flag that never fired:

| Layer | Problem |
|-------|---------|
| `packages/node/src/index.ts` | Node reports a failed spawn as `err.code === "ENOENT"` — a *string*. Coercing non-numeric codes to `1` erased the only signal that said "binary not found". |
| `search-command.ts` | The detector matched neither `1` nor the text `ENOENT`, so a spawn failure was read as "ran successfully, found nothing". |
| `glob-tool` / `grep-tool` | `stdout !== undefined` returned early (an empty string is not `undefined`), so the fallback was unreachable. |

Fixed by normalising the spawn error to a dedicated exit code in the adapter, broadening the
detector (narrowly — only messages that name the executable), and guarding a `null` `execFile`
result, which the remote client returns for an older server and which crashed with a `TypeError`.
Asserted by the new `validate:search-fallback`, which simulates the absent binary so it runs on any
machine. That check was written and observed **failing** before the fix.

### Fail-open: command substitution was not classified

`echo "$(rm -rf x)"` was granted read-only status. The tokenizer never split `$(...)` or
backticks, so only `echo` was seen, `echo` is read-only, and the substitution body — a real
command — was never classified. The tokenizer's own doc comment claimed under-splitting was safe
because read-only requires *every* command to be read-only; that was wrong, because a missed
command is not a vote against, it is absent from the vote. The comment is corrected and
substitution bodies are now emitted as their own commands, in quoted and bare forms, recursively.
An `unknown`-shell parse that does not surface a substitution it was given is no longer trusted,
even when `bash` is reported.

### Fallback redirection was attributed to the whole string

The fallback scanned the entire command for `>`, which misreads PowerShell comparison operators
and attributes a redirection to a read-only command that did not write. It now scans per segment.

### Regression: the `tree` fallback pruned the subtrees it was searching

Replacing `find <path> -maxdepth <n>` with `walkTree()` removed the GNU-only `-maxdepth` dependency,
but moved four filters into one recursive loop — and the `pattern` / `dirsOnly` filters were applied
with `continue` *before* the recursive call, so a directory whose own name did not match was never
descended into. `tree -P '*.ts'` therefore returned an empty tree, because no directory is named
`*.ts`; the previous `find -name '*.ts'` descended unconditionally and matched at any depth.

The split is now explicit: hidden and ignored entries are *pruning* filters (they take their subtree
with them, as `find -not -path` does), while `pattern` and `dirsOnly` are *report* filters that
decide only whether an entry is listed.

This is the second behaviour in this change to be callable but uncovered — `walkTree` is not a search
binary, so no shell-ism scan inspects it and nothing imported it. It is now covered by
`validate:tree-walk` (depth semantics, both filter kinds, empty and unreadable directories,
determinism, and a Windows-shaped root through the injected separator), written to fail against the
broken version before the fix landed.

### Disproved review items

- `command-safety-notice.ts` was reported as missing a `.js` extension on its type import. It
  already had it.
- The warn-once path was reported as emitting a duplicate warning from its two call sites. It does
  not — the second call returns `null`. The two sites were still consolidated into one
  non-throwing helper, because the two-step pair was easy to get wrong and a missed warning is
  invisible by construction.

### Review item that was itself wrong

The review proposed returning the input separator from `workspaceRelativePath` so it composes with
`Environment.path`. Measuring the consumers showed the opposite: every key is compared against
values normalised to `/` (`workspace-diff-stats` normalises at two places, and the `FileTree`
`diffStats` lookup has no fallback), so keeping `/` is required and the proposal would have broken
that lookup on Windows.

## 9. Third review: probe false-negative and dead fields

A third review found one real defect (reproduced first, then fixed) and closed out the two dead
fields the project's field discipline had flagged.

### Regression: the capability probe disabled `execFile` for every remote client

`probeExecFileSupport` sent `{ file: "" }` to `/api/command/exec-file`. On a real current server
that travelled the whole route: the zod schema accepted the empty string, the route called
`coreEnv.execFile("")`, Node threw `ERR_INVALID_ARG_VALUE` synchronously, and `handleCommandError`
turned it into a `500` — which the probe reads as "not unsupported", so `execFile` stayed
`undefined` and every remote client silently lost argv execution (re-creating the bash-ism bug
this change exists to fix, on exactly the platforms it targets). The bundled validator could not
see it: its fake "supported" server answered the probe with a canned `200` and never ran the real
route.

Fixed by probing with a namespaced binary name that cannot exist
(`codent-probe-exec-file-absent`). A server with the route resolves it through its env and
answers `200` with `missing: true` — support confirmed through the real path; a server without
the route still 404s. Asserted by a new end-to-end section in `validate:remote-exec-degradation`
that mounts the actual Hono `app` (CORS + `/api` prefix, as production does) over
`@hono/node-server` with a real `@codent/node` env, and asserts both the probe verdict and a real
`/bin/echo` execution. The old probe was re-run against the real app to confirm it produced the
misleading `500` before the fix.

### Dead fields removed

Per the project's rule that a field is consumed or deleted:

- `CoreEnvExecResult.timedOut` had zero consumers; `killed` already carries the signal the
  validator asserted on. Removed from the interface, from `describeProcessFailure` (whose
  `options` parameter existed only to compute it), and from the
  `validate:exec-file-status` assertion.
- `tree-tool`'s internal `exitCode` was assigned on both paths but read nowhere after the
  non-zero-exit fallback branch was removed. Removed from the result shape; a comment records
  why the fallback keys on `missing`/`killed` only.

## 10. Degradation notice removed (was §8's consolidation)

The one-time `console.warn` for an unavailable shell grammar (`command-safety-notice.ts`, added
for task 4.5 and consolidated during the second review) was removed entirely, with the user's
call:

- **It wrote to a global console.** In the Ink TUI host a bare `console.warn` mid-render corrupts
  the frame — worse than no warning. The project's real observability path is the agent event
  bus → `bridgeTelemetryToAgentLog` → the persisted `agent.log`; the notice bypassed all of it,
  and wiring it through would mean adding a telemetry event for a condition that is already
  visible three other ways.
- **The degradation is not silent without it.** A subagent sees
  `SUBAGENT_UNCLASSIFIED_MESSAGE` ("not recognised as read-only…") instead of the misleading
  ask-the-main-agent message; a root command surfaces as an approval request; the report itself
  carries `grammarUnavailable` for any host that wants to report it.
- **The flag is the contract.** The spec scenario was rewritten from "surfaced to the user or
  log" to "the report MUST carry a machine-readable flag", which is what `grammarUnavailable`
  already is — a host-side concern, not an analysis-layer side effect.

Removed: `command-safety-notice.ts`, both call sites (`run-command-tool`,
`agent-chat-controller`), and `CommandSafetyReport.shellKind` — its only reader was the notice,
so it would have been a dead field under the project's field discipline.
`analyzeParsedCommands` lost the parameter that existed only to echo it back.
