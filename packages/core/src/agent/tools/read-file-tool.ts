import { tool } from "ai";
import { z } from "zod";

import { getFile, withDuration } from "./helpers.js";
import { readFileOutputSchema } from "./types.js";

import type { Sandbox } from "../../environment";

/**
 * Creates a read-file tool using Vercel AI SDK.
 *
 * This tool reads file contents and returns metadata including a modifiedTime
 * timestamp that must be used when editing, deleting, or moving the file to
 * ensure no concurrent modifications have occurred.
 */
export const createReadFileTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description:
      "Reads the content of a file. Returns the file content along with a modifiedTime timestamp that must be used when editing, deleting, or moving the file to ensure no concurrent modifications have occurred.",
    inputSchema: z.object({
      path: z.string().describe("The path to the file to read, relative to the project directory."),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("The line number to start reading from (0-indexed). Defaults to 0."),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("The maximum number of lines to read. If not specified, reads the entire file."),
    }),
    outputSchema: readFileOutputSchema,
    execute: async ({ path, offset, limit }) => {
      return withDuration(async () => {
        // Get file info and content
        const fileRes = await getFile(sandbox, path);
        const modifiedTime = fileRes.modifiedTime;
        const content = fileRes.content;

        const lines = content.split("\n");
        const totalLines = lines.length;

        const startLine = offset ?? 0;
        const endLine = limit !== undefined ? Math.min(startLine + limit, totalLines) : totalLines;

        const selectedLines = lines.slice(startLine, endLine);
        const selectedContent = selectedLines.join("\n");

        return {
          path,
          content: selectedContent,
          modifiedTime,
          totalLines,
          startLine,
          endLine,
          linesReturned: selectedLines.length,
          message: `Read ${selectedLines.length} lines from ${path} (lines ${startLine}-${endLine - 1} of ${totalLines})`,
        };
      });
    },
  });
};
