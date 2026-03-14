import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { getFile, getFileModifiedTime } from "./helpers";

import type { Sandbox } from "../../environment";

const searchReplaceBlockSchema = z.object({
  oldString: z.string().describe("The exact string to search for and replace."),
  newString: z.string().describe("The string to replace oldString with."),
});

export const createSearchReplaceTool = ({ sandbox }: { sandbox: Sandbox }) => {
  const tool = toolDefinition({
    name: "search-replace-tool",
    description:
      "Performs multiple search and replace operations on a single file in one atomic operation. Requires the modifiedTime from a previous read operation. All replacements are applied sequentially, so later replacements can match text created by earlier ones.",
    inputSchema: z.object({
      path: z.string().describe("The path to the file to edit, relative to the project directory."),
      modifiedTime: z
        .string()
        .describe(
          "The modification timestamp from the read_file_tool response. Used to verify the file hasn't changed since it was read."
        ),
      replacements: z
        .array(searchReplaceBlockSchema)
        .min(1)
        .describe("Array of search/replace operations to perform in order."),
    }),
    needsApproval: true,
    outputSchema: z.object({
      path: z.string().describe("The path to the file that was edited."),
      replacementsApplied: z.number().describe("Number of replacements applied."),
      modifiedTime: z.string().describe("The new modification timestamp of the file."),
      results: z
        .array(
          z.object({
            oldString: z.string(),
            found: z.boolean(),
            replaced: z.boolean(),
          })
        )
        .describe("Results for each replacement."),
      message: z.string().describe("A message describing the result."),
    }),
  });

  tool.server(async ({ path, modifiedTime, replacements }) => {
    // Validate modification time and get current content
    const fileRes = await getFile(sandbox, path);
    const currentModifiedTime = fileRes.modifiedTime;

    if (currentModifiedTime !== modifiedTime) {
      throw new Error(
        `File has been modified since it was read. Expected modifiedTime: ${modifiedTime}, current: ${currentModifiedTime}. Please read the file again before editing.`
      );
    }

    let content = fileRes.content;
    const results: Array<{ oldString: string; found: boolean; replaced: boolean }> = [];

    // Apply each replacement in order
    for (const { oldString, newString } of replacements) {
      const found = content.includes(oldString);
      if (found) {
        content = content.replace(oldString, newString);
        results.push({
          oldString: oldString.substring(0, 50) + (oldString.length > 50 ? "..." : ""),
          found: true,
          replaced: true,
        });
      } else {
        results.push({
          oldString: oldString.substring(0, 50) + (oldString.length > 50 ? "..." : ""),
          found: false,
          replaced: false,
        });
      }
    }

    const successCount = results.filter((r) => r.replaced).length;
    const failedCount = results.filter((r) => !r.found).length;

    if (failedCount > 0) {
      const failedStrings = results
        .filter((r) => !r.found)
        .map((r) => r.oldString)
        .join(", ");
      throw new Error(`Some search strings were not found in the file: ${failedStrings}. No changes were made.`);
    }

    await sandbox.filesystem.writeFile(path, content);

    // Get new modification time after edit
    const newModifiedTime = await getFileModifiedTime(sandbox, path);

    return {
      path,
      replacementsApplied: successCount,
      modifiedTime: newModifiedTime,
      results,
      message: `Successfully applied ${successCount} replacements to: ${path}`,
    };
  });

  return tool;
};
