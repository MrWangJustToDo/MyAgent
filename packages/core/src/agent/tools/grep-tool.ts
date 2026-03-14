import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import type { Sandbox } from "../../environment";

export const createGrepTool = ({ sandbox }: { sandbox: Sandbox }) => {
  const tool = toolDefinition({
    name: "grep-tool",
    description:
      "Searches file contents using regular expressions. Returns file paths and line numbers with matching content. Uses `grep` command internally.",
    inputSchema: z.object({
      pattern: z.string().describe("The regex pattern to search for in file contents."),
      path: z
        .string()
        .optional()
        .describe("The directory to search in, relative to the project directory. Defaults to current directory."),
      include: z
        .string()
        .optional()
        .describe(
          "File pattern to include in the search (e.g., '*.js', '*.{ts,tsx}'). If not specified, searches all files."
        ),
      ignoreCase: z.boolean().optional().describe("If true, perform case-insensitive matching. Defaults to false."),
      maxResults: z.number().int().min(1).optional().describe("Maximum number of matches to return. Defaults to 100."),
    }),
    outputSchema: z.object({
      pattern: z.string().describe("The pattern that was searched."),
      path: z.string().describe("The path that was searched."),
      include: z.string().describe("The file pattern used."),
      matches: z
        .array(
          z.object({
            file: z.string(),
            lineNumber: z.number(),
            content: z.string(),
          })
        )
        .describe("List of matches."),
      count: z.number().describe("Number of matches."),
      truncated: z.boolean().describe("Whether results were truncated."),
      message: z.string().describe("A message describing the result."),
    }),
  });

  tool.server(async ({ pattern, path, include, ignoreCase, maxResults }) => {
    const searchPath = path ?? ".";
    const limit = maxResults ?? 100;

    // Build grep command
    let grepCommand = "grep -rn";

    if (ignoreCase) {
      grepCommand += " -i";
    }

    // Add include pattern if specified
    if (include) {
      grepCommand += ` --include="${include}"`;
    }

    // Escape the pattern for shell and add it
    const escapedPattern = pattern.replace(/"/g, '\\"');
    grepCommand += ` "${escapedPattern}" ${searchPath}`;

    // Limit results
    grepCommand += ` | head -n ${limit}`;

    // Add 2>/dev/null to suppress errors for non-readable files
    grepCommand += " 2>/dev/null || true";

    const result = await sandbox.runCommand(grepCommand);

    const matches = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // Parse grep output format: filename:lineNumber:content
        const firstColon = line.indexOf(":");
        const secondColon = line.indexOf(":", firstColon + 1);

        if (firstColon === -1 || secondColon === -1) {
          return { file: line, lineNumber: 0, content: "" };
        }

        return {
          file: line.substring(0, firstColon),
          lineNumber: parseInt(line.substring(firstColon + 1, secondColon), 10),
          content: line.substring(secondColon + 1),
        };
      });

    return {
      pattern,
      path: searchPath,
      include: include ?? "*",
      matches,
      count: matches.length,
      truncated: matches.length >= limit,
      message: `Found ${matches.length} matches for pattern: ${pattern}${matches.length >= limit ? " (results truncated)" : ""}`,
    };
  });

  return tool;
};
