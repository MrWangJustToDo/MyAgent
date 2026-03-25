/**
 * Compaction Prompt - Domain-specific prompt for conversation summarization.
 *
 * This prompt guides the LLM to generate high-quality summaries that preserve
 * essential context for continued agent work.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * The core compaction prompt template.
 *
 * Based on the reference implementation from opencode, this prompt focuses on:
 * - What was done
 * - What is currently being worked on
 * - Which files are being modified
 * - What needs to be done next
 * - Key user requests, constraints, or preferences
 * - Important technical decisions and why
 */
export const COMPACTION_PROMPT = `You are a summarizer. Your ONLY task is to create a summary of the conversation.

CRITICAL RULES:
- Output ONLY a summary in plain text/markdown
- Do NOT include any tool calls, function calls, or XML tags
- Do NOT include "<tool_call>", "<function>", "<parameter>" or similar
- Do NOT say "I'll do this" or "Let me do that" - just summarize what WAS done
- Do NOT respond to questions - only summarize

## What to Include

Provide a detailed but concise summary focusing on:

1. **What was done** - Completed work with specific file paths and changes
2. **Current state** - What is being worked on right now
3. **Files modified** - List of files created, modified, or deleted
4. **What needs to be done next** - Pending tasks and next steps
5. **User preferences** - Any requirements or constraints mentioned
6. **Technical decisions** - Important choices made and why

## Format

Write in clear, structured prose or bullet points. Example:

---
## Summary

### Completed
- Created src/utils/helper.ts with validation functions
- Updated src/index.ts to use new helper

### In Progress
- Implementing user authentication in src/auth/

### Next Steps
- Add unit tests for helper functions
- Configure database connection

### User Requirements
- Must use TypeScript strict mode
- Prefer functional programming style
---

Be concise but complete. Include specific file paths, function names, and technical details.`;

// ============================================================================
// Public API
// ============================================================================

/**
 * Structured todo item for inclusion in compaction
 */
export interface CompactionTodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  priority: "high" | "medium" | "low";
}

/**
 * Build the compaction prompt with optional focus guidance and active todos.
 *
 * @param options - Prompt configuration
 * @param options.focus - Optional focus area to emphasize in summarization
 * @param options.todos - Optional list of active todos to include in summary
 * @returns The complete prompt string
 *
 * @example
 * ```typescript
 * // Basic prompt
 * const prompt = buildCompactionPrompt();
 *
 * // With focus
 * const prompt = buildCompactionPrompt({ focus: "preserve the API design decisions" });
 *
 * // With active todos
 * const prompt = buildCompactionPrompt({
 *   todos: [
 *     { content: "Implement user auth", status: "in_progress", priority: "high" },
 *     { content: "Add tests", status: "pending", priority: "medium" },
 *   ]
 * });
 * ```
 */
export function buildCompactionPrompt(options?: { focus?: string; todos?: CompactionTodoItem[] }): string {
  const { focus, todos } = options ?? {};

  let prompt = COMPACTION_PROMPT;

  if (focus) {
    prompt += `\n\n## Special Focus\n\nPay particular attention to preserving information about: ${focus}`;
  }

  // Include active todos if provided
  if (todos && todos.length > 0) {
    prompt += `\n\n## IMPORTANT: Active Todo List\n\nThe following todos are currently active and MUST be included in the summary. The agent should re-create these todos using the todo tool after reading this summary:\n\n`;

    for (const todo of todos) {
      const statusIcon = todo.status === "in_progress" ? "🔄" : todo.status === "completed" ? "✅" : "⏳";
      const priorityLabel = todo.priority === "high" ? "[HIGH]" : todo.priority === "low" ? "[LOW]" : "";
      prompt += `- ${statusIcon} ${priorityLabel} ${todo.content} (${todo.status})\n`;
    }

    prompt += `\nThese todos represent the current work state and should be restored immediately when continuing.`;
  }

  prompt += `\n\n## Your Task\n\nSummarize the conversation that follows. Output ONLY the structured summary, nothing else.`;

  return prompt;
}
