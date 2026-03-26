import { tool } from "ai";
import { z } from "zod";

import { OUTPUT_LIMITS, withDuration } from "./helpers.js";
import { globOutputSchema } from "./types.js";

import type { Sandbox } from "../../environment";

/** Default number of files to return per page */
const DEFAULT_LIMIT = OUTPUT_LIMITS.MAX_ARRAY_ITEMS;

/**
 * Creates a glob tool using Vercel AI SDK.
 *
 * This tool finds files matching a glob pattern using the find command.
 * Supports pagination with offset/limit parameters.
 */
export const createGlobTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description:
      "Finds files matching a glob pattern. Supports patterns like '**/*.js', 'src/**/*.ts', '*.json', etc. Uses the `find` command internally. Supports pagination with offset/limit.",
    inputSchema: z.object({
      pattern: z.string().describe("The glob pattern to match files against (e.g., '**/*.js', 'src/**/*.ts')."),
      path: z
        .string()
        .optional()
        .describe("The directory to search in, relative to the project directory. Defaults to current directory."),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Number of files to skip (0-indexed). Use for pagination. Defaults to 0."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(DEFAULT_LIMIT)
        .optional()
        .describe(`Maximum number of files to return. Defaults to ${DEFAULT_LIMIT}.`),
    }),
    outputSchema: globOutputSchema,
    execute: async ({ pattern, path, offset, limit }) => {
      return withDuration(async () => {
        const searchPath = path ?? ".";
        const skip = offset ?? 0;
        const take = limit ?? DEFAULT_LIMIT;

        // Convert glob pattern to find command
        // We fetch more than needed to know if there are more results
        const fetchCount = skip + take + 1;
        let findCommand: string;

        if (pattern.includes("**")) {
          // Recursive pattern like **/*.js
          const namePattern = pattern.replace(/\*\*\//g, "");
          findCommand = `find ${searchPath} -type f -name "${namePattern}" 2>/dev/null | head -${fetchCount}`;
        } else if (pattern.includes("*")) {
          // Simple wildcard pattern like *.js
          findCommand = `find ${searchPath} -type f -name "${pattern}" 2>/dev/null | head -${fetchCount}`;
        } else {
          // Exact name match
          findCommand = `find ${searchPath} -type f -name "${pattern}" 2>/dev/null | head -${fetchCount}`;
        }

        const result = await sandbox.runCommand(findCommand);

        const allFiles = result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        // Apply pagination
        const paginatedFiles = allFiles.slice(skip, skip + take);
        const hasMore = allFiles.length > skip + take;

        // Build message with pagination info
        let message = `Found ${paginatedFiles.length} files matching pattern: ${pattern}`;
        if (skip > 0) {
          message += ` (offset: ${skip})`;
        }
        if (hasMore) {
          const nextOffset = skip + take;
          message += `. Use offset=${nextOffset} to see more.`;
        }

        return {
          pattern,
          path: searchPath,
          files: paginatedFiles,
          count: paginatedFiles.length,
          offset: skip,
          hasMore,
          nextOffset: hasMore ? skip + take : null,
          message,
        };
      });
    },
  });
};
