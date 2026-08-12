## Why

The context window is finite. A single file read can cost ~4000 tokens. After reading 30 files and running 20 commands, the agent hits 100,000+ tokens and cannot continue working. The agent needs a way to compress context strategically so it can work on large codebases indefinitely.

## What Changes

- Add three-layer context compaction system:
  - **Layer 1 (micro_compact)**: Automatically replace old tool results with placeholders every turn
  - **Layer 2 (auto_compact)**: When tokens exceed threshold, save transcript to disk and summarize via LLM
  - **Layer 3 (compact tool)**: Manual trigger for conversation compression
- Add token estimation utilities to predict context size before LLM calls
- Add transcript storage for preserving full conversation history on disk
- Add `compact` tool for agents to manually trigger compression
- Add compaction system prompt for guiding LLM summarization

## Capabilities

### New Capabilities

- `context-compaction`: Three-layer context compression system for infinite agent sessions

### Modified Capabilities

## Impact

- `packages/core/src/agent/compaction/` - New module for compaction logic
- `packages/core/src/agent/loop/base.ts` - Integrate compaction in message preparation
- `packages/core/src/agent/agent-context/` - Add token tracking and estimation
- `packages/core/src/agent/tools/` - New `compact` tool
