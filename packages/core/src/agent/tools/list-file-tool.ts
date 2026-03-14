import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import type { Sandbox } from "../../environment";

export const createListFileTool = ({ sandbox }: { sandbox: Sandbox }) => {
  const tool = toolDefinition({
    name: "list-file-tool",
    description:
      "Lists files and directories in the specified directory. Returns the name, type (file or directory), size, and modification date for each entry.",
    inputSchema: z.object({
      path: z
        .string()
        .optional()
        .describe(
          "The path to the directory to list, relative to the project directory. Defaults to current directory."
        ),
    }),
    needsApproval: true,
    outputSchema: z.object({
      path: z.string().describe("The path that was listed."),
      entries: z
        .array(
          z.object({
            name: z.string(),
            type: z.string(),
            size: z.number().optional(),
            modified: z.string().optional(),
          })
        )
        .describe("List of directory entries."),
      count: z.number().describe("Number of entries."),
      message: z.string().describe("A message describing the result."),
    }),
  });

  tool.server(async ({ path: inputPath }) => {
    const path = inputPath ?? ".";

    const exists = await sandbox.filesystem.exists(path);

    if (!exists) {
      throw new Error(`Directory does not exist: ${path}`);
    }

    const entries = await sandbox.filesystem.readdir(path);

    return {
      path,
      entries: entries.map((entry) => ({
        name: entry.name,
        type: entry.type,
        size: entry.size,
        modified: entry.modified?.toISOString(),
      })),
      count: entries.length,
      message: `Listed ${entries.length} entries in: ${path}`,
    };
  });

  return tool;
};
