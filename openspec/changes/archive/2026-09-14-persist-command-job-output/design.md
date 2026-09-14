## Context

Background shell jobs are already modeled as a small state machine: `run_command(run_in_background: true)` → `CoreEnv.startCommand` → an in-core `commandJobRegistry` record → `get_command_output` (incremental poll with per-stream cursors), `kill_command`, and a `background-notification` middleware that injects a terminal message once per finished job.

Two properties of that design cause the problem this change addresses:

- **The registry is memory-only and head-trimmed.** Running streams are capped at 256K and finished ones at 64K; trimming drops the **head**. For a dev server the head is exactly the interesting part (the startup error), and the loss is silent.
- **The registry is not reachable from every host surface.** Code-mode's curated subset exposes `read_file`/`grep`/`glob`/`list_file`/`tree` (eager) plus `run_command`/`websearch` (lazy) — `get_command_output` is not in it, so a sandbox-started job's output cannot be read at all.

The original background-jobs design left this half open: it chose "tail buffer + optional log file under a cache dir" (design §6) and listed "byte offset into combined log" as an open question (`openspec/changes/archive/2026-08-12-run-command-background/design.md`).

Two neighboring subsystems set the conventions to follow:

- `agent/tools/util/tool-output-cache.ts` — `.agents/cache/tool-output/{id}.txt`, workspace-relative paths returned to the model, `CoreEnvFs.remove` for deletion, GC driven by **message references** after compaction.
- `agent/agent-log/agent-log.ts` `attachFileSink` — buffered `appendFile` with a flush interval, size-based rotation, and a silent no-op when the env fs lacks `appendFile`.

`CoreEnvFs` already provides everything needed (`appendFile?`, `appendFileSync?`, `writeFile`, `readFile`, `stat` with `size`/`mtime`, `readdir`, `exists`, `remove`, `mkdir`), so no CoreEnv interface change is required. Node and the remote server fs both implement `appendFile` today (`native-fs.ts:129`, `routes/fs.ts:152` + `client.ts:154`).

Constraints carried into this design: the three-tool surface stays as-is (see proposal non-goals), the change is additive (`cachedOutputPath` already exists on the schemas and is hard-coded to `null`), and every host talks to the filesystem only through `CoreEnvFs`.

## Goals / Non-Goals

**Goals:**

- Background job output stops being lossy: the head is durable on disk.
- The log file is self-describing — command, start time, and (once finished) terminal status + exit code — so it can be interpreted without the registry.
- The log path is surfaced to callers, which is what makes job output readable in hosts/surfaces that only have file reads (notably the code-mode sandbox).
- Disk usage is bounded and there is an explicit delete story (eviction, teardown, stale sweep).

**Non-Goals:**

- Merging `kill_command` into `run_command` or removing `get_command_output` (the split still carries the sandbox isolation, plan-mode name exclusion and subagent approval asymmetry).
- Changing approval policy, plan-mode/subagent gating, or streaming behaviour.
- Jobs surviving session restart/restore (the registry is in-memory by design; the log is a forensic artifact, not a resume mechanism).
- Changing foreground output caching (`maybeCacheOutput` already covers it).
- A byte-offset incremental read API (left open by the archived design) — `get_command_output` remains the only incremental reader.

## Decisions

### D1 — Location: `.agents/cache/command-jobs/<jobId>.log`

Workspace-relative path returned to the model, mirroring the tool-output cache convention.

- **Why not `.agents/cache/tool-output/`:** that directory is GC'd by `cleanupOrphanedToolCache`, which deletes files no longer referenced by a message part (`tool-output-cache.ts:191`). A running job's log has no message reference, so it would be deleted mid-run.
- **Why not the OS temp dir:** `read_file` resolves against the workspace root, so the model (and the sandbox) could not read a temp path.
- **Why not the session store:** job logs are ephemeral and per-process; the session store is append-only and user-visible.

### D2 — One interleaved file, stderr marked

A single file in arrival order; stderr chunks are prefixed per line so the streams stay distinguishable. A header line (`# <command>`, start timestamp) makes the file self-describing.

- **Alternative — split `.out`/`.err`:** rejected; ordering is exactly what you need when debugging a failing server ("error printed before/after the listen line").
- **Alternative — raw interleave:** rejected; a compiler warning and an error would be indistinguishable.

### D3 — Terminal footer carries status + exit code

On exit/kill/failure, append `[exit <code> · <status> · finished <iso>]`. Absence of a footer means "still running (or crashed before finalize)".

- **Why:** `read_file` has no status channel, and the completion notification is drained *before the next LLM call*, so a model that re-reads the log in the same turn would otherwise never learn the job ended.
- **Alternative — `<jobId>.status` sidecar:** rejected; two files to keep in sync, and the model has to know about both.
- `get_command_output` keeps returning live status/exit code for the query path; the notification middleware is unchanged.

### D4 — Buffered append, flushed on a timer

Append through a small per-job buffer with a ~250 ms flush (mirroring `attachFileSink`), force-flushed on finalize. Chunk-ordered because the buffer is a FIFO and flushes are serialized per job.

- **Why:** a noisy dev server emits many small chunks; one fs write per chunk (and one on the remote path, an HTTP round trip) is wasteful.
- On the teardown path prefer `appendFileSync` when the host provides it, so a footer still lands if `destroy` cannot await.

### D5 — Size policy: cap the append, keep the head (**head durable, tail live**)

At `MAX_JOB_LOG_BYTES` (16 MiB) write a single `[log truncated at 16 MiB — recent output only via get_command_output]` marker and stop appending.

- **Why:** the head is the valuable part (startup/forensics), the registry already holds the live tail, and stopping the append keeps every `read_file` offset stable.
- **Alternative — rotation with sibling `.log.1` files (agent-log style):** rejected; it introduces sibling files the model must discover, and our cap is generous enough that rotation buys nothing.
- **Alternative — head truncation:** rejected; shifting line offsets breaks the model's cursor and makes re-reads unreliable.

### D6 — The job record owns the file

The writer is created with the record, so the path is advertised immediately when the host can append; the file itself appears on the first flush — first output **or** finalize, so a job that prints nothing still leaves a footer-only record once it ends. Delete when the record is evicted (existing `evictOldestFinished`), on `destroyAllCommandJobs` / registry teardown, and sweep `*.log` older than 24 h lazily at job create, at most once per process. `kill` does **not** delete — a killed job's log is still wanted. Teardown deletes exactly the jobs it captured: `clearCoreEnv()` fires `destroyAll()` without awaiting, and a job started meanwhile must stay queryable rather than be silently dropped.

- **Alternative — compaction-driven GC like the tool cache:** rejected; job logs are not message-referenced, so the orphan heuristic does not apply.
- **Alternative — `session:start` hook:** rejected; it adds lifecycle wiring in every host for a worst-case cleanup that a lazy sweep covers.

### D7 — Degrade silently, never fail the command

Any failure (no `appendFile`, unwritable cache dir, remote error) disables logging for that job and leaves `cachedOutputPath` unavailable — `null` from the start when the capability is missing, and cleared from the record if a write fails later — with no effect on the command result. This mirrors `attachFileSink`'s silent no-op.

### D8 — Surface the path, keep the delta contract

`run_command(run_in_background)` returns `cachedOutputPath` (currently `null`) and `get_command_output` echoes it; both descriptions and the background `toModelOutput` text tell the model to use `read_file` for output that scrolled past or needs re-reading, and to treat the absence of a footer as "still running". `get_command_output`'s incremental semantics are unchanged.

## Risks / Trade-offs

- **[Risk] Aggregate disk growth (many jobs × cap)** → Mitigation: per-job cap, deletion on eviction/teardown, 24 h sweep; the directory is workspace-local and gitignored.
- **[Risk] Concurrent sessions sharing a workspace root: one session's sweep deletes another's live log** → Mitigation: the sweep is age-based (24 h) only, and job ids are unique so writes never collide. Accepted and documented.
- **[Risk] The model reads a partial log and assumes the command finished** → Mitigation: no footer means running, stated in the tool text; the completion notification remains the terminal signal.
- **[Risk] stdout/stderr interleaving is arrival order, not exact process write order** → Accepted; identical to today's registry buffers.
- **[Risk] A host without `appendFile` silently loses the feature** → Mitigation: `cachedOutputPath: null` keeps the old behaviour; Node and remote server already implement it, and a follow-up can add it to WebContainer if needed.
- **[Trade-off] File and `get_command_output` can disagree about "the output"** (head vs delta) → Mitigation: documented in the model-facing hint ("log keeps the head; the poll keeps the recent tail").

## Migration Plan

1. Land the additive log writer + registry wiring; `cachedOutputPath` starts being populated. No schema break (the field already exists on both output schemas).
2. Update tool descriptions/`toModelOutput` text and `AGENTS.md`.
3. Extend `validate-command-job-registry.mjs` (log creation, order, footer, path, cap marker, eviction deletion, sweep, degraded path) and run it with the neighbouring command-safety validators.
4. Rollback: revert the writer; paths go back to `null`. No persisted state depends on the log files, and stale files are swept.

## Open Questions

- Should the footer also carry duration? (Cheap and useful for forensics — decide during implementation.)
- Should there be an aggregate cap on the cache directory (not just per job)? Deferred; eviction + sweep covers the common case.
- Should the sandbox eventually get a first-class "read job log" affordance instead of relying on `read_file` + path? Out of scope here, but this change is what makes that possible.
