import { tool } from "ai";
import { z } from "zod";

import { getFile, getFileModifiedTime } from "./helpers";

import type { Sandbox } from "../../environment";

export const createMoveFileTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    title: "move-file-tool",
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
    inputExamples: [{ input: { sourcePath: "/src/old-name.ts", targetPath: "/src/new-name.ts", modifiedTime: "123" } }],
    needsApproval: true,
    outputSchema: z.object({
      sourcePath: z.string().describe("The original path of the file."),
      targetPath: z.string().describe("The new path of the file."),
      modifiedTime: z.string().describe("The modification timestamp of the moved file."),
      message: z.string().describe("A message describing the result."),
    }),
    execute: async ({ sourcePath, modifiedTime, targetPath }, { abortSignal }) => {
      if (abortSignal?.aborted) {
        throw new Error(abortSignal.reason as string);
      }

      // Validate modification time and get content
      const fileRes = await getFile(sandbox, sourcePath);
      const currentModifiedTime = fileRes.modifiedTime;

      if (currentModifiedTime !== modifiedTime) {
        throw new Error(
          `File has been modified since it was read. Expected modifiedTime: ${modifiedTime}, current: ${currentModifiedTime}. Please read the file again before moving.`
        );
      }

      const targetExists = await sandbox.filesystem.exists(targetPath);

      if (targetExists) {
        throw new Error(`Target file already exists: ${targetPath}`);
      }

      const content = fileRes.content;

      // Write to target location
      await sandbox.filesystem.writeFile(targetPath, content);

      // Remove source file
      await sandbox.filesystem.remove(sourcePath);

      // Get new modification time of target file
      const newModifiedTime = await getFileModifiedTime(sandbox, targetPath);

      return {
        sourcePath,
        targetPath,
        modifiedTime: newModifiedTime,
        message: `Successfully moved file from ${sourcePath} to ${targetPath}`,
      };
    },
  });
};
