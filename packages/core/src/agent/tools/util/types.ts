import { z } from "zod";

import { TODO_PRIORITIES, TODO_STATUSES } from "../../todo-manager/types.js";

// ============================================================================
// Tool Output Base Schema (common fields shared by all tool outputs)
// ============================================================================

/**
 * Common fields every tool output inherits.
 *
 * - `cachedOutputPath`: path to a disk-cached copy of large output, or `null`
 *   when no caching occurred. Standardized across all tools so the UI and LLM
 *   can rely on it being present.
 *
 * Errors are NOT represented in the output schema — tools throw on failure,
 * and the AI SDK surfaces the error via the `output-error` tool state
 * (`part.errorText` on the UI side). This keeps the success output clean and
 * avoids a redundant `error: null` field on every successful result.
 */
export const toolOutputBaseSchema = z.object({
  cachedOutputPath: z
    .string()
    .nullable()
    .describe("Path to cached full output on disk, or null when no caching occurred."),
});

// ============================================================================
// Tool Output Schemas
// ============================================================================

export const listFileOutputSchema = z.object({
  entries: z
    .array(
      z.object({
        name: z.string().describe("Name of the file or directory."),
        type: z.string().describe("Type: 'file' or 'directory'."),
        size: z.number().optional().describe("Size in bytes (for files)."),
        modified: z.string().optional().describe("ISO timestamp of last modification."),
      })
    )
    .describe("Array of directory entries."),
  offset: z.number().describe("The offset used for pagination (0-indexed)."),
  limit: z.number().describe("The limit used for pagination."),
  count: z.number().describe("Number of entries returned in this page."),
  totalEntries: z.number().describe("Total number of entries in the directory."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  ...toolOutputBaseSchema.shape,
});

export const runCommandOutputSchema = z.object({
  command: z.string().describe("The command that was executed."),
  stdout: z.string().describe("Standard output from the command."),
  stderr: z.string().describe("Standard error output from the command."),
  exitCode: z.number().describe("Exit code of the command (0 = success)."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  success: z.boolean().describe("Whether the command succeeded (exit code 0)."),
  ...toolOutputBaseSchema.shape,
});

// Note: readFileOutputSchema is now defined in read-file-tool.ts
// as a discriminated union to support multiple file types (text, image, pdf, directory, error)

export const writeFileOutputSchema = z.object({
  path: z.string().describe("The file path that was written."),
  bytesWritten: z.number().describe("Number of bytes written."),
  created: z.boolean().describe("Whether a new file was created (vs overwritten)."),
  modifiedTime: z.string().describe("ISO timestamp of the new modification time."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  ...toolOutputBaseSchema.shape,
});

export const editFileOutputSchema = z.object({
  path: z.string().describe("The file path that was edited."),
  replacements: z.number().describe("Number of replacements made."),
  modifiedTime: z.string().describe("The new modification timestamp after editing."),
  oldFile: z.string().describe("The original file content before any edits were applied."),
  newFile: z.string().describe("The full file content after all edits have been applied."),
  results: z
    .array(
      z.object({
        oldString: z.string().describe("The search string (truncated if long)."),
        newString: z.string().describe("The replacement string."),
        found: z.boolean().describe("Whether the string was found in the file."),
        replaced: z.boolean().describe("Whether the replacement was made."),
        count: z.number().describe("Number of occurrences replaced."),
        startLine: z.number().optional().describe("Expected start line (1-indexed)."),
        actualLine: z.number().optional().describe("Actual line where match was found (1-indexed)."),
      })
    )
    .describe("Details of each edit operation."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  ...toolOutputBaseSchema.shape,
});

export const globOutputSchema = z.object({
  files: z.array(z.string()).describe("Array of matching file paths."),
  offset: z.number().describe("The offset used for pagination (0-indexed)."),
  limit: z.number().describe("The limit used for pagination."),
  content: z.string().describe("The full glob output as a string (for caching)."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  ...toolOutputBaseSchema.shape,
});

export const grepOutputSchema = z.object({
  matches: z
    .array(
      z.object({
        file: z.string().describe("File path containing the match."),
        lineNumber: z
          .number()
          .int()
          .nonnegative()
          .describe("Line number of the match (1-indexed). 0 when not applicable (e.g. files_with_matches)."),
        content: z.string().describe("Content of the matching line (empty in files_with_matches mode)."),
      })
    )
    .describe("Array of matches found."),
  offset: z.number().describe("The offset used for pagination (0-indexed)."),
  limit: z.number().describe("The limit used for pagination."),
  content: z.string().describe("The full grep output as a string (for caching)."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  ...toolOutputBaseSchema.shape,
});

export const todoOutputItemSchema = z.object({
  id: z.string().describe("Unique identifier for the todo."),
  content: z.string().describe("Description of the task."),
  status: z.enum(TODO_STATUSES).describe("Current status: pending | in_progress | completed."),
  priority: z.enum(TODO_PRIORITIES).describe("Priority level: high | medium | low."),
  createdAt: z.number().describe("Timestamp when created (ms epoch)."),
  updatedAt: z.number().describe("Timestamp when last updated (ms epoch)."),
});

export const todoOutputSchema = z.object({
  title: z.string().describe("Title for the current todo set."),
  /** Structured todo items for rich UI rendering. Mirrors the internal TodoItem list. */
  items: z.array(todoOutputItemSchema).describe("Structured todo items for UI rendering."),
  stats: z
    .object({
      total: z.number().describe("Total number of todos."),
      completed: z.number().describe("Number of completed todos."),
      inProgress: z.number().describe("Number of in-progress todos."),
      pending: z.number().describe("Number of pending todos."),
    })
    .describe("Todo completion statistics."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  ...toolOutputBaseSchema.shape,
});

// ============================================================================
// Tool Output Types
// ============================================================================

export type ListFileOutput = z.infer<typeof listFileOutputSchema>;
export type RunCommandOutput = z.infer<typeof runCommandOutputSchema>;
// Note: ReadFileOutput is now exported from read-file-tool.ts
export type WriteFileOutput = z.infer<typeof writeFileOutputSchema>;
export type EditFileOutput = z.infer<typeof editFileOutputSchema>;
export type GlobOutput = z.infer<typeof globOutputSchema>;
export type GrepOutput = z.infer<typeof grepOutputSchema>;
export type TodoOutput = z.infer<typeof todoOutputSchema>;
