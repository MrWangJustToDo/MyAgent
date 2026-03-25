import { tool } from "ai";
import { z } from "zod";

import { withDuration } from "./helpers.js";
import { grepOutputSchema } from "./types.js";

import type { Sandbox } from "../../environment";

/** Maximum characters per matching line content (to prevent context overflow) */
const MAX_CONTENT_LENGTH = 500;

/** Maximum total characters for all match content combined */
const MAX_TOTAL_CONTENT = 50000;

/**
 * Truncates a string to a maximum length with an ellipsis indicator.
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + "...[truncated]";
}

/**
 * Creates a grep tool using Vercel AI SDK.
 *
 * This tool searches file contents using regular expressions and returns
 * file paths and line numbers with matching content.
 */
export const createGrepTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description:
      "Searches file contents using regular expressions. Returns file paths and line numbers with matching content. Uses `grep` command internally.",
    inputSchema: z.object({
      pattern: z.string().describe("The regex pattern to search for in file contents."),
      path: z
        .string()
        .optional()
        .describe("The directory to search in, relative to the project directory. Defaults to current directory."),
      include: z
        .string()
        .optional()
        .describe(
          "File pattern to include in the search (e.g., '*.js', '*.{ts,tsx}'). If not specified, searches all files."
        ),
      ignoreCase: z.boolean().optional().describe("If true, perform case-insensitive matching. Defaults to false."),
      maxResults: z.number().int().min(1).optional().describe("Maximum number of matches to return. Defaults to 100."),
    }),
    outputSchema: grepOutputSchema,
    execute: async ({ pattern, path, include, ignoreCase, maxResults }) => {
      return withDuration(async () => {
        const searchPath = path ?? ".";
        const limit = maxResults ?? 100;

        // Build grep command
        let grepCommand = "grep -rn";

        if (ignoreCase) {
          grepCommand += " -i";
        }

        // Add include pattern if specified
        if (include) {
          grepCommand += ` --include="${include}"`;
        }

        // Escape the pattern for shell and add it
        const escapedPattern = pattern.replace(/"/g, '\\"');
        grepCommand += ` "${escapedPattern}" ${searchPath}`;

        // Limit results
        grepCommand += ` | head -n ${limit}`;

        // Add 2>/dev/null to suppress errors for non-readable files
        grepCommand += " 2>/dev/null || true";

        const result = await sandbox.runCommand(grepCommand);

        let totalContentLength = 0;
        let contentTruncated = false;

        const matches = result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => {
            // Parse grep output format: filename:lineNumber:content
            const firstColon = line.indexOf(":");
            const secondColon = line.indexOf(":", firstColon + 1);

            if (firstColon === -1 || secondColon === -1) {
              return { file: line, lineNumber: 0, content: "" };
            }

            let content = line.substring(secondColon + 1);

            // Truncate individual line content to prevent huge context
            if (content.length > MAX_CONTENT_LENGTH) {
              content = truncateContent(content, MAX_CONTENT_LENGTH);
              contentTruncated = true;
            }

            // Track total content size to prevent overwhelming the context
            totalContentLength += content.length;
            if (totalContentLength > MAX_TOTAL_CONTENT) {
              content = "[content omitted - total size limit reached]";
              contentTruncated = true;
            }

            return {
              file: line.substring(0, firstColon),
              lineNumber: parseInt(line.substring(firstColon + 1, secondColon), 10),
              content,
            };
          });

        const truncationNote = contentTruncated ? " (some content truncated for context limit)" : "";

        return {
          pattern,
          path: searchPath,
          include: include ?? "*",
          matches,
          count: matches.length,
          truncated: matches.length >= limit || contentTruncated,
          message: `Found ${matches.length} matches for pattern: ${pattern}${matches.length >= limit ? " (results truncated)" : ""}${truncationNote}`,
        };
      });
    },
  });
};
