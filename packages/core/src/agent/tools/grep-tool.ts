import { tool } from "ai";
import { z } from "zod";

import { OUTPUT_LIMITS, withDuration } from "./helpers.js";
import { grepOutputSchema } from "./types.js";

import type { Sandbox } from "../../environment";

/** Maximum characters per matching line content (to prevent context overflow) */
const MAX_CONTENT_LENGTH = 500;

/** Maximum total characters for all match content combined */
const MAX_TOTAL_CONTENT = OUTPUT_LIMITS.MAX_CONTENT_CHARS;

/** Default number of matches per page */
const DEFAULT_LIMIT = 100;

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
 * Supports pagination with offset/limit parameters.
 */
export const createGrepTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description:
      "Searches file contents using regular expressions. Returns file paths and line numbers with matching content. Uses `grep` command internally. Supports pagination with offset/limit.",
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
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Number of matches to skip (0-indexed). Use for pagination. Defaults to 0."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe(`Maximum number of matches to return. Defaults to ${DEFAULT_LIMIT}.`),
    }),
    outputSchema: grepOutputSchema,
    execute: async ({ pattern, path, include, ignoreCase, offset, limit }) => {
      return withDuration(async () => {
        const searchPath = path ?? ".";
        const skip = offset ?? 0;
        const take = limit ?? DEFAULT_LIMIT;

        // We need to fetch more results to support pagination
        const fetchCount = skip + take + 1;

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

        // Limit results (fetch more than needed for pagination)
        grepCommand += ` | head -n ${fetchCount}`;

        // Add 2>/dev/null to suppress errors for non-readable files
        grepCommand += " 2>/dev/null || true";

        const result = await sandbox.runCommand(grepCommand);

        let totalContentLength = 0;
        let contentTruncated = false;

        const allMatches = result.stdout
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

        // Apply pagination
        const paginatedMatches = allMatches.slice(skip, skip + take);
        const hasMore = allMatches.length > skip + take;

        // Build message
        let message = `Found ${paginatedMatches.length} matches for pattern: ${pattern}`;
        if (skip > 0) {
          message += ` (offset: ${skip})`;
        }
        if (hasMore) {
          const nextOffset = skip + take;
          message += `. Use offset=${nextOffset} to see more.`;
        }
        if (contentTruncated) {
          message += " (some content truncated)";
        }

        return {
          pattern,
          path: searchPath,
          include: include ?? "*",
          matches: paginatedMatches,
          count: paginatedMatches.length,
          offset: skip,
          hasMore,
          nextOffset: hasMore ? skip + take : null,
          contentTruncated,
          message,
        };
      });
    },
  });
};
