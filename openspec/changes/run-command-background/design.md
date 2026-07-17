## Context

Today `run_command` always `await`s `CoreEnv.runCommand` until process exit. Playground WebContainer and local Node both expose only this blocking API. Long-lived servers (Vite, static servers) block the agent turn; users rely on Esc/abort or timeouts.

Constraints:
- CoreEnv is the sole platform abstraction (node, playground, remote server).
- Tool approval already gates shell execution.
- Streaming UI already exists via `emitStreamingChunk(toolCallId, …)`.
- WebContainer: single boot per tab; no job persistence across refresh.
- Earendil-style “use tmux instead” is a poor fit for Ink + WebContainer hosts.

## Goals / Non-Goals

**Goals:**
- Model can start a command in the background with `run_in_background: true`.
- Model can poll output/status and kill jobs via dedicated tools.
- Foreground `run_command` behavior stays identical when the flag is absent/false.
- Node + playground implement background execution in phase 1.
- Jobs are cleaned up on CoreEnv/agent teardown.

**Non-Goals:**
- Timeout automatically promoting a FG command to background.
- User-only “run in background” checkbox as the primary control (optional UI later).
- Persisting jobs across playground refresh or process restart.
- Full remote-server job streaming parity in phase 1 (may return unsupported).
- Replacing approval or sandbox policy.

## Decisions

### 1. Model chooses background via tool argument

**Choice:** `run_in_background?: boolean` on `run_command` (Claude / Reasonix style).

**Alternatives:** user approval toggle only; timeout→bg; shell `&` only.

**Why:** Model knows intent (dev server vs one-shot build). Approval still gates execution; description shows background. Shell `&` bypasses streaming/kill/registry.

### 2. CoreEnv gains `startCommand` + shared JobRegistry in core

**Choice:**
```ts
startCommand(command, options): Promise<{ jobId: string }>
// options: cwd, env, onStdout, onStderr — no await-until-exit
```
Plus an in-core `JobRegistry` that tools use for `get_command_output` / `kill_command`.

**Alternatives:** overload `runCommand({ background: true })` only; put registry only in node.

**Why:** Clear FG vs BG API; registry must be runtime-agnostic so tools stay in core. Adapters own process handles; registry owns ids, buffers, status.

### 3. Companion tools instead of stuffing poll into run_command

**Choice:** `get_command_output({ jobId, since? })`, `kill_command({ jobId })`.

**Why:** Keeps FG result schema stable; matches industry job UX; allows incremental reads.

### 4. Phase 1 adapters

**Choice:** Implement BG for `@my-agent/node` and playground WebContainer. Remote client: if `startCommand` missing, tool returns a clear error for BG requests.

**Why:** Unblocks local CLI + playground preview; remote can add RPC later without blocking.

### 5. Streaming

**Choice:** While BG job runs, continue `emitStreamingChunk` using the **original** `run_command` toolCallId until that tool returns; after return, further output is available only via `get_command_output` (and optionally a synthetic stream keyed by jobId in a follow-up).

**Phase 1 simplification:** On BG start, return immediately after spawn succeeds; initial empty/partial buffer OK. Ongoing chunks may still emit for a short window if the tool call stays open until first byte — prefer **return immediately** with jobId and rely on `get_command_output` for the rest (simpler lifecycle).

**Why:** Avoid half-open tool calls hanging the agent loop.

### 6. Output buffering

**Choice:** Per-job ring buffer / `OutputAccumulator`-style tail + optional log file under `.agent-cache/` or temp, similar to large FG output caching.

## Risks / Trade-offs

- **[Risk] Orphan processes** → Mitigation: kill on `destroy`/registry clear; node already tracks detached PIDs for FG — extend for BG jobs.
- **[Risk] WebContainer refresh loses jobs** → Mitigation: document; no restore.
- **[Risk] Model forgets to poll** → Mitigation: `toModelOutput` instructs to use `get_command_output`; system/AGENTS note for playground.
- **[Risk] Remote CoreEnv lag** → Mitigation: phase 1 explicit unsupported error.
- **[Trade-off] Immediate return vs wait-for-listen** → Prefer immediate return; preview panel already detects ports independently.

## Migration Plan

1. Ship additive APIs/tools (no BREAKING FG schema change).
2. Register new tools in `createTools`.
3. Adapters implement `startCommand` when ready; tools feature-detect.
4. Rollback: disable BG tools / ignore `run_in_background` via flag if needed.

## Open Questions

- Exact `since` cursor: byte offset vs line number (prefer byte offset into combined log).
- Whether approval UI shows a distinct “background” badge in phase 1 (nice-to-have).
