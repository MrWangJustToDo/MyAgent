import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { getFile } from "./helpers";

import type { Sandbox } from "../../environment";

export const createReadFileTool = ({ sandbox }: { sandbox: Sandbox }) => {
  const tool = toolDefinition({
    name: "read-file-tool",
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
    needsApproval: true,
    outputSchema: z.object({
      path: z.string().describe("The path to the file that was read."),
      content: z.string().describe("The content of the file."),
      modifiedTime: z.string().describe("The modification timestamp of the file."),
      totalLines: z.number().describe("Total number of lines in the file."),
      startLine: z.number().describe("The starting line number."),
      endLine: z.number().describe("The ending line number."),
      linesReturned: z.number().describe("Number of lines returned."),
      message: z.string().describe("A message describing the result."),
    }),
  });

  tool.server(async ({ path, offset, limit }) => {
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

  return tool;
};
