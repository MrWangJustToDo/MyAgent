import { tool } from "ai";
import { z } from "zod";

import { getEnv } from "../../env.js";

import { OUTPUT_LIMITS, withDuration } from "./util/helpers.js";
import { listFileOutputSchema } from "./util/types.js";

import type { ListFileOutput } from "./util/types.js";

/** Default number of entries to return per page */
const DEFAULT_LIMIT = OUTPUT_LIMITS.MAX_ARRAY_ITEMS;

/**
 * Creates a list-file tool using Vercel AI SDK.
 *
 * This tool lists files and directories in the specified directory.
 * Returns the name, type (file or directory), size, and modification date.
 * Supports pagination with offset/limit parameters.
 */
export const createListFileTool = () => {
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

        const fs = getEnv().fs;
        const exists = await fs.exists(path);

        if (!exists) {
          throw new Error(`Directory does not exist: ${path}`);
        }

        const allEntries = await fs.readdir(path);

        // Apply pagination
        const paginatedEntries = allEntries.slice(skip, skip + take);
        const totalEntries = allEntries.length;

        return {
          entries: paginatedEntries.map((entry) => ({
            name: entry.name,
            type: entry.type,
            size: entry.size,
            modified: entry.modified?.toISOString(),
          })),
          offset: skip,
          limit: take,
          count: paginatedEntries.length,
          totalEntries,
        };
      });
    },

    // Only send entries to the LLM — path is echoed in the input,
    // pagination metadata is for the UI only.
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: ListFileOutput }) {
      const lines = output.entries.map((e) => `${e.name}${e.type === "directory" ? "/" : ""}`);
      return {
        type: "content" as const,
        value: [
          {
            type: "text" as const,
            text:
              `<params> offset(current pagination): ${output.offset}; limit(Maximum number of items to return): ${output.limit} </params>` +
              lines.join("\n"),
          },
        ],
      };
    },
  });
};
