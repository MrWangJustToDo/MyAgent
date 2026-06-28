import { tool } from "ai";
import { z } from "zod";

import { getEnv } from "../../env.js";

import { fuzzyIncludes, fuzzyCount, fuzzyReplace, fuzzyReplaceAll } from "./util/fuzzy-match.js";
import { getFile, getFileModifiedTime, withDuration } from "./util/helpers.js";
import { editFileOutputSchema } from "./util/types.js";

// ============================================================================
// Types
// ============================================================================

interface EditOperation {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
  startLine?: number;
}

interface EditResult {
  replacements: number;
  oldString: string;
  newString: string;
  startLine?: number;
  actualLine?: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Find the line number (1-indexed) where a substring appears in content.
 * Returns the first occurrence line, or -1 if not found.
 */
function findLineNumber(content: string, substring: string): number {
  const index = content.indexOf(substring);
  if (index === -1) {
    return -1;
  }
  // Count newlines before the index
  const before = content.substring(0, index);
  return before.split("\n").length;
}

/**
 * Validate that a match is near the expected start line.
 * Allows a tolerance of 5 lines for fuzzy matching differences.
 */
function validateStartLine(content: string, oldString: string, expectedLine: number, tolerance = 5): number {
  const actualLine = findLineNumber(content, oldString);
  if (actualLine === -1) {
    return -1;
  }

  if (Math.abs(actualLine - expectedLine) > tolerance) {
    throw new Error(
      `oldString found at line ${actualLine}, but expected near line ${expectedLine}. ` +
        `The file may have changed or the startLine is incorrect. Please read the file again.`
    );
  }

  return actualLine;
}

// ============================================================================
// Main Tool
// ============================================================================

/**
 * Creates an edit-file tool using Vercel AI SDK.
 *
 * This tool edits a file by replacing occurrences of oldString with newString.
 * Supports multiple edits in a single call via the `edits` array.
 * Requires the modifiedTime from a previous read operation to ensure
 * the file hasn't been modified since it was read.
 *
 * Requires user approval before execution.
 */
export const createEditFileTool = () => {
  return tool({
    description: `Edits a file by replacing occurrences of oldString with newString. Supports multiple edits in a single call via the \`edits\` array.

**Key Rules:**
- Requires modifiedTime from a previous read_file call to prevent concurrent modifications.
- IMPORTANT: Use actual newline characters (not escaped \\\\n) in oldString and newString.
- For multiple independent edits, use the \`edits\` array (more efficient, fewer round-trips).
- Each edit must have a unique oldString that appears exactly once in the file (unless replaceAll is true).
- Edits are applied sequentially in the order provided.
- **Fuzzy Matching**: Handles common Unicode issues like smart quotes, dashes, and special spaces that LLMs sometimes produce.`,
    inputSchema: z.object({
      path: z.string().describe("The path to the file to edit, relative to the project directory."),
      modifiedTime: z
        .string()
        .describe(
          "The modification timestamp from the read_file_tool response. Used to verify the file hasn't changed since it was read."
        ),
      oldString: z
        .string()
        .optional()
        .describe("The exact string to search for and replace in the file. Use this for single edits."),
      newString: z
        .string()
        .optional()
        .describe("The string to replace oldString with. Required if oldString is provided."),
      startLine: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("The 1-indexed line number where oldString starts in the file. Required for diff display."),
      replaceAll: z
        .boolean()
        .optional()
        .describe("If true, replace all occurrences of oldString. If false, replace only the first occurrence."),
      edits: z
        .array(
          z.object({
            oldString: z.string().describe("The exact string to search for and replace."),
            newString: z.string().describe("The string to replace oldString with."),
            replaceAll: z.boolean().optional().describe("If true, replace all occurrences of this string."),
          })
        )
        .optional()
        .describe(
          "Array of edit operations to apply sequentially. Use this for multiple independent edits in a single call."
        ),
    }),
    outputSchema: editFileOutputSchema,
    needsApproval: true,
    execute: async ({ path, modifiedTime, oldString, newString, startLine, replaceAll, edits }) => {
      return withDuration(async () => {
        // Build the list of edits to apply
        const editOperations: EditOperation[] = [];

        // Legacy single-edit mode
        if (oldString !== undefined) {
          if (newString === undefined) {
            throw new Error("newString is required when oldString is provided");
          }
          editOperations.push({
            oldString,
            newString,
            replaceAll,
            startLine,
          });
        }

        // Multi-edit mode
        if (edits && edits.length > 0) {
          if (editOperations.length > 0) {
            throw new Error("Cannot use both oldString/newString and edits array. Use one or the other.");
          }
          for (const edit of edits) {
            editOperations.push({
              oldString: edit.oldString,
              newString: edit.newString,
              replaceAll: edit.replaceAll,
            });
          }
        }

        if (editOperations.length === 0) {
          throw new Error("No edits provided. Use either oldString/newString or the edits array.");
        }

        // Read file and check modification time
        const fileRes = await getFile(path);
        const currentModifiedTime = fileRes.modifiedTime;

        if (currentModifiedTime !== modifiedTime) {
          throw new Error(
            `File has been modified since it was read. Expected modifiedTime: ${modifiedTime}, current: ${currentModifiedTime}. Please read the file again before editing.`
          );
        }

        let content = fileRes.content;
        const results: EditResult[] = [];

        // Apply edits sequentially with fuzzy matching
        for (const edit of editOperations) {
          // Try exact match first, then fall back to fuzzy match
          const hasExactMatch = content.includes(edit.oldString);
          const hasFuzzyMatch = fuzzyIncludes(content, edit.oldString);

          if (!hasExactMatch && !hasFuzzyMatch) {
            throw new Error(`oldString not found in file content: "${edit.oldString.substring(0, 100)}..."`);
          }

          // Validate startLine if provided
          let actualLine: number | undefined;
          if (edit.startLine !== undefined) {
            actualLine = validateStartLine(content, edit.oldString, edit.startLine);
            if (actualLine === -1) {
              throw new Error(`oldString not found in file content: "${edit.oldString.substring(0, 100)}..."`);
            }
          }

          // Count occurrences (prefer exact, fall back to fuzzy)
          const occurrences = hasExactMatch
            ? content.split(edit.oldString).length - 1
            : fuzzyCount(content, edit.oldString);

          if (occurrences > 1 && !edit.replaceAll) {
            throw new Error(
              `Found ${occurrences} matches for oldString: "${edit.oldString.substring(0, 50)}...". Set replaceAll to true to replace all occurrences, or provide more context to make it unique.`
            );
          }

          // Apply the edit (prefer exact, fall back to fuzzy)
          let newContent: string;
          if (hasExactMatch) {
            newContent = edit.replaceAll
              ? content.replaceAll(edit.oldString, edit.newString)
              : content.replace(edit.oldString, edit.newString);
          } else {
            // Use fuzzy replacement
            newContent = edit.replaceAll
              ? fuzzyReplaceAll(content, edit.oldString, edit.newString)
              : fuzzyReplace(content, edit.oldString, edit.newString);
          }

          results.push({
            replacements: edit.replaceAll ? occurrences : 1,
            oldString: edit.oldString,
            newString: edit.newString,
            startLine: edit.startLine,
            actualLine,
          });

          content = newContent;
        }

        // Write the final content
        await getEnv().fs.writeFile(path, content);

        const newModifiedTime = await getFileModifiedTime(path);

        const totalReplacements = results.reduce((sum, r) => sum + r.replacements, 0);

        return {
          path,
          replacements: totalReplacements,
          modifiedTime: newModifiedTime,
          message: `Successfully edited file: ${path} (${results.length} edit(s), ${totalReplacements} replacement(s))`,
        };
      });
    },
  });
};
