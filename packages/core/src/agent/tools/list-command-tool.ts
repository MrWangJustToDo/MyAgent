import { tool } from "ai";
import { getCommandNames, getJavaScriptCommandNames, getNetworkCommandNames, getPythonCommandNames } from "just-bash";
import { z } from "zod";

import { OUTPUT_LIMITS, truncateArray, withDuration } from "./helpers.js";

import type { Sandbox } from "../../environment";

/** Maximum number of commands to return */
const MAX_COMMANDS = OUTPUT_LIMITS.MAX_ARRAY_ITEMS;

/**
 * Creates a list-command tool using Vercel AI SDK.
 *
 * This tool lists available commands in the sandbox environment.
 * Can search for specific commands by name or list all commands.
 *
 * For just-bash sandbox environments, uses the native just-bash APIs
 * to get accurate command lists. For native environments, falls back
 * to shell commands.
 */
export const createListCommandTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description:
      "Lists available commands in the sandbox environment. Can search for specific commands by name or list commands by category (all, builtin, network, python, javascript).",
    inputSchema: z.object({
      search: z
        .string()
        .optional()
        .describe("Optional search term to filter commands. If provided, searches for commands matching this pattern."),
      category: z
        .enum(["all", "builtin", "network", "python", "javascript"])
        .optional()
        .describe(
          "Category of commands to list. Defaults to 'all'. Categories: builtin (basic commands), network (curl, etc.), python (python3, python), javascript (node, js-exec)."
        ),
    }),
    outputSchema: z.object({
      search: z.string().nullable().describe("The search term used, or null if listing all."),
      category: z.string().describe("The category of commands listed."),
      commands: z.array(z.string()).describe("Array of command names found."),
      count: z.number().describe("Number of commands found."),
      truncated: z.boolean().describe("Whether results were truncated due to limit."),
      message: z.string().describe("Human-readable summary of the operation."),
      durationMs: z.number().describe("Execution duration in milliseconds."),
    }),
    execute: async ({ search, category: categoryInput }) => {
      return withDuration(async () => {
        const category = categoryInput ?? "all";

        // Check if we're using just-bash sandbox
        const isJustBashSandbox = sandbox.provider === "local-sandbox";

        let commands: string[];

        if (isJustBashSandbox) {
          // Use just-bash native APIs for accurate command listing
          switch (category) {
            case "builtin":
              commands = getCommandNames();
              break;
            case "network":
              commands = getNetworkCommandNames();
              break;
            case "python":
              commands = getPythonCommandNames();
              break;
            case "javascript":
              commands = getJavaScriptCommandNames();
              break;
            case "all":
            default:
              // Combine all command categories
              commands = [
                ...getCommandNames(),
                ...getNetworkCommandNames(),
                ...getPythonCommandNames(),
                ...getJavaScriptCommandNames(),
              ];
              // Remove duplicates and sort
              commands = [...new Set(commands)].sort();
              break;
          }
        } else {
          // Native environment - use shell commands
          let shellCommand: string;

          switch (category) {
            case "builtin":
              shellCommand = "compgen -b 2>/dev/null | sort -u || echo 'compgen not available'";
              break;
            case "network":
              shellCommand = "which curl wget 2>/dev/null | xargs -n1 basename 2>/dev/null || echo 'curl wget'";
              break;
            case "python":
              shellCommand =
                "which python3 python 2>/dev/null | xargs -n1 basename 2>/dev/null || echo 'python3 python'";
              break;
            case "javascript":
              shellCommand = "which node 2>/dev/null | xargs -n1 basename 2>/dev/null || echo 'node'";
              break;
            case "all":
            default:
              shellCommand = "compgen -c 2>/dev/null | sort -u | head -200 || ls /usr/bin /bin 2>/dev/null | head -200";
              break;
          }

          const result = await sandbox.runCommand(shellCommand);
          commands = result.stdout
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.includes("not available"));
        }

        // Apply search filter if provided
        if (search) {
          const searchLower = search.toLowerCase();
          commands = commands.filter((cmd) => cmd.toLowerCase().includes(searchLower));
        }

        // Sort commands alphabetically
        commands.sort();

        // Truncate if needed
        const { items: truncatedCommands, truncated, total } = truncateArray(commands, MAX_COMMANDS);

        const truncationNote = truncated ? ` (showing ${MAX_COMMANDS} of ${total})` : "";

        return {
          search: search ?? null,
          category,
          commands: truncatedCommands,
          count: truncatedCommands.length,
          truncated,
          message: search
            ? `Found ${truncatedCommands.length} commands matching "${search}" in category "${category}"${truncationNote}`
            : `Listed ${truncatedCommands.length} ${category} commands${truncationNote}`,
        };
      });
    },
  });
};
