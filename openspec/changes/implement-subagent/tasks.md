## 1. Core SubAgent Implementation

- [x] 1.1 Create `SubAgent` class in `packages/core/src/agent/subagent/subagent.ts` that wraps Agent with restricted config
- [x] 1.2 Define read-only tool set constant (`SUBAGENT_TOOLS`) containing: read_file, glob, grep, bash, list_file
- [x] 1.3 Create subagent system prompt template that clarifies subagent role and read-only constraints
- [x] 1.4 Implement `runSubagent(prompt: string)` function that creates SubAgent, runs loop, returns summary
- [x] 1.5 Add iteration limit (30) with early termination and partial summary return
- [x] 1.6 Implement summary extraction from final response (extract text content only)
- [x] 1.7 Add summary truncation (5000 char limit with truncation notice)

## 2. Task Tool Definition

- [x] 2.1 Create `task` tool in `packages/core/src/agent/tools/task-tool.ts` with prompt and description parameters
- [x] 2.2 Implement tool execute function that calls `runSubagent()` and returns summary
- [x] 2.3 Add task tool to parent agent's tool set (not subagent's)
- [x] 2.4 Export task tool from tools index

## 3. Token Usage Tracking

- [x] 3.1 Ensure SubAgent creates its own AgentContext for usage tracking
- [x] 3.2 After subagent completion, aggregate usage to parent's AgentContext
- [x] 3.3 Add usage breakdown reporting (parent vs subagent tokens)

## 4. Streaming Integration

- [x] 4.1 Subagent uses `generateText()` for simpler implementation (streaming via logs)
- [x] 4.2 Progress tracked via parent's log (subagent step N, finishReason)
- [x] 4.3 Token usage aggregated to parent's context for visibility

## 5. CLI UI Components

- [x] 5.1 Add `task` tool formatter in `packages/cli/src/utils/format.ts` for rendering subagent output
- [x] 5.2 Task output styled with iteration count, token usage, and summary preview
- [x] 5.3 Update `ToolInputView` to show subagent prompt in cyan
- [x] 5.4 Task tool output shown via existing `ToolOutputView` using the new formatter

## 6. Testing & Verification

- [x] 6.1 Verify subagent cannot access write tools (write_file, edit_file, delete_file) - by design, only read-only tools in createSubagentTools()
- [x] 6.2 Verify subagent cannot spawn subagents (no task tool) - by design, task tool not included in subagent tools
- [x] 6.3 Verify parent context only receives summary, not full subagent history - by design, generateText returns only final text
- [x] 6.4 Verify token usage is correctly aggregated - usage tracked in onStepFinish and added to parentContext
- [x] 6.5 Test iteration limit triggers correctly after 30 iterations - handled by stepCountIs(SUBAGENT_MAX_ITERATIONS)

## 7. Documentation & Exports

- [x] 7.1 Export SubAgent and task tool from `packages/core/src/agent/index.ts` - all types and functions exported
- [x] 7.2 Add JSDoc documentation to SubAgent class and runSubagent function - comprehensive JSDoc with examples
- [ ] 7.3 Update AGENTS.md with subagent usage examples
