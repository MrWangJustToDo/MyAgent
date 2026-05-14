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
 * System prompt for the compaction subagent.
 * This tells the LLM its role is to summarize, not to continue the conversation.
 *
 * Based on OpenCode's compaction.txt prompt.
 */
export const COMPACTION_SYSTEM_PROMPT = `You are a helpful AI assistant tasked with summarizing conversations.

When asked to summarize, provide a detailed but concise summary of the conversation.
Focus on information that would be helpful for continuing the conversation, including:
- What was done
- What is currently being worked on
- Which files are being modified
- What needs to be done next
- Key user requests, constraints, or preferences that should persist
- Important technical decisions and why they were made
- What issues are currently blocked and why
- If images or files were shared, describe what they contained and what was discussed about them

Your summary should be comprehensive enough to provide context but concise enough to be quickly understood.

Do not respond to any questions in the conversation, only output the summary.`;

/**
 * The core compaction prompt template (used as the final user message).
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

## Key Decisions

- **[Decision]**: [Brief rationale and context for why this decision was made]
- **[Technical approach]**: [Reasoning behind architecture or implementation choices]

## Blocked

[What issues are currently blocking progress, if any. Include error messages, investigation findings, and what was tried.]

## Relevant files / directories

[Construct a structured list of relevant files that have been read, edited, or created that pertain to the task at hand. If all the files in a directory are relevant, include the path to the directory.]
---

Be concise but complete. Include specific file paths, function names, and technical details.`;

/**
 * UPDATE compaction prompt template — used when a previous summary already exists.
 *
 * Based on PI's UPDATE_SUMMARIZATION_PROMPT, this tells the LLM to preserve
 * existing summary information and only add/update what's changed.
 *
 * The existing summary is passed via <previous-summary> tags in the prompt text.
 */
export const UPDATE_COMPACTION_PROMPT = `The conversation above contains new messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- PRESERVE exact file paths, function names, and error messages
- If something is no longer relevant, you may remove it

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

## Key Decisions

- **[Decision]**: [Brief rationale and context for why this decision was made]
- Update or remove decisions that are no longer relevant

## Blocked

[What issues are currently blocking progress, if any. Include error messages, investigation findings, and what was tried.]
- Update or remove resolved blockages

## Relevant files / directories

[Construct a structured list of relevant files that have been read, edited, or created that pertain to the task at hand. If all the files in a directory are relevant, include the path to the directory.]
---

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

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
 * Build the compaction prompt with optional focus guidance, active todos,
 * and existing summary for incremental updates.
 *
 * @param options - Prompt configuration
 * @param options.focus - Optional focus area to emphasize in summarization
 * @param options.todos - Optional list of active todos to include in summary
 * @param options.existingSummary - Previous summary text (triggers update mode with <previous-summary> tags)
 * @returns The complete prompt string
 *
 * @example
 * ```typescript
 * // Basic prompt (first compaction)
 * const prompt = buildCompactionPrompt();
 *
 * // Incremental update prompt (subsequent compactions)
 * const prompt = buildCompactionPrompt({
 *   existingSummary: "## Goal\n...",
 * });
 *
 * // With focus and todos
 * const prompt = buildCompactionPrompt({
 *   focus: "preserve the API design decisions",
 *   todos: [{ content: "Implement user auth", status: "in_progress", priority: "high" }],
 *   existingSummary: "## Goal\n...",
 * });
 * ```
 */
export function buildCompactionPrompt(options?: {
  focus?: string;
  todos?: CompactionTodoItem[];
  existingSummary?: string;
}): string {
  const { focus, todos, existingSummary } = options ?? {};

  const parts: string[] = [];

  // If we have an existing summary, wrap it in <previous-summary> tags
  // and use the update prompt. The conversation history (initialMessages)
  // should NOT include this old summary message — it's passed here instead.
  if (existingSummary) {
    parts.push(`<previous-summary>\n${existingSummary}\n</previous-summary>`);
    parts.push("");
    parts.push(UPDATE_COMPACTION_PROMPT);
  } else {
    parts.push(COMPACTION_PROMPT);
  }

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
