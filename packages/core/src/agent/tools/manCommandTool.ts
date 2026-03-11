import { tool } from "ai";
import { z } from "zod";

import type { Sandbox } from "../../types";

export const createManCommandTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    title: "man-command-tool",
    description:
      "Gets the manual page or help information for a command. Tries `man`, `--help`, and `-h` flags to retrieve documentation for the specified command.",
    inputSchema: z.object({
      command: z.string().describe("The command to get help/manual for."),
      section: z
        .number()
        .int()
        .min(1)
        .max(9)
        .optional()
        .describe("Manual section number (1-9). Common sections: 1=commands, 2=syscalls, 3=library, 5=file formats."),
    }),
    inputExamples: [{ input: { command: "git", section: 1 } }],
    outputSchema: z.object({
      command: z.string().describe("The command queried."),
      source: z.string().describe("Source of the help (man, --help, -h, or which)."),
      section: z.number().nullable().describe("Manual section if applicable."),
      content: z.string().describe("The help content."),
      message: z.string().describe("A message describing the result."),
    }),
    execute: async ({ command, section }, { abortSignal }) => {
      if (abortSignal?.aborted) {
        throw new Error(abortSignal.reason as string);
      }

      // Try multiple ways to get help
      const manSection = section ? `${section} ` : "";
      const manCommand = `man ${manSection}${command} 2>/dev/null | col -bx | head -500`;

      let result = await sandbox.runCommand(manCommand);

      // If man page exists, return it
      if (result.exitCode === 0 && result.stdout.trim().length > 0) {
        return {
          command,
          source: "man",
          section: section ?? null,
          content: result.stdout,
          message: `Retrieved man page for: ${command}`,
        };
      }

      // Try --help flag
      result = await sandbox.runCommand(`${command} --help 2>&1 | head -200`);

      if (result.exitCode === 0 && result.stdout.trim().length > 0) {
        return {
          command,
          source: "--help",
          section: null,
          content: result.stdout,
          message: `Retrieved --help output for: ${command}`,
        };
      }

      // Try -h flag
      result = await sandbox.runCommand(`${command} -h 2>&1 | head -200`);

      if (result.exitCode === 0 && result.stdout.trim().length > 0) {
        return {
          command,
          source: "-h",
          section: null,
          content: result.stdout,
          message: `Retrieved -h output for: ${command}`,
        };
      }

      // Try which to at least find the command location
      result = await sandbox.runCommand(`which ${command} 2>/dev/null`);

      if (result.exitCode === 0 && result.stdout.trim().length > 0) {
        return {
          command,
          source: "which",
          section: null,
          content: `Command found at: ${result.stdout.trim()}\nNo help documentation available.`,
          message: `Command exists but no help available: ${command}`,
        };
      }

      throw new Error(`No help information found for command: ${command}`);
    },
  });
};
