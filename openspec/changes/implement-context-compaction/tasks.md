## 1. Compaction Types and Configuration

- [x] 1.1 Create `packages/core/src/agent/compaction/types.ts` with CompactionConfig, CompactionResult interfaces
- [x] 1.2 Add Zod schemas for compaction configuration validation
- [x] 1.3 Define default compaction settings (threshold=100000, keepRecent=3, transcriptDir=".transcripts")
- [x] 1.4 Export types from `packages/core/src/agent/compaction/index.ts`

## 2. Token Estimation

- [x] 2.1 Create `packages/core/src/agent/compaction/token-estimator.ts`
- [x] 2.2 Implement `estimateTokens(messages)` using character/4 approximation
- [x] 2.3 Handle nested message structures (parts, tool results, etc.)

## 3. Compaction Prompt

- [x] 3.1 Create `packages/core/src/agent/compaction/compaction-prompt.ts`
- [x] 3.2 Define summarization prompt focusing on: what was done, current work, files, next steps, decisions
- [x] 3.3 Add function to build prompt with optional focus parameter

## 4. Micro Compaction (Layer 1)

- [x] 4.1 Create `packages/core/src/agent/compaction/micro-compact.ts`
- [x] 4.2 Implement `microCompact(messages, config)` to replace old tool results
- [x] 4.3 Track tool_use_id to tool_name mapping for placeholder text
- [x] 4.4 Preserve recent N tool results based on config
- [x] 4.5 Skip small tool results (< 100 chars)

## 5. Auto Compaction (Layer 2)

- [x] 5.1 Create `packages/core/src/agent/compaction/auto-compact.ts`
- [x] 5.2 Implement `shouldAutoCompact(messages, config)` threshold check
- [x] 5.3 Implement `saveTranscript(messages, config, sandbox)` to write JSONL file
- [x] 5.4 Implement `summarizeConversation(messages, model, focus?)` using LLM
- [x] 5.5 Implement `autoCompact(messages, config, model, sandbox)` full flow
- [x] 5.6 Return compressed messages (summary + acknowledgment)

## 6. Compact Tool (Layer 3)

- [x] 6.1 Create `packages/core/src/agent/tools/compact-tool.ts`
- [x] 6.2 Define tool schema with optional `focus` parameter
- [x] 6.3 Implement tool execute that triggers auto-compact logic
- [x] 6.4 Return confirmation with transcript path
- [x] 6.5 Export compact tool from `packages/core/src/agent/tools/index.ts`

## 7. Agent Configuration Integration

- [x] 7.1 Add `compaction?: CompactionConfig` to ManagedAgentConfig in manager-agent.ts
- [x] 7.2 Store compaction config on Agent instance
- [x] 7.3 Add getter for compaction config

## 8. Agent Loop Integration

- [x] 8.1 Modify `prepareMessages()` in base.ts to apply micro_compact
- [x] 8.2 Add auto_compact check before LLM call in stream/generate methods
- [x] 8.3 Handle message state mutation after compaction
- [x] 8.4 Add compact tool to agent's tool set in AgentManager

## 9. Documentation and Exports

- [x] 9.1 Export compaction types and utilities from `packages/core/src/agent/index.ts`
- [x] 9.2 Add JSDoc documentation to all compaction functions
- [x] 9.3 Update AGENTS.md with compaction system documentation

## 10. Verification

- [x] 10.1 Verify token estimation works with various message structures
- [x] 10.2 Test micro_compact preserves recent tool results
- [x] 10.3 Test auto_compact triggers at threshold
- [x] 10.4 Test transcript files are created correctly
- [x] 10.5 Run build to verify no type errors
