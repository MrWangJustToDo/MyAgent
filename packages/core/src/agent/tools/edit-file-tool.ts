import { z } from "zod";

import { getEnv } from "../../env.js";

import { defineServerTool } from "./tanstack/define-tool.js";
import {
  fuzzyIncludes,
  fuzzyCount,
  fuzzyReplace,
  fuzzyReplaceAll,
  normalizeForFuzzyMatch,
} from "./util/fuzzy-match.js";
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

interface EditValidationError {
  oldString: string;
  reason: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Find the line number (1-indexed) where a substring appears in content.
 * Returns the first occurrence line, or -1 if not found.
 *
 * Uses indexOf + newline counting instead of substring+split to avoid
 * allocating a copy of the file prefix and an array of all lines.
 */
function findLineNumber(content: string, substring: string): number {
  const index = content.indexOf(substring);
  if (index === -1) {
    return -1;
  }
  // Count newlines in [0, index) — line number is newlineCount + 1.
  let line = 1;
  let from = 0;
  while (true) {
    const nl = content.indexOf("\n", from);
    if (nl === -1 || nl >= index) {
      break;
    }
    line++;
    from = nl + 1;
  }
  return line;
}

/**
 * Count non-overlapping occurrences of `needle` in `content` using indexOf.
 *
 * Replaces `content.split(needle).length - 1`, which allocates an array of
 * all segments (expensive for large files). indexOf-based counting only
 * walks the string once and allocates nothing.
 */
function countOccurrences(content: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let pos = 0;
  while ((pos = content.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

/**
 * Validate that a match is near the expected start line.
 * Allows a tolerance of 5 lines for fuzzy matching differences.
 * Returns the actual line number, or -1 if not found.
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
 * Creates an edit-file tool for replacing text in files.
 *
 * This tool edits a file by replacing occurrences of oldString with newString.
 * Supports multiple edits in a single call via the `edits` array.
 * Requires the modifiedTime from a previous read operation to ensure
 * the file hasn't been modified since it was read.
 *
 * All edits are validated before any are applied (atomic all-or-nothing).
 * Returns detailed per-edit results including found/replaced status.
 *
 * Requires user approval before execution.
 */
export const createEditFileTool = () => {
  return defineServerTool({
    name: "edit_file",
    description: `Edits a file by replacing occurrences of oldString with newString. Supports one or more edits in a single call via the \`edits\` array.

**Key Rules:**
- Requires modifiedTime from a previous read_file call to prevent concurrent modifications.
- IMPORTANT: Use actual newline characters (not escaped \\\\\\n) in oldString and newString.
- Each edit must have a unique oldString that appears exactly once in the file (unless replaceAll is true).
- Edits are applied sequentially in the order provided.
- **startLine**: Provide the 1-indexed line number where oldString starts (from the read_file output). Used for diff display and to validate the match location.
- **Fuzzy Matching**: Handles common Unicode issues like smart quotes, dashes, and special spaces that LLMs sometimes produce.`,
    inputSchema: z.object({
      path: z.string().describe("The path to the file to edit, relative to the project directory."),
      modifiedTime: z
        .string()
        .describe(
          "The modification timestamp from the read_file_tool response. Used to verify the file hasn't changed since it was read."
        ),
      edits: z
        .array(
          z.object({
            oldString: z.string().describe("The exact string to search for and replace."),
            newString: z.string().describe("The string to replace oldString with."),
            replaceAll: z.boolean().optional().describe("If true, replace all occurrences of this string."),
            startLine: z
              .number()
              .int()
              .min(1)
              .optional()
              .describe(
                "The 1-indexed line number where oldString starts in the file. Used for diff display and validation."
              ),
          })
        )
        .min(1)
        .describe("Array of edit operations to apply sequentially. For a single edit, pass an array with one element."),
    }),
    outputSchema: editFileOutputSchema,
    needsApproval: true,
    execute: async ({ path, modifiedTime, edits }) => {
      return withDuration(async () => {
        // ====================================================================
        // Phase 1: Build the list of edit operations
        // ====================================================================

        const editOperations: EditOperation[] = edits.map((edit) => ({
          oldString: edit.oldString,
          newString: edit.newString,
          replaceAll: edit.replaceAll,
          startLine: edit.startLine,
        }));

        // ====================================================================
        // Phase 2: Read file and check modification time
        // ====================================================================

        const fileRes = await getFile(path);
        const currentModifiedTime = fileRes.modifiedTime;

        if (currentModifiedTime !== modifiedTime) {
          throw new Error(
            `File has been modified since it was read. Expected modifiedTime: ${modifiedTime}, current: ${currentModifiedTime}. Please read the file again before editing.`
          );
        }

        // ====================================================================
        // Phase 3: Validate all edits before applying any (find errors early)
        // ====================================================================

        // Normalize the original content once and reuse across all edits'
        // fuzzy checks. Normalization is O(M); without this cache each edit
        // would re-scan the whole file.
        const normalizedOriginal = normalizeForFuzzyMatch(fileRes.content);

        const validationErrors: EditValidationError[] = [];
        for (const edit of editOperations) {
          // Check if string exists (try exact match first, then fall back to fuzzy)
          const hasExactMatch = fileRes.content.includes(edit.oldString);
          const hasFuzzyMatch = hasExactMatch || fuzzyIncludes(fileRes.content, edit.oldString, normalizedOriginal);

          if (!hasExactMatch && !hasFuzzyMatch) {
            validationErrors.push({
              oldString: edit.oldString.substring(0, 100),
              reason: "not found in file content",
            });
            continue;
          }

          // Validate startLine if provided
          if (edit.startLine !== undefined) {
            try {
              validateStartLine(fileRes.content, edit.oldString, edit.startLine);
            } catch (e) {
              validationErrors.push({
                oldString: edit.oldString.substring(0, 100),
                reason: e instanceof Error ? e.message : "startLine validation failed",
              });
              continue;
            }
          }

          // Check for multiple occurrences (unless replaceAll is set)
          if (!edit.replaceAll) {
            const occurrences = hasExactMatch
              ? countOccurrences(fileRes.content, edit.oldString)
              : fuzzyCount(fileRes.content, edit.oldString, normalizedOriginal);

            if (occurrences > 1) {
              validationErrors.push({
                oldString: edit.oldString.substring(0, 50),
                reason: `found ${occurrences} matches; set replaceAll to replace all, or provide more context to make it unique`,
              });
              continue;
            }
          }
        }

        // If any validation errors, throw with all of them listed
        if (validationErrors.length > 0) {
          const details = validationErrors.map((e) => `  - "${e.oldString}": ${e.reason}`).join("\n");
          throw new Error(`${validationErrors.length} edit(s) failed validation, no changes were made:\n${details}`);
        }

        // ====================================================================
        // Phase 4: Apply all edits (all validated, so this should succeed)
        // ====================================================================

        let content = fileRes.content;
        // Cache of the normalized `content`; invalidated whenever `content`
        // changes. Only (re)computed when a fuzzy path is actually needed.
        let normalizedContent = normalizedOriginal;
        let normalizedContentValid = true;
        const results: Array<{
          oldString: string;
          newString: string;
          found: boolean;
          replaced: boolean;
          count: number;
          startLine?: number;
          actualLine?: number;
        }> = [];

        for (const edit of editOperations) {
          // Try exact match first, then fall back to fuzzy match
          const hasExactMatch = content.includes(edit.oldString);

          // Ensure the normalized cache reflects the current `content`.
          if (!normalizedContentValid) {
            normalizedContent = normalizeForFuzzyMatch(content);
            normalizedContentValid = true;
          }

          // Count occurrences
          const occurrences = hasExactMatch
            ? countOccurrences(content, edit.oldString)
            : fuzzyCount(content, edit.oldString, normalizedContent);

          // Find actual line for result
          let actualLine: number | undefined;
          if (edit.startLine !== undefined) {
            actualLine = findLineNumber(content, edit.oldString);
          }

          // Apply the edit
          let newContent: string;
          if (hasExactMatch) {
            newContent = edit.replaceAll
              ? content.replaceAll(edit.oldString, edit.newString)
              : content.replace(edit.oldString, edit.newString);
          } else {
            newContent = edit.replaceAll
              ? fuzzyReplaceAll(content, edit.oldString, edit.newString, normalizedContent)
              : fuzzyReplace(content, edit.oldString, edit.newString, normalizedContent);
          }

          const replacementCount = edit.replaceAll ? occurrences : 1;

          results.push({
            oldString: edit.oldString.substring(0, 50) + (edit.oldString.length > 50 ? "..." : ""),
            newString: edit.newString.substring(0, 50) + (edit.newString.length > 50 ? "..." : ""),
            found: true,
            replaced: true,
            count: replacementCount,
            startLine: edit.startLine,
            actualLine,
          });

          if (newContent !== content) {
            content = newContent;
            normalizedContentValid = false; // content changed, invalidate cache
          }
        }

        // ====================================================================
        // Phase 5: Write the final content
        // ====================================================================

        await getEnv().fs.writeFile(path, content);

        // Re-read the file from disk to compute the modification identifier.
        // This guarantees the returned modifiedTime matches what read_file_tool
        // would produce (both hash the on-disk content via getFile/getFileModifiedTime).
        // Using the in-memory `content` instead would risk a mismatch if the
        // CoreEnv writeFile/readFile pair isn't perfectly symmetric (e.g. remote
        // mode, encoding edge cases), which would trigger false conflict
        // detection on the next edit.
        const newModifiedTime = await getFileModifiedTime(path);

        const totalReplacements = results.reduce((sum, r) => sum + r.count, 0);

        return {
          path,
          replacements: totalReplacements,
          modifiedTime: newModifiedTime,
          // Capture the original content (before any edit) and the final
          // content (after all edits, identical to what was written to disk)
          // so the UI can render a full-file diff without re-reading the file
          // — which would be stale once other edits touch it later.
          oldFile: fileRes.content,
          newFile: content,
          results,
        };
      });
    },
  });
};
