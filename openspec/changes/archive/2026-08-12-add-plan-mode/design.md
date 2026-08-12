## Context

Plan mode is a product feature for safe exploration-then-execute. Existing pieces to reuse:

- `TodoManager` for step progress
- `resolveTanStackTools` / `ToolsRecord` for per-run tool lists
- Dynamic system prompt after `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`
- Extension `onBeforeToolCall` pattern for skip guards
- App markdown (`ink-stream-markdown`) for plan + mermaid in transcript

## Goals / Non-Goals

**Goals**

- Explicit phases: off → planning → ready → executing → off
- Hard read-only during planning (tools + run_command allowlist + MCP blocked)
- Structured plan markdown with numbered steps; mermaid optional in the same document
- User must `/plan execute` to leave ready and mutate the workspace
- Footer shows plan phase / progress

**Non-Goals**

- Cursor-cloud plan canvas / multi-agent plan trees
- Shipping as examples/extensions only
- Persisting plan trees across session forks (v1: in-memory on ManagedAgent; session field optional if trivial)

## Decisions

1. **Core over extension** — setActiveTools is not a first-class extension API; filtering in `run-agent` is the natural choke point.
2. **Filter tools before LLM + skip guard** — cleaner model context; middleware catches stragglers / MCP.
3. **Reuse TodoManager** — map plan steps to pending todos on ready/execute; prefer `todo` tool during execute; also parse `[DONE:n]` as fallback.
4. **MCP blocked in planning** — simplest safe default; restored on execute.
5. **Stay in executing until `/plan` off** — clearer than auto-exit when todos complete.

## Risks / Trade-offs

- Allowlist may be too strict → document `/plan` to exit; expand allowlist iteratively
- Plan extraction false positives → require `## Plan` or `Plan:` heading
- MCP-only workflows cannot plan with those tools → acceptable for v1

## Migration

None. Feature is opt-in via `/plan`.
