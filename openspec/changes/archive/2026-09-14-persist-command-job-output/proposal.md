# Change: Persist background command output to a per-job log file

## Why

Background shell jobs (`run_command` with `run_in_background: true`) keep their output **only in memory**, and the registry trims it aggressively: 256K/stream while running, 64K/stream once finished, 50 finished jobs retained. A dev server left running for a while loses its **head** — exactly where startup errors live — and the loss is invisible to the model.

The same in-memory design makes job output unreachable in one host: code-mode's curated tool subset exposes `read_file` plus `run_command`, but not `get_command_output` (`agent-factory.ts:320-321`), so a background job started inside the sandbox can never be read.

This is the deferred half of the original background-jobs design: it chose "tail buffer + optional log file under a cache dir" (§6) and left "byte offset into combined log" as an open question (`openspec/changes/archive/2026-08-12-run-command-background/design.md`).

## What Changes

- **Durable per-job log**: tee every background job's stdout/stderr to `.agents/cache/command-jobs/<jobId>.log` as chunks arrive — one file, arrival order preserved, stderr lines prefixed so the two streams stay distinguishable.
- **Terminal footer**: append `[exit <code> · <status> · finished <iso>]` when the job ends, so status/exit code are readable from the file alone (`read_file` cannot see the in-memory registry).
- **Path surfaced to the model**: fill `cachedOutputPath` on the background `run_command` result (currently hard-coded `null`) and on `get_command_output`, and mention `read_file` for long or re-read output in the model-facing text. `get_command_output` keeps its incremental poll semantics unchanged.
- **File lifecycle contract**: create on start (best-effort), finalize on end, delete together with the registry entry (eviction and teardown), opportunistic sweep of stale logs, and a hard size cap that **stops appending** rather than truncating the head (keeps `read_file` line offsets stable).
- **Non-goals (deliberate)**: merging `kill_command` into `run_command` and/or removing `get_command_output`. Both splits still do work the merge would have to re-implement: the code-mode sandbox isolates by omission (`kill_command` is not in the curated subset, and a merged tool cannot tell it is running in a sandbox), plan mode excludes mutate tools **by name**, and the subagent variant's approval asymmetry differs between the two tools. Also out of scope: approval-policy changes, jobs surviving session restart/restore, streaming changes, foreground output caching (already covered by `maybeCacheOutput`).

## Capabilities

### New Capabilities

- `command-jobs`: the background shell job contract — start via `run_command(run_in_background)`, incremental poll via `get_command_output`, stop via `kill_command`, the CoreEnv + in-core registry boundary, teardown cleanup, and now durable per-job log persistence.

### Modified Capabilities

- (none — no existing capability's requirements change)

## Impact

- **Code**
  - `packages/core/src/agent/tools/util/command-job-registry.ts` — log tee, footer, eviction/teardown deletion, stale sweep, `logPath` on the job record
  - `packages/core/src/agent/tools/util/command-output-log.ts` (new) — log file naming/append/finalize/cap/sweep helper
  - `packages/core/src/agent/tools/run-command-tool.ts` — background result `cachedOutputPath`, description + `toModelOutput` hints
  - `packages/core/src/agent/tools/get-command-output-tool.ts` — `cachedOutputPath` in output + hint
  - `packages/core/src/agent/tools/util/types.ts` — schemas already carry `cachedOutputPath`; only doc/description updates expected
  - `AGENTS.md` — background job notes (log location, how to read it)
- **Hosts**: all writes go through `CoreEnv.fs`, so Node (`node:fs`), remote server (fs over HTTP) and playground WebContainer work unchanged; a host that cannot write the cache dir degrades to `cachedOutputPath: null` (today's behavior) with no other impact.
- **Spec note**: `command-jobs` has **no main spec today** — the 2026-08-12 background-jobs change was archived without merging (`openspec list --specs` has no `command-jobs`). This change's delta therefore restates the baseline requirements from that archived spec alongside the new persistence requirements, so archiving produces a complete main spec instead of a persistence-only one.
- **Validation**: extend `packages/core/scripts/validate-command-job-registry.mjs` (and register a `validate:` entry if a new script is added) to pin log creation, arrival order, footer, returned path, cap behavior, eviction deletion and the sweep.
