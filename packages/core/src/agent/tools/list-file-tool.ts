import { tool } from "ai";
import { z } from "zod";

import { OUTPUT_LIMITS, withDuration } from "./helpers.js";
import { listFileOutputSchema } from "./types.js";

import type { Sandbox } from "../../environment";

/** Default number of entries to return per page */
const DEFAULT_LIMIT = OUTPUT_LIMITS.MAX_ARRAY_ITEMS;

/**
 * Creates a list-file tool using Vercel AI SDK.
 *
 * This tool lists files and directories in the specified directory.
 * Returns the name, type (file or directory), size, and modification date.
 * Supports pagination with offset/limit parameters.
 */
export const createListFileTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description:
      "Lists files and directories in the specified directory. Returns the name, type (file or directory), size, and modification date for each entry. Supports pagination with offset/limit.",
    inputSchema: z.object({
      path: z
        .string()
        .optional()
        .describe(
          "The path to the directory to list, relative to the project directory. Defaults to current directory."
        ),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Number of entries to skip (0-indexed). Use for pagination. Defaults to 0."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(DEFAULT_LIMIT)
        .optional()
        .describe(`Maximum number of entries to return. Defaults to ${DEFAULT_LIMIT}.`),
    }),
    outputSchema: listFileOutputSchema,
    execute: async ({ path: inputPath, offset, limit }) => {
      return withDuration(async () => {
        const path = inputPath ?? ".";
        const skip = offset ?? 0;
        const take = limit ?? DEFAULT_LIMIT;

        const exists = await sandbox.filesystem.exists(path);

        if (!exists) {
          throw new Error(`Directory does not exist: ${path}`);
        }

        const allEntries = await sandbox.filesystem.readdir(path);

        // Apply pagination
        const paginatedEntries = allEntries.slice(skip, skip + take);
        const hasMore = allEntries.length > skip + take;
        const totalEntries = allEntries.length;

        // Build message with pagination info
        let message = `Listed ${paginatedEntries.length} entries in: ${path}`;
        if (skip > 0) {
          message += ` (offset: ${skip})`;
        }
        if (hasMore) {
          const nextOffset = skip + take;
          message += `. Use offset=${nextOffset} to see more (${totalEntries - skip - take} remaining).`;
        }

        return {
          path,
          entries: paginatedEntries.map((entry) => ({
            name: entry.name,
            type: entry.type,
            size: entry.size,
            modified: entry.modified?.toISOString(),
          })),
          count: paginatedEntries.length,
          totalEntries,
          offset: skip,
          hasMore,
          nextOffset: hasMore ? skip + take : null,
          message,
        };
      });
    },
  });
};
