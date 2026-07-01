import { tool } from "ai";
import { z } from "zod";

import { getEnv } from "../../env.js";

import { getFile, getFileModifiedTime, withDuration } from "./util/helpers.js";
import { toolOutputBaseSchema } from "./util/types.js";

/**
 * Creates a copy-file tool using Vercel AI SDK.
 *
 * Requires user approval before execution.
 */
export const createCopyFileTool = () => {
  return tool({
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

        const content = fileRes.content;

        await fs.writeFile(targetPath, content);

        const newModifiedTime = await getFileModifiedTime(targetPath);

        return {
          sourcePath,
          targetPath,
          modifiedTime: newModifiedTime,
        };
      });
    },

    // Only confirm success to the LLM — sourcePath/targetPath are echoed in
    // the input, modifiedTime is for conflict detection, durationMs is metadata.
    toModelOutput({
      output,
    }: {
      toolCallId: string;
      input: unknown;
      output: { sourcePath: string; targetPath: string; modifiedTime: string };
    }) {
      return {
        type: "content" as const,
        value: [
          {
            type: "text" as const,
            text: `Copied ${output.sourcePath} → ${output.targetPath}，modifiedTime：${output.modifiedTime}`,
          },
        ],
      };
    },
  });
};

// Keep the old name as alias for backward compatibility
export const createCopyFileTools = createCopyFileTool;
