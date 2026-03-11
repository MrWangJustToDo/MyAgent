import { tool } from "ai";
import { z } from "zod";

import type { Sandbox } from "../../types";

export const createGlobTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    title: "glob-tool",
    description:
      "Finds files matching a glob pattern. Supports patterns like '**/*.js', 'src/**/*.ts', '*.json', etc. Uses the `find` command internally to search for matching files.",
    inputSchema: z.object({
      pattern: z.string().describe("The glob pattern to match files against (e.g., '**/*.js', 'src/**/*.ts')."),
      path: z
        .string()
        .optional()
        .describe("The directory to search in, relative to the project directory. Defaults to current directory."),
    }),
    inputExamples: [{ input: { pattern: "**/*.ts", path: "/src" } }],
    outputSchema: z.object({
      pattern: z.string().describe("The pattern that was used."),
      path: z.string().describe("The path that was searched."),
      files: z.array(z.string()).describe("List of matching files."),
      count: z.number().describe("Number of files found."),
      message: z.string().describe("A message describing the result."),
    }),
    execute: async ({ pattern, path }, { abortSignal }) => {
      if (abortSignal?.aborted) {
        throw new Error(abortSignal.reason as string);
      }

      const searchPath = path ?? ".";

      // Convert glob pattern to find command
      // Handle common glob patterns
      let findCommand: string;

      if (pattern.includes("**")) {
        // Recursive pattern like **/*.js
        const namePattern = pattern.replace(/\*\*\//g, "");
        findCommand = `find ${searchPath} -type f -name "${namePattern}" 2>/dev/null`;
      } else if (pattern.includes("*")) {
        // Simple wildcard pattern like *.js
        findCommand = `find ${searchPath} -type f -name "${pattern}" 2>/dev/null`;
      } else {
        // Exact name match
        findCommand = `find ${searchPath} -type f -name "${pattern}" 2>/dev/null`;
      }

      const result = await sandbox.runCommand(findCommand);

      const files = result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      return {
        pattern,
        path: searchPath,
        files,
        count: files.length,
        message: `Found ${files.length} files matching pattern: ${pattern}`,
      };
    },
  });
};
