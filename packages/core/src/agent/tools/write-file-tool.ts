import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { getFileModifiedTime } from "./helpers";

import type { Sandbox } from "../../environment";

export const createWriteFileTool = ({ sandbox }: { sandbox: Sandbox }) => {
  const definition = toolDefinition({
    name: "write-file-tool",
    description:
      "Writes content to a file. If the file exists, requires the modifiedTime from a previous read operation to ensure the file hasn't been modified. If creating a new file, modifiedTime should be omitted. Parent directories will be created if they don't exist.",
    inputSchema: z.object({
      path: z.string().describe("The path to the file to write, relative to the project directory."),
      content: z.string().describe("The content to write to the file."),
      modifiedTime: z
        .string()
        .optional()
        .describe(
          "The modification timestamp from the read_file_tool response. Required when overwriting an existing file. Omit when creating a new file."
        ),
      createDirectories: z
        .boolean()
        .optional()
        .describe("If true, create parent directories if they don't exist. Defaults to true."),
    }),
    needsApproval: true,
    outputSchema: z.object({
      path: z.string().describe("The path to the file that was written."),
      bytesWritten: z.number().describe("Number of bytes written."),
      created: z.boolean().describe("Whether a new file was created."),
      modifiedTime: z.string().describe("The new modification timestamp of the file."),
      message: z.string().describe("A message describing the result."),
    }),
  });

  return definition.server(async ({ path, content, modifiedTime, createDirectories }) => {
    const fileExisted = await sandbox.filesystem.exists(path);

    // If file exists, validate modification time
    if (fileExisted) {
      if (!modifiedTime) {
        throw new Error(
          `File already exists: ${path}. You must read the file first and provide the modifiedTime to overwrite it.`
        );
      }

      const currentModifiedTime = await getFileModifiedTime(sandbox, path);
      if (currentModifiedTime !== modifiedTime) {
        throw new Error(
          `File has been modified since it was read. Expected modifiedTime: ${modifiedTime}, current: ${currentModifiedTime}. Please read the file again before writing.`
        );
      }
    }

    // Extract directory path from file path
    const lastSlashIndex = path.lastIndexOf("/");
    if (lastSlashIndex > 0 && (createDirectories ?? true)) {
      const dirPath = path.substring(0, lastSlashIndex);
      const dirExists = await sandbox.filesystem.exists(dirPath);
      if (!dirExists) {
        await sandbox.filesystem.mkdir(dirPath);
      }
    }

    await sandbox.filesystem.writeFile(path, content);

    // Get new modification time after write
    const newModifiedTime = await getFileModifiedTime(sandbox, path);

    return {
      path,
      bytesWritten: content.length,
      created: !fileExisted,
      modifiedTime: newModifiedTime,
      message: fileExisted ? `Successfully overwrote file: ${path}` : `Successfully created file: ${path}`,
    };
  });
};
