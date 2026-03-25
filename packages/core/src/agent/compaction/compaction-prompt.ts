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
export const COMPACTION_PROMPT = `You are a conversation compactor. Your task is to summarize the conversation history while preserving all essential context needed for the AI assistant to continue working effectively.

## Output Format

Create a structured summary with these sections:

### Completed Work
- List what has been accomplished in this session
- Include specific file paths, function names, and changes made

### Current State
- What is currently being worked on
- Any in-progress tasks or partial implementations
- Current file context (which files are open/being edited)

### Files Modified
- List all files that have been created, modified, or deleted
- Include brief description of changes to each file

### Pending Tasks
- What still needs to be done
- Any tasks mentioned but not yet started
- Follow-up items identified during the work

### User Preferences
- Any specific requirements or constraints mentioned by the user
- Coding style preferences, conventions to follow
- Things the user explicitly asked to do or avoid

### Technical Decisions
- Important architectural or implementation decisions made
- Rationale for key choices
- Any trade-offs discussed

### Important Context
- Error messages or issues encountered and their resolutions
- Dependencies or external systems involved
- Any other information critical for continuing the work

## Guidelines

1. Be concise but complete - include all information needed to continue the work
2. Use specific names (file paths, function names, variable names) rather than vague descriptions
3. Preserve exact error messages and their resolutions
4. Keep the summary organized and scannable
5. Do not include general conversation pleasantries or acknowledgments
6. Focus on technical content and actionable information`;

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
