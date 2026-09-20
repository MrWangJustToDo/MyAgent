## Why

The tool layer builds POSIX shell command strings, which defeats the Windows-aware shell
selection that already exists one layer below it.

`packages/node/src/environment/shell.ts` resolves a shell correctly for Windows (`win32`
detection at `:35`, Git Bash discovery at `:68-85`, `powershell.exe` with argv `["-Command"]`
at `:58`). But the tools hand that shell a command string written for bash: `set -o pipefail`,
`2>/dev/null`, and `| head -n N` appear at 9 sites. `set -o pipefail` is a **syntax error** in
PowerShell (the option does not exist), so `glob`, `grep`, `tree`, and `load_skill` do not
degrade on Windows — they fail outright. This is why "the shell layer is Windows-aware" has
been true while the tools are not.

A second, independent defect makes the situation worse for subagents. `command-safety` parses
every command with the bash grammar (`command-parser.ts:86`). On Windows a PowerShell or cmd
command does not parse, the approval policy falls back to `ask` on parse failure, and subagents
downgrade `ask` to `deny` — so a subagent cannot run `run_command` at all.

Both opencode and gemini-cli avoid this class of bug structurally: neither constructs shell
command strings for its search tools. opencode spawns ripgrep with an argv array
(`["--no-config", "--json", "--hidden", "--no-messages", "--glob=!**/.git/**", "--", pattern, path]`)
and truncates in-process; gemini-cli does the same and adds `escapeShellArg(arg, shell)` with an
explicit per-shell branch. Neither injects `pipefail` or `| head -n`. We should converge on that
approach rather than add a Windows branch to each of the 9 call sites.

## What Changes

**Execution layer — stop generating shell strings (L1)**

- `glob`, `grep`, and `tree` MUST invoke their search binary through argv, not a shell command
  string. This removes `set -o pipefail`, `2>/dev/null`, `| head -n N`, and the hardcoded
  `fd` / `fdfind` / `find` / `rg` names from the tool bodies.
- Result truncation MUST happen in-process after capture, not through `| head -n N`.
- `skill-loader` MUST discover `SKILL.md` without shelling out to `find`.

**Binary discovery and exit-code semantics (L2)**

- `CoreEnv.commandExists` MUST NOT probe with `command -v … >/dev/null 2>&1`, which is POSIX-only.
- Search tools MUST interpret "binary missing" by a platform-aware rule instead of the hardcoded
  exit code `127` (cmd.exe reports 9009; PowerShell reports 1), so the fallback path is reachable
  on Windows.

**Command safety (L3)**

- Command analysis MUST be aware of the shell a command will actually run under, and MUST declare
  its behaviour when that shell's grammar is unavailable instead of silently falling back to the
  bash parse.
- The arity table and file-command sets MUST cover Windows-native commands (`dir`, `type`, `copy`,
  `del`, `move`, `where`, `findstr`) so approval normalization is not Unix-only.
- A failed parse MUST NOT make `run_command` unavailable to subagents.

**Peripheral path handling (L4)**

- LSP file-URI conversion MUST round-trip a Windows drive path (`file:///C:/…` ↔ `C:\…`) rather
  than returning `/C:/…`.
- Workspace-relative path computation MUST NOT assume a `/`-terminated root.
- OS-sandbox deny rules MUST resolve `~` per platform rather than emitting literal `~/.ssh`.

**Explicitly out of scope (L5, deferred)**

- Windows console encoding / codepage (`chcp`, `$OutputEncoding`) and CRLF normalization. Both
  opencode and gemini-cli leave this incomplete — gemini-cli's UTF-8 garbling bug (#27142, CP936)
  was closed `not_planned` — so there is no reference implementation to converge on yet.

## Capabilities

### New Capabilities

- `tool-execution-portability`: how the tool layer executes external search/lookup binaries
  across platforms — argv-based spawning instead of shell command strings, in-process output
  truncation, platform-aware binary discovery and missing-binary exit codes, and per-platform
  path round-tripping for the peripheral consumers (LSP URIs, workspace-relative paths, sandbox
  deny rules).
- `command-safety-portability`: how the command-safety layer (parse, arity normalization,
  file-command classification, approval policy) behaves when the host shell is not bash, and
  what it MUST guarantee about tool availability when a shell grammar is unavailable.

### Modified Capabilities

_None. `core-tool-layout` governs where tool factories live, not how they execute, so it is not
the right home for these requirements; `command-jobs` covers background job lifecycle, which this
change does not alter._

## Impact

**Affected code**

- `packages/core/src/agent/tools/glob-tool.ts` (`:44`, `:71`, `:73`, `:84`)
- `packages/core/src/agent/tools/grep-tool.ts` (`:132`, `:193`)
- `packages/core/src/agent/tools/tree-tool.ts` (`:86`)
- `packages/core/src/agent/tools/util/search-command.ts` (`:10`, `:28`)
- `packages/core/src/agent/skills/skill-loader.ts` (`:88`)
- `packages/core/src/agent/tools/command-safety/` (`command-parser.ts:86`,
  `command-arity.ts:17-67`, `command-analyzer.ts`, `command-approval-policy.ts`)
- `packages/core/src/agent/lsp/shared/format.ts` (`:5-15`, `:19-27`)
- `packages/app/src/utils/workspace-path.ts` (`:11-15`)
- `packages/node/src/index.ts` (`:167-177` `commandExists`)
- `packages/node/src/environment/os-sandbox.ts` (`:70` `denyRead`)

**APIs / dependencies**

- `CoreEnv.commandExists` changes implementation; its signature is unchanged.
- `CoreEnv.runCommand` keeps its string-command contract — it is the model-facing `run_command`
  path and legitimately accepts shell syntax. This change removes the *tool layer's* use of it
  for internal search plumbing, not the tool itself.
- No new external dependencies. Search binaries remain resolved from `PATH` (we already have
  `resolveCommandPath`); bundling or downloading ripgrep, as opencode and gemini-cli do, is
  deliberately not proposed here.

**Verification constraint**

This repository is developed on Linux. No Windows runner or Windows shell is available, so the
platform-specific paths in this change can be verified by typecheck, build, and `validate:*`
scripts only. Anything that depends on real PowerShell/cmd behaviour MUST be marked
unconfirmed and requires a Windows host to close out.
