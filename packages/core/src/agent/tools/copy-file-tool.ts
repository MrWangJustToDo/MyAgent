import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { getFile, getFileModifiedTime } from "./helpers";

import type { Sandbox } from "../../environment";

export const createCopyFileTool = ({ sandbox }: { sandbox: Sandbox }) => {
  const tool = toolDefinition({
    name: "copy-file-tool",
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
    needsApproval: true,
    outputSchema: z.object({
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
      message: z.string().describe("The Result message of copy tool"),
    }),
  });

  tool.server(async ({ sourcePath, modifiedTime, targetPath }) => {
    // Validate modification time and get content
    const fileRes = await getFile(sandbox, sourcePath);
    const currentModifiedTime = fileRes.modifiedTime;

    if (currentModifiedTime !== modifiedTime) {
      throw new Error(
        `File has been modified since it was read. Expected modifiedTime: ${modifiedTime}, current: ${currentModifiedTime}. Please read the file again before copying.`
      );
    }

    const targetExists = await sandbox.filesystem.exists(targetPath);

    if (targetExists) {
      throw new Error(`Target file already exists: ${targetPath}`);
    }

    const content = fileRes.content;

    await sandbox.filesystem.writeFile(targetPath, content);

    // Get modification time of new file
    const newModifiedTime = await getFileModifiedTime(sandbox, targetPath);

    return {
      sourcePath,
      targetPath,
      modifiedTime: newModifiedTime,
      message: `Successfully copied file from ${sourcePath} to ${targetPath}`,
    };
  });

  return tool;
};

// Keep the old name as alias for backward compatibility
export const createCopyFileTools = createCopyFileTool;
