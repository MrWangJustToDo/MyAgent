import { z } from "zod";

import { getEnv } from "../../env.js";

import { defineServerTool } from "./tanstack/define-tool.js";
import { getFile, getFileModifiedTime, withDuration } from "./util/helpers.js";
import { toolOutputBaseSchema } from "./util/types.js";

export const createMoveFileTool = () => {
  return defineServerTool({
    name: "move_file",
    description:
      "Moves or renames a file from a source path to a destination path. Requires the modifiedTime from a previous read operation to ensure the file hasn't been modified since it was read. The source file will be removed after successful copy to destination.",
    inputSchema: z.object({
      sourcePath: z.string().describe("The path to the file to move, relative to the project directory."),
      modifiedTime: z
        .string()
        .describe(
          "The modification timestamp from the read_file_tool response. Used to verify the file hasn't changed since it was read."
        ),
      targetPath: z
        .string()
        .describe(
          "The destination path where the file should be moved to, relative to the project directory. If the target file already exists, it will throw an error."
        ),
    }),
    outputSchema: z.object({
      sourcePath: z.string().describe("The original path of the file that was moved."),
      targetPath: z.string().describe("The new path where the file was moved to."),
      modifiedTime: z.string().describe("The modification timestamp of the file at the new location."),
      durationMs: z.number().describe("Execution duration in milliseconds."),
      ...toolOutputBaseSchema.shape,
    }),
    needsApproval: true,
    execute: async ({ sourcePath, modifiedTime, targetPath }) => {
      return withDuration(async () => {
        const fileRes = await getFile(sourcePath);
        const currentModifiedTime = fileRes.modifiedTime;

        if (currentModifiedTime !== modifiedTime) {
          throw new Error(
            `File has been modified since it was read. Expected modifiedTime: ${modifiedTime}, current: ${currentModifiedTime}. Please read the file again before moving.`
          );
        }

        const fs = getEnv().fs;
        const targetExists = await fs.exists(targetPath);

        if (targetExists) {
          throw new Error(`Target file already exists: ${targetPath}`);
        }

        await fs.writeFile(targetPath, fileRes.content);
        await fs.remove(sourcePath);

        const newModifiedTime = await getFileModifiedTime(targetPath);

        return {
          sourcePath,
          targetPath,
          modifiedTime: newModifiedTime,
        };
      });
    },
  });
};
