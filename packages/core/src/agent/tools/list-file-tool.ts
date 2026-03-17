import { tool } from "ai";
import { z } from "zod";

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
    outputSchema: z.object({
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
    }),
    needsApproval: true,
    execute: async ({ path: inputPath }) => {
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
    },
  });
};
