import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import type { Sandbox } from "../../environment";

export const createListCommandTool = ({ sandbox }: { sandbox: Sandbox }) => {
  const definition = toolDefinition({
    name: "list-command-tool",
    description:
      "Lists available commands in the sandbox environment. Can search for specific commands by name or list all commands in a directory. Uses `which`, `type`, or `compgen` to find available commands.",
    inputSchema: z.object({
      search: z
        .string()
        .optional()
        .describe("Optional search term to filter commands. If provided, searches for commands matching this pattern."),
      type: z
        .enum(["all", "builtin", "executable", "alias", "function"])
        .optional()
        .describe("Type of commands to list. Defaults to 'all'."),
    }),
    outputSchema: z.object({
      search: z.string().nullable().describe("The search term used."),
      type: z.string().describe("The command type filtered."),
      commands: z.array(z.string()).describe("List of matching commands."),
      count: z.number().describe("Number of commands found."),
      message: z.string().describe("A message describing the result."),
    }),
  });

  return definition.server(async ({ search, type: commandTypeInput }) => {
    const commandType = commandTypeInput ?? "all";

    let command: string;

    if (search) {
      // Search for specific command
      command = `compgen -c 2>/dev/null | grep -i "${search}" | sort -u | head -100 || which "${search}" 2>/dev/null || type "${search}" 2>/dev/null || echo "No commands found matching: ${search}"`;
    } else {
      // List commands based on type
      switch (commandType) {
        case "builtin":
          command = "compgen -b | sort -u";
          break;
        case "alias":
          command = "compgen -a | sort -u";
          break;
        case "function":
          command = "compgen -A function | sort -u";
          break;
        case "executable":
          command = "compgen -c | sort -u | head -200";
          break;
        case "all":
        default:
          command = "compgen -c | sort -u | head -200";
          break;
      }
    }

    const result = await sandbox.runCommand(command);

    const commands = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("No commands found"));

    return {
      search: search ?? null,
      type: commandType,
      commands,
      count: commands.length,
      message: search
        ? `Found ${commands.length} commands matching: ${search}`
        : `Listed ${commands.length} ${commandType} commands`,
    };
  });
};
