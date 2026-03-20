import { z } from "zod";

// ============================================================================
// Tool Output Schemas
// ============================================================================

export const listFileOutputSchema = z.object({
  path: z.string().describe("The directory path that was listed."),
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
  count: z.number().describe("Number of entries in the directory."),
  message: z.string().describe("Human-readable summary of the operation."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
});

export const runCommandOutputSchema = z.object({
  command: z.string().describe("The command that was executed."),
  stdout: z.string().describe("Standard output from the command."),
  stderr: z.string().describe("Standard error output from the command."),
  exitCode: z.number().describe("Exit code of the command (0 = success)."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
  success: z.boolean().describe("Whether the command succeeded (exit code 0)."),
  message: z.string().describe("Human-readable summary of the operation."),
});

export const readFileOutputSchema = z.object({
  path: z.string().describe("The file path that was read."),
  content: z.string().describe("The file content (may be partial if offset/limit used)."),
  modifiedTime: z.string().describe("ISO timestamp of last modification."),
  totalLines: z.number().describe("Total number of lines in the file."),
  startLine: z.number().describe("Starting line number (0-indexed)."),
  endLine: z.number().describe("Ending line number (exclusive)."),
  linesReturned: z.number().describe("Number of lines returned."),
  message: z.string().describe("Human-readable summary of the operation."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
});

export const writeFileOutputSchema = z.object({
  path: z.string().describe("The file path that was written."),
  bytesWritten: z.number().describe("Number of bytes written."),
  created: z.boolean().describe("Whether a new file was created (vs overwritten)."),
  modifiedTime: z.string().describe("ISO timestamp of the new modification time."),
  message: z.string().describe("Human-readable summary of the operation."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
});

export const editFileOutputSchema = z.object({
  path: z.string().describe("The file path that was edited."),
  replacements: z.number().describe("Number of replacements made."),
  modifiedTime: z.string().describe("The new modification timestamp after editing."),
  message: z.string().describe("Human-readable summary of the operation."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
});

export const globOutputSchema = z.object({
  pattern: z.string().describe("The glob pattern that was searched."),
  path: z.string().describe("The directory that was searched."),
  files: z.array(z.string()).describe("Array of matching file paths."),
  count: z.number().describe("Number of files found."),
  message: z.string().describe("Human-readable summary of the operation."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
});

export const grepOutputSchema = z.object({
  pattern: z.string().describe("The regex pattern that was searched."),
  path: z.string().describe("The directory that was searched."),
  include: z.string().describe("The file filter pattern used."),
  matches: z
    .array(
      z.object({
        file: z.string().describe("File path containing the match."),
        lineNumber: z.number().describe("Line number of the match (1-indexed)."),
        content: z.string().describe("Content of the matching line."),
      })
    )
    .describe("Array of matches found."),
  count: z.number().describe("Total number of matches found."),
  truncated: z.boolean().describe("Whether results were truncated due to limit."),
  message: z.string().describe("Human-readable summary of the operation."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
});

export const todoOutputSchema = z.object({
  success: z.boolean().describe("Whether the update was successful."),
  title: z.string().describe("Title for the current todo set."),
  todoList: z.string().describe("Rendered todo list for display."),
  stats: z
    .object({
      total: z.number().describe("Total number of todos."),
      completed: z.number().describe("Number of completed todos."),
      inProgress: z.number().describe("Number of in-progress todos."),
      pending: z.number().describe("Number of pending todos."),
    })
    .describe("Todo completion statistics."),
  message: z.string().describe("Human-readable summary of the operation."),
  durationMs: z.number().describe("Execution duration in milliseconds."),
});

// ============================================================================
// Tool Output Types
// ============================================================================

export type ListFileOutput = z.infer<typeof listFileOutputSchema>;
export type RunCommandOutput = z.infer<typeof runCommandOutputSchema>;
export type ReadFileOutput = z.infer<typeof readFileOutputSchema>;
export type WriteFileOutput = z.infer<typeof writeFileOutputSchema>;
export type EditFileOutput = z.infer<typeof editFileOutputSchema>;
export type GlobOutput = z.infer<typeof globOutputSchema>;
export type GrepOutput = z.infer<typeof grepOutputSchema>;
export type TodoOutput = z.infer<typeof todoOutputSchema>;
