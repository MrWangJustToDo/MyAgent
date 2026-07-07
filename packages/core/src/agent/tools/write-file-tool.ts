import { z } from "zod";

import { getEnv } from "../../env.js";

import { defineServerTool } from "./tanstack/define-tool.js";
import { getFileModifiedTime, withDuration } from "./util/helpers.js";
import { writeFileOutputSchema } from "./util/types.js";

export const createWriteFileTool = () => {
  return defineServerTool({
    name: "write_file",
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
    outputSchema: writeFileOutputSchema,
    needsApproval: true,
    execute: async ({ path, content, modifiedTime, createDirectories }) => {
      return withDuration(async () => {
        const fs = getEnv().fs;
        const fileExisted = await fs.exists(path);

        if (fileExisted) {
          if (!modifiedTime) {
            throw new Error(
              `File already exists: ${path}. You must read the file first and provide the modifiedTime to overwrite it.`
            );
          }

          const currentModifiedTime = await getFileModifiedTime(path);
          if (currentModifiedTime !== modifiedTime) {
            throw new Error(
              `File has been modified since it was read. Expected modifiedTime: ${modifiedTime}, current: ${currentModifiedTime}. Please read the file again before writing.`
            );
          }
        }

        const lastSlashIndex = path.lastIndexOf("/");
        if (lastSlashIndex > 0 && (createDirectories ?? true)) {
          const dirPath = path.substring(0, lastSlashIndex);
          const dirExists = await fs.exists(dirPath);
          if (!dirExists) {
            await fs.mkdir(dirPath);
          }
        }

        await fs.writeFile(path, content);

        const newModifiedTime = await getFileModifiedTime(path);

        return {
          path,
          bytesWritten: content.length,
          created: !fileExisted,
          modifiedTime: newModifiedTime,
        };
      });
    },
  });
};
