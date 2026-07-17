import { z } from "zod";

import { getEnv } from "../../env.js";

import { defineServerTool } from "./tanstack/define-tool.js";
import { getFileModifiedTime, withDuration } from "./util/helpers.js";
import { toolOutputBaseSchema } from "./util/types.js";

export const createDeleteFileTool = () => {
  return defineServerTool({
    name: "delete_file",
    description:
      "Deletes a file or directory. Requires the modifiedTime from a previous read operation to ensure the file hasn't been modified since it was read.",
    inputSchema: z.object({
      path: z.string().describe("The path to the file or directory to delete, relative to the project directory."),
      modifiedTime: z
        .string({ message: "modifiedTime: must be a string" })
        .describe(
          "The modification timestamp from the read_file_tool response. Used to verify the file hasn't changed since it was read."
        ),
    }),
    outputSchema: z.object({
      path: z.string().describe("The path of the file or directory that was deleted."),
      durationMs: z.number().describe("Execution duration in milliseconds."),
      ...toolOutputBaseSchema.shape,
    }),
    needsApproval: true,
    execute: async ({ path, modifiedTime }) => {
      return withDuration(async () => {
        const currentModifiedTime = await getFileModifiedTime(path);
        if (currentModifiedTime !== modifiedTime) {
          throw new Error(
            `File has been modified since it was read. Expected modifiedTime: ${modifiedTime}, current: ${currentModifiedTime}. Please read the file again before deleting.`
          );
        }

        await getEnv().fs.remove(path);

        return { path };
      });
    },
  });
};
