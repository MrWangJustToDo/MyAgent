import { tool } from "ai";
import { z } from "zod";

import { getFileModifiedTime } from "./helpers.js";

import type { Sandbox } from "../../environment";

/**
 * Creates a delete-file tool using Vercel AI SDK.
 *
 * This tool deletes a file or directory from the sandbox filesystem.
 * Requires the modifiedTime from a previous read operation to ensure
 * the file hasn't been modified since it was read.
 *
 * Requires user approval before execution.
 */
export const createDeleteFileTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description:
      "Deletes a file or directory from the sandbox filesystem. Requires the modifiedTime from a previous read operation to ensure the file hasn't been modified since it was read.",
    inputSchema: z.object({
      path: z.string().describe("The path to the file or directory to delete, relative to the project directory."),
      modifiedTime: z
        .string()
        .describe(
          "The modification timestamp from the read_file_tool response. Used to verify the file hasn't changed since it was read."
        ),
    }),
    outputSchema: z.object({
      path: z.string().describe("The path of the file or directory that was deleted."),
      message: z.string().describe("Human-readable summary of the operation."),
    }),
    needsApproval: true,
    execute: async ({ path, modifiedTime }) => {
      // Validate modification time
      const currentModifiedTime = await getFileModifiedTime(sandbox, path);
      if (currentModifiedTime !== modifiedTime) {
        throw new Error(
          `File has been modified since it was read. Expected modifiedTime: ${modifiedTime}, current: ${currentModifiedTime}. Please read the file again before deleting.`
        );
      }

      await sandbox.filesystem.remove(path);

      return {
        path,
        message: `Successfully deleted: ${path}`,
      };
    },
  });
};
