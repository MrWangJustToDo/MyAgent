## Why

`run_command` is foreground-only: the agent must await exit. Dev servers (`npm run dev`, Vite) and other long-running processes block the tool loop, so playground preview and iterative work stall until timeout/abort. Comparable agents expose model-chosen background jobs (`run_in_background` + poll/kill). We need the same for local Node and WebContainer CoreEnv without relying on bare shell `&`.

## What Changes

- Add optional `run_in_background` on `run_command`; when true, return immediately with a `jobId` (and optional log path) instead of waiting for exit.
- Add companion tools: `get_command_output` (incremental stdout/stderr + status) and `kill_command`.
- Extend CoreEnv with a background-capable command API (start + attach to a job registry), implemented for `@my-agent/node` and playground WebContainer first; remote server RPC can follow with a stub or thin proxy.
- Keep existing foreground `run_command` behavior and approval (`needsApproval`) unchanged for non-background runs; background runs still require approval and surface “background” in the approval/input summary.
- Wire streaming UI to job output where possible (reuse streaming chunk channel).
- Document job lifecycle: destroy agent / clear CoreEnv / playground tab refresh cleans up jobs; no cross-refresh persistence on WebContainer.

## Capabilities

### New Capabilities

- `command-jobs`: Background shell jobs — start via `run_command`, poll via `get_command_output`, stop via `kill_command`, CoreEnv + registry contract.

### Modified Capabilities

- (none — no existing openspec capability covers `run_command` requirements)

## Impact

- `@my-agent/core`: `RunCommandOptions` / new start API, JobRegistry, tools (`run-command-tool`, new output/kill tools), tool registration, public types.
- `@my-agent/node`: process spawn that can outlive the tool call; pid tracking / kill tree.
- `@my-agent/playground`: WebContainer `spawn` without awaiting exit for BG; map cwd as today.
- `@my-agent/server`: optional follow-up for remote `startCommand` RPC (phase 1 may return “unsupported” for BG over remote).
- `@my-agent/app`: format BG tool outputs; optional streaming by job id.
- Docs: `AGENTS.md` (playground), core/runtime notes as needed.
