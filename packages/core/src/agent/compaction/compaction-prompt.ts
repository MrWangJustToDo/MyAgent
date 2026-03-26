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
 * - What goal(s) the user is trying to accomplish
 * - What important instructions the user gave
 * - What notable things were learned (discoveries)
 * - What work was done, is in progress, or remains
 * - Which files are relevant
 */
export const COMPACTION_PROMPT = `Provide a detailed prompt for continuing the conversation above.
Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next.
The summary that you construct will be used so that another agent can read it and continue the work.

When constructing the summary, stick to this template:
---
## Goal

[What goal(s) is the user trying to accomplish?]

## Instructions

- [What important instructions did the user give you that are relevant]
- [If there is a plan or spec, include information about it so next agent can continue using it]

## Discoveries

[What notable things were learned during this conversation that would be useful for the next agent to know when continuing the work]

## Accomplished

[What work has been completed, what work is still in progress, and what work is left?]

## Relevant files / directories

[Construct a structured list of relevant files that have been read, edited, or created that pertain to the task at hand. If all the files in a directory are relevant, include the path to the directory.]
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

  const parts: string[] = [COMPACTION_PROMPT];

  if (focus) {
    parts.push(`\n## Special Focus\n\nPay particular attention to preserving information about: ${focus}`);
  }

  // Include active todos if provided - these go in the Accomplished section
  if (todos && todos.length > 0) {
    parts.push(
      `\n## Active Todo List\n\nThe following todos are currently active and should be included in the "Accomplished" section:\n`
    );

    for (const todo of todos) {
      const statusIcon =
        todo.status === "in_progress" ? "[IN PROGRESS]" : todo.status === "completed" ? "[DONE]" : "[PENDING]";
      const priorityLabel =
        todo.priority === "high" ? "(high priority)" : todo.priority === "low" ? "(low priority)" : "";
      parts.push(`- ${statusIcon} ${todo.content} ${priorityLabel}`.trim());
    }
  }

  return parts.join("\n");
}
