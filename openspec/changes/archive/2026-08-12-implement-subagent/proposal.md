## Why

As the agent works, its messages array grows with every file read, bash output, and tool result - polluting the parent context. When exploring a codebase or performing research tasks, the parent only needs the final answer (e.g., "this project uses pytest"), not the 30+ tool calls that discovered it. Subagents provide context isolation: a child agent runs in fresh context, performs complex multi-step work, then returns only a summary to the parent.

## What Changes

- Add a new `task` tool that spawns a subagent with fresh `messages=[]`
- Subagent shares the same sandbox/filesystem but gets a restricted read-only tool set
- Subagent streams its progress to the UI (collapsed section) for visibility
- Subagent returns only a text summary to parent when complete
- Parent context stays clean - subagent's full message history is discarded
- No recursive subagent spawning (subagent doesn't get the `task` tool)

## Capabilities

### New Capabilities

- `subagent`: Core subagent implementation including the SubAgent class, task tool, context isolation, read-only tool set, and streaming output integration

### Modified Capabilities

<!-- No existing spec-level requirements are changing -->

## Impact

- **packages/core/src/agent/**: New SubAgent class and task tool
- **packages/core/src/agent/tools/**: New task tool definition with restricted tool set for subagents
- **packages/cli/src/**: UI components for rendering subagent streaming output in collapsed sections
- **Token usage**: Subagent usage should be tracked and reported separately, then aggregated to parent
