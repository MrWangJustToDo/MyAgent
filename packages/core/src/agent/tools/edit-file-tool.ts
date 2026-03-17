import { tool } from "ai";
import { z } from "zod";

import { getFile, getFileModifiedTime } from "./helpers.js";

import type { Sandbox } from "../../environment";

/**
 * Creates an edit-file tool using Vercel AI SDK.
 *
 * This tool edits a file by replacing occurrences of oldString with newString.
 * Requires the modifiedTime from a previous read operation to ensure
 * the file hasn't been modified since it was read.
 *
 * Requires user approval before execution.
 */
export const createEditFileTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description:
      "Edits a file by replacing occurrences of oldString with newString. Requires the modifiedTime from a previous read operation to ensure the file hasn't been modified since it was read. The oldString must match exactly (including whitespace and indentation).",
    inputSchema: z.object({
      path: z.string().describe("The path to the file to edit, relative to the project directory."),
      modifiedTime: z
        .string()
        .describe(
          "The modification timestamp from the read_file_tool response. Used to verify the file hasn't changed since it was read."
        ),
      oldString: z.string().describe("The exact string to search for and replace in the file."),
      newString: z.string().describe("The string to replace oldString with."),
      replaceAll: z
        .boolean()
        .optional()
        .describe("If true, replace all occurrences of oldString. If false, replace only the first occurrence."),
    }),
    outputSchema: z.object({
      path: z.string().describe("The path of the file that was edited."),
      replacements: z.number().describe("Number of replacements made."),
      modifiedTime: z.string().describe("The new modification timestamp after editing."),
      message: z.string().describe("Human-readable summary of the operation."),
    }),
    needsApproval: true,
    execute: async ({ path, modifiedTime, oldString, newString, replaceAll }) => {
      // Validate modification time and get current content
      const fileRes = await getFile(sandbox, path);
      const currentModifiedTime = fileRes.modifiedTime;

      if (currentModifiedTime !== modifiedTime) {
        throw new Error(
          `File has been modified since it was read. Expected modifiedTime: ${modifiedTime}, current: ${currentModifiedTime}. Please read the file again before editing.`
        );
      }

      const content = fileRes.content;

      if (!content.includes(oldString)) {
        throw new Error(`oldString not found in file content`);
      }

      // Count occurrences
      const occurrences = content.split(oldString).length - 1;

      if (occurrences > 1 && !replaceAll) {
        throw new Error(
          `Found ${occurrences} matches for oldString. Set replaceAll to true to replace all occurrences, or provide more context in oldString to make it unique.`
        );
      }

      const newContent =
        (replaceAll ?? false) ? content.replaceAll(oldString, newString) : content.replace(oldString, newString);

      await sandbox.filesystem.writeFile(path, newContent);

      // Get new modification time after edit
      const newModifiedTime = await getFileModifiedTime(sandbox, path);

      return {
        path,
        replacements: replaceAll ? occurrences : 1,
        modifiedTime: newModifiedTime,
        message: `Successfully edited file: ${path}`,
      };
    },
  });
};
