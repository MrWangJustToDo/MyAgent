## Context

The current Agent class (`packages/core/src/agent/loop/agent.ts`) maintains a single message context that grows as the agent works. For complex tasks requiring exploration (reading multiple files, running commands), the context becomes polluted with intermediate results that are no longer relevant.

The reference implementation from `learn-claude-code` demonstrates a simple but effective pattern:
- Parent agent has a `task` tool to spawn subagents
- Subagent starts with fresh `messages=[]`
- Subagent gets filtered tools (no `task` to prevent recursion)
- Only the final summary text returns to parent
- Subagent context is discarded

Current architecture uses Vercel AI SDK with `streamText()` for the main loop. The subagent should integrate seamlessly with this pattern.

## Goals / Non-Goals

**Goals:**
- Implement context isolation via subagents with fresh message arrays
- Provide read-only tool set for subagents (safe exploration)
- Stream subagent progress to UI for visibility
- Track subagent token usage separately, aggregate to parent
- Clean API: `task` tool with `prompt` and `description` parameters

**Non-Goals:**
- Recursive subagent spawning (subagents cannot spawn subagents)
- Different LLM models for subagents (uses same model as parent)
- Parallel subagent execution (one at a time for simplicity)
- Persistent subagent sessions (each spawn is fresh)

## Decisions

### 1. SubAgent as a Lightweight Wrapper

**Decision:** Create `SubAgent` class that wraps the existing `Agent` but with restricted tools and fresh context.

**Rationale:** Reuse existing Agent infrastructure (streamText, tool execution, logging) rather than duplicating. The SubAgent just configures Agent differently.

**Alternatives considered:**
- Separate SubAgent implementation: More code duplication, harder to maintain
- Runtime tool filtering: Less type-safe, tools could leak through

### 2. Read-Only Tool Set for Subagents

**Decision:** Subagents get these tools only:
- `read_file` - Read file contents
- `glob` - Find files by pattern
- `grep` - Search file contents
- `bash` - Run commands (read-only by convention via system prompt)
- `list_file` - List directory contents

**Rationale:** Subagents are for exploration/research. Write operations should return to parent for approval. This prevents subagents from making changes without parent oversight.

**Alternatives considered:**
- Full tool set minus task: Risk of uncontrolled writes during exploration
- Configurable per-spawn: More complex API, premature optimization

### 3. Streaming Output to UI

**Decision:** Subagent output streams in real-time to a collapsible UI section. Parent sees "Subagent running..." with expandable details.

**Rationale:** User requested stream visibility. Silent execution with only summary loses debugging/transparency benefits.

**Implementation approach:**
- SubAgent uses same `streamText()` as parent
- CLI renders subagent parts in a `<Box>` with different styling
- Stream parts tagged with `subagent: true` metadata

### 4. Task Tool Definition

**Decision:** Single `task` tool with schema:
```typescript
{
  prompt: string,        // What the subagent should do
  description?: string,  // Short label for UI (default: "subtask")
}
```

**Rationale:** Matches reference implementation. Simple, clear purpose.

### 5. Token Usage Aggregation

**Decision:** SubAgent tracks its own token usage via AgentContext. On completion, usage is added to parent's context.

**Rationale:** Parent needs total cost visibility. Breakdown by subagent useful for optimization.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Subagent runs forever | Safety limit of 30 iterations (matches reference) |
| Large summary bloats parent context | Truncate summary to reasonable length (e.g., 5000 chars) |
| Subagent makes destructive bash calls | Read-only tool set + system prompt guidance |
| UI overwhelmed by subagent output | Collapsible section, only expand on request |
| Model confusion about subagent role | Clear system prompt: "You are a subagent. Complete task and summarize." |
