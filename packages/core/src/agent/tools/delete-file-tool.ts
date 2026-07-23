import { z } from "zod";

import { getEnv } from "../../env.js";

import { defineServerTool } from "./tanstack/define-tool.js";
import { withDuration } from "./util/helpers.js";
import { toolOutputBaseSchema } from "./util/types.js";

export const createDeleteFileTool = () => {
  return defineServerTool({
    name: "delete_file",
    description: "Deletes a file or directory. Requires user approval before execution.",
    inputSchema: z.object({
      path: z.string().describe("The path to the file or directory to delete, relative to the project directory."),
    }),
    outputSchema: z.object({
      path: z.string().describe("The path of the file or directory that was deleted."),
      durationMs: z.number().describe("Execution duration in milliseconds."),
      ...toolOutputBaseSchema.shape,
    }),
    needsApproval: true,
    execute: async ({ path }) => {
      return withDuration(async () => {
        await getEnv().fs.remove(path);
        return { path };
      });
    },
  });
};
