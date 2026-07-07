import { z } from "zod";

import { getEnv } from "../../env.js";

import { defineServerTool } from "./tanstack/define-tool.js";
import { getFile, getFileModifiedTime, withDuration } from "./util/helpers.js";
import { toolOutputBaseSchema } from "./util/types.js";

export const createCopyFileTool = () => {
  return defineServerTool({
    name: "copy_file",
    description:
      "Copies a file from a source path to a destination path. Requires the modifiedTime from a previous read operation to ensure the source file hasn't been modified since it was read.",
    inputSchema: z.object({
      sourcePath: z.string().describe("The path to the file to copy, relative to the project directory."),
      modifiedTime: z
        .string()
        .describe(
          "The modification timestamp from the read_file_tool response. Used to verify the source file hasn't changed since it was read."
        ),
      targetPath: z
        .string()
        .describe(
          "The path to the destination where the file should be copied, relative to the project directory. If the file already exists, it will throw an error."
        ),
    }),
    outputSchema: z.object({
      sourcePath: z.string().describe("The source path of the file that was copied."),
      targetPath: z.string().describe("The destination path where the file was copied to."),
      modifiedTime: z.string().describe("The modification timestamp of the new file."),
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
            `File has been modified since it was read. Expected modifiedTime: ${modifiedTime}, current: ${currentModifiedTime}. Please read the file again before copying.`
          );
        }

        const fs = getEnv().fs;
        const targetExists = await fs.exists(targetPath);

        if (targetExists) {
          throw new Error(`Target file already exists: ${targetPath}`);
        }

        await fs.writeFile(targetPath, fileRes.content);

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

export const createCopyFileTools = createCopyFileTool;
