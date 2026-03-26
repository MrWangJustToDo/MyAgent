import { tool } from "ai";
import { z } from "zod";

import { withDuration } from "./helpers.js";

import type { Sandbox } from "../../environment";

/** Default number of lines per page */
const DEFAULT_LINE_LIMIT = 200;

/**
 * Creates a man-command tool using Vercel AI SDK.
 *
 * This tool gets the manual page or help information for a command.
 * Tries `man`, `--help`, and `-h` flags to retrieve documentation.
 * Supports line-based pagination with offset/limit parameters.
 */
export const createManCommandTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description:
      "Gets the manual page or help information for a command. Tries `man`, `--help`, and `-h` flags to retrieve documentation. Supports pagination with offset/limit (in lines).",
    inputSchema: z.object({
      command: z.string().describe("The command to get help/manual for."),
      section: z
        .number()
        .int()
        .min(1)
        .max(9)
        .optional()
        .describe("Manual section number (1-9). Common sections: 1=commands, 2=syscalls, 3=library, 5=file formats."),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Number of lines to skip (0-indexed). Use for pagination. Defaults to 0."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe(`Maximum number of lines to return. Defaults to ${DEFAULT_LINE_LIMIT}.`),
    }),
    outputSchema: z.object({
      command: z.string().describe("The command that help was retrieved for."),
      source: z.string().describe("The source of the help: 'man', '--help', '-h', or 'which'."),
      section: z.number().nullable().describe("The man section number, or null if not applicable."),
      content: z.string().describe("The help/manual content."),
      totalLines: z.number().describe("Total number of lines in the help content."),
      offset: z.number().describe("The line offset used (0-indexed)."),
      linesReturned: z.number().describe("Number of lines returned."),
      hasMore: z.boolean().describe("Whether there are more lines available."),
      nextOffset: z.number().nullable().describe("The offset to use for the next page, or null if no more lines."),
      message: z.string().describe("Human-readable summary of the operation."),
      durationMs: z.number().describe("Execution duration in milliseconds."),
    }),
    execute: async ({ command, section, offset, limit }) => {
      return withDuration(async () => {
        const skip = offset ?? 0;
        const take = limit ?? DEFAULT_LINE_LIMIT;

        // Try multiple ways to get help
        const manSection = section ? `${section} ` : "";

        // First, get a large portion of the man page to know total lines
        const manCommand = `man ${manSection}${command} 2>/dev/null | col -bx`;

        let result = await sandbox.runCommand(manCommand);
        let source = "man";

        // If man page doesn't exist, try --help
        if (result.exitCode !== 0 || result.stdout.trim().length === 0) {
          result = await sandbox.runCommand(`${command} --help 2>&1`);
          source = "--help";
        }

        // Try -h flag
        if (result.exitCode !== 0 || result.stdout.trim().length === 0) {
          result = await sandbox.runCommand(`${command} -h 2>&1`);
          source = "-h";
        }

        // Try which to at least find the command location
        if (result.exitCode !== 0 || result.stdout.trim().length === 0) {
          result = await sandbox.runCommand(`which ${command} 2>/dev/null`);

          if (result.exitCode === 0 && result.stdout.trim().length > 0) {
            return {
              command,
              source: "which",
              section: null,
              content: `Command found at: ${result.stdout.trim()}\nNo help documentation available.`,
              totalLines: 2,
              offset: 0,
              linesReturned: 2,
              hasMore: false,
              nextOffset: null,
              message: `Command exists but no help available: ${command}`,
            };
          }

          throw new Error(`No help information found for command: ${command}`);
        }

        // Parse lines and apply pagination
        const allLines = result.stdout.split("\n");
        const totalLines = allLines.length;
        const paginatedLines = allLines.slice(skip, skip + take);
        const hasMore = totalLines > skip + take;

        // Build message
        let message = `Retrieved ${source} for: ${command} (lines ${skip + 1}-${skip + paginatedLines.length} of ${totalLines})`;
        if (hasMore) {
          message += `. Use offset=${skip + take} to see more.`;
        }

        return {
          command,
          source,
          section: source === "man" ? (section ?? null) : null,
          content: paginatedLines.join("\n"),
          totalLines,
          offset: skip,
          linesReturned: paginatedLines.length,
          hasMore,
          nextOffset: hasMore ? skip + take : null,
          message,
        };
      });
    },
  });
};
