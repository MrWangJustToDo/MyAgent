## Context

The current agent implementation has no context window management. Messages accumulate indefinitely until they exceed the model's context limit, causing failures. The reference implementation from `learn-claude-code` demonstrates a three-layer compression strategy that allows agents to work indefinitely.

Current architecture:
- Messages managed by Vercel AI SDK's Chat class (CLI) or passed directly to agent
- AgentContext tracks token usage but doesn't estimate pre-call tokens
- No message pruning, summarization, or compaction exists
- `prepareMessages()` in base.ts is the integration point for pre-processing

## Goals / Non-Goals

**Goals:**
- Implement three-layer compaction: micro (automatic), auto (threshold-triggered), manual (tool)
- Add token estimation to predict context size before LLM calls
- Preserve full conversation history in transcript files
- Provide `compact` tool for manual compression
- Use LLM-based summarization with specialized prompt for high-quality summaries

**Non-Goals:**
- Changing how messages are stored (keep using Vercel AI SDK patterns)
- Implementing sliding window or other compaction strategies (start with summarization)
- Real-time token counting (estimation is sufficient)
- Compaction for subagents (they already have fresh context)

## Decisions

### 1. Three-Layer Compaction Architecture

**Decision:** Implement three layers matching the reference:
- **Layer 1 (micro_compact)**: Replace tool_result content older than N turns with `[Previous: used {tool_name}]`
- **Layer 2 (auto_compact)**: When estimated tokens > threshold, save transcript and summarize via LLM
- **Layer 3 (compact tool)**: Manual trigger using same summarization as auto_compact

**Rationale:** Proven pattern from learn-claude-code. Micro provides gradual compression, auto prevents context overflow, manual gives user control.

### 2. Token Estimation Strategy

**Decision:** Use character-based estimation: `tokens ≈ characters / 4`

**Rationale:** Simple, fast, reasonably accurate. Exact token counting requires tokenizer (model-specific, adds dependency). Estimation is sufficient for threshold detection.

**Alternatives considered:**
- tiktoken library: Model-specific, adds dependency
- Vercel AI SDK's token counting: Not available pre-call

### 3. Integration Point

**Decision:** Integrate compaction in `prepareMessages()` method in `base.ts`, called before each LLM call.

**Rationale:** Single point of control, runs before every LLM call, already handles message transformation (todo nag injection).

### 4. Transcript Storage

**Decision:** Save transcripts to `.transcripts/` directory relative to rootPath with timestamped JSONL files.

**Rationale:** Matches reference implementation. JSONL for easy streaming writes. Timestamps for uniqueness and ordering.

### 5. Summarization Prompt

**Decision:** Use dedicated compaction prompt (from opencode reference):
```
Focus on:
- What was done
- What is currently being worked on
- Which files are being modified
- What needs to be done next
- Key user requests, constraints, or preferences
- Important technical decisions and why
```

**Rationale:** Domain-specific prompt produces better summaries than generic summarization.

### 6. Compaction Module Structure

**Decision:** Create `packages/core/src/agent/compaction/` module with:
- `types.ts` - CompactionConfig, CompactionResult types
- `token-estimator.ts` - Token estimation utilities
- `micro-compact.ts` - Layer 1 implementation
- `auto-compact.ts` - Layer 2 implementation
- `compaction-prompt.ts` - Summarization prompt
- `index.ts` - Exports

**Rationale:** Follows existing module patterns (skills/, subagent/). Keeps compaction logic isolated and testable.

### 7. Compact Tool Design

**Decision:** `compact` tool with optional `focus` parameter to guide summarization:
```typescript
{
  name: "compact",
  input: { focus?: string }  // e.g., "preserve the API design decisions"
}
```

**Rationale:** Matches reference. Optional focus allows context-aware compression.

### 8. Configuration

**Decision:** Add compaction config to AgentConfig:
```typescript
compaction?: {
  enabled?: boolean;           // default: true
  tokenThreshold?: number;     // default: 100000
  keepRecentToolResults?: number;  // default: 3
  transcriptDir?: string;      // default: ".transcripts"
}
```

**Rationale:** Configurable thresholds, can disable for testing, customizable transcript location.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Summarization loses important details | Use domain-specific prompt, preserve full transcript on disk |
| Token estimation inaccuracy | Use conservative threshold (e.g., 80% of actual limit) |
| Summarization API call adds latency | Only triggered when threshold exceeded, not every turn |
| Transcript files accumulate | Document cleanup strategy, consider auto-pruning old files |
| Model used for summarization differs from main agent | Use same model as agent for consistency |
| Micro-compact removes useful context | Keep recent N tool results intact, only clear old ones |
