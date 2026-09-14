## 1. Log writer helper

- [x] 1.1 Add `packages/core/src/agent/tools/util/command-output-log.ts` with the contract constants: log dir `.agents/cache/command-jobs`, `MAX_JOB_LOG_BYTES` (16 MiB), flush interval (~250 ms), staleness threshold (24 h), plus `jobLogPath(jobId)` returning the workspace-relative path
- [x] 1.2 Implement the per-job buffered writer: header line on first flush (`# <command>` + ISO start), FIFO buffer flushed on the interval and serialized per job, stderr chunks written with a per-line marker
- [x] 1.3 Implement `finalize(status, exitCode, endedAt)`: force-flush the buffer and append the terminal footer; also creates the file, so a job that prints nothing still leaves a footer-only log
- [x] 1.4 Enforce the cap: track appended bytes, on reaching the cap write exactly one truncation marker and stop appending (never rewrite or drop existing content)
- [x] 1.5 Implement `removeJobLog(path)` and `sweepStaleJobLogs()` (readdir + `stat().mtime` older than the threshold, at most once per process, `force`/`now` for tests)
- [x] 1.6 Degrade: no `appendFile` or any fs error disables logging for that job only — the record stops advertising `cachedOutputPath`, nothing is thrown, the command result is untouched

## 2. Registry wiring

- [x] 2.1 `CommandJobRecord`: add `logPath: string | null`; `create()` records the command and creates the (lazy-file) writer
- [x] 2.2 `appendStdout` / `appendStderr` additionally feed the log writer, keeping the existing in-memory buffers, cursors and trimming behavior unchanged
- [x] 2.3 `markExited` / `markKilled` / `markFailed` finalize the log with the terminal status and exit code (a failure message is logged before the footer)
- [x] 2.4 `evictOldestFinished` deletes the evicted job's log; teardown (`destroyAll`, `clear`) finalizes and deletes the logs it captured
- [x] 2.5 Trigger `sweepStaleJobLogs()` once per process from `create()`
- [x] 2.6 Surface `logPath` through `get()` / `poll()` so both tools can return it; a runtime write failure clears it on the record

## 3. Tools

- [x] 3.1 `run-command-tool.ts`: background result returns `cachedOutputPath: job.logPath`; description and background `toModelOutput` text point at the log + `read_file` and state that a missing footer means "still running"
- [x] 3.2 `get-command-output-tool.ts`: returns `cachedOutputPath: logPath` and adds the same hint to its `toModelOutput`; the incremental poll semantics are untouched
- [x] 3.3 `util/types.ts`: both output schemas already carried `cachedOutputPath`; only its description was updated (no input schema changes)

## 4. Docs

- [x] 4.1 `AGENTS.md`: documented the job log (location, ordering/stderr marking, footer meaning, head-durable/tail-live cap, deletion + sweep + degrade, why it must not live in `tool-output/`) and noted in the code-mode section that the sandbox reads job output through `read_file`
- [x] 4.2 Checked user-facing text describing background jobs (`packages/playground/README.md`, `packages/playground/src/webcontainer/create-env.ts`, app tool display strings): nothing became misleading — they describe start/poll/kill, which are unchanged

## 5. Validation and regression

- [x] 5.1 Extended `packages/core/scripts/validate-command-job-registry.mjs`: log created with header, arrival order, stderr marking, footer on exit and on kill, `logPath` on the record and in polls, cap marker with no further appends (head durable), eviction deletes, teardown deletes, degraded host (no `appendFile`) yields a null path with no writes, runtime write failure clears the path, sweep removes only files past the threshold
- [x] 5.2 No new script needed — `validate:command-job-registry` already exists and runs the extended file
- [x] 5.3 `pnpm build:core` + `validate:safe-command`, `validate:plan-tools`, `validate:tanstack-tools`, `validate:turn-context`, `validate:agent-status` all pass (tool surface, plan-mode exclusion and subagent approval untouched); `pnpm typecheck` clean across all 8 packages
- [x] 5.4 Format (prettier) and lint (eslint) clean on the changed files; a pre-existing race found while validating (`clearCoreEnv()` → unawaited `destroyAll()` wiping jobs created meanwhile) was hardened by deleting only the captured ids
