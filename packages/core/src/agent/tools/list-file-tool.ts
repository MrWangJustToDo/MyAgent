import { tool } from "ai";
import { z } from "zod";

import { withDuration } from "./helpers.js";
import { listFileOutputSchema } from "./types.js";

import type { Sandbox } from "../../environment";

/**
 * Creates a list-file tool using Vercel AI SDK.
 *
 * This tool lists files and directories in the specified directory.
 * Returns the name, type (file or directory), size, and modification date.
 *
 * Requires user approval before execution.
 */
export const createListFileTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description:
      "Lists files and directories in the specified directory. Returns the name, type (file or directory), size, and modification date for each entry.",
    inputSchema: z.object({
      path: z
        .string()
        .optional()
        .describe(
          "The path to the directory to list, relative to the project directory. Defaults to current directory."
        ),
    }),
    outputSchema: listFileOutputSchema,
    needsApproval: true,
    execute: async ({ path: inputPath }) => {
      return withDuration(async () => {
        const path = inputPath ?? ".";

        const exists = await sandbox.filesystem.exists(path);

        if (!exists) {
          throw new Error(`Directory does not exist: ${path}`);
        }

        const entries = await sandbox.filesystem.readdir(path);

        return {
          path,
          entries: entries.map((entry) => ({
            name: entry.name,
            type: entry.type,
            size: entry.size,
            modified: entry.modified?.toISOString(),
          })),
          count: entries.length,
          message: `Listed ${entries.length} entries in: ${path}`,
        };
      });
    },
  });
};
