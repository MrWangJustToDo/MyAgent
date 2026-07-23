## Why

Users need a safe, first-class **plan mode**: explore read-only, produce a structured plan (with optional mermaid), then explicitly execute. Pi ships this as an extension; Cursor-style UX expects diagrams and step progress. My Agent already has TodoManager, tool approval, and markdown rendering — productizing plan mode in core avoids a half-complete extension API (`setActiveTools`) and matches our “capability in core” philosophy.

## What Changes

- **PlanModeController** on ManagedAgent: phases `off | planning | ready | executing`
- **Tool filtering** while planning: hide mutate tools; allowlist `run_command`; block MCP tools; middleware skip as defense in depth
- **Prompt injection** for planning/executing guidance (dynamic system section)
- **Plan extraction** from assistant markdown (`## Plan` / numbered steps + mermaid body)
- **Execute handoff**: seed TodoManager from steps; restore tools; progress via todo / `[DONE:n]`
- **App**: `/plan`, `/plan execute`, `/plan status`; Footer status; Help/AGENTS docs
- **Events**: `plan:enter`, `plan:ready`, `plan:execute`, `plan:exit`

## Capabilities

### New Capabilities
- `plan-mode`: Read-only planning → structured plan artifact → confirmed execution with TodoManager progress

### Modified Capabilities
- *(none required in archived specs for v1)*

## Impact

- **Core**: new `packages/core/src/agent/plan/`, PlanModeController, run-agent tool filter, middleware, events, ManagedAgent API
- **App**: `/plan` command, Footer, docs
- **Breaking**: none (opt-in via `/plan`)
- **Out of scope**: multi-plan trees, extension-only plan mode, tool parallelism changes
