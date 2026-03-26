import { tool } from "ai";
import { z } from "zod";

import { OUTPUT_LIMITS, truncateString, withDuration } from "./helpers.js";

import type { Sandbox } from "../../environment";

/** Maximum characters for tree output */
const MAX_TREE_CHARS = OUTPUT_LIMITS.MAX_CONTENT_CHARS;

/** Maximum entries to show in tree */
const MAX_TREE_ENTRIES = OUTPUT_LIMITS.MAX_ARRAY_ITEMS;

/**
 * Creates a tree tool using Vercel AI SDK.
 *
 * This tool displays the directory tree structure in a hierarchical format.
 * Useful for understanding project structure.
 */
export const createTreeTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description:
      "Displays the directory tree structure. Shows files and directories in a hierarchical format. Useful for understanding project structure.",
    inputSchema: z.object({
      path: z.string().optional().describe("The root directory to display tree from. Defaults to current directory."),
      maxDepth: z.number().int().min(1).max(10).optional().describe("Maximum depth to traverse. Defaults to 3."),
      showHidden: z
        .boolean()
        .optional()
        .describe("Whether to show hidden files (starting with dot). Defaults to false."),
      dirsOnly: z.boolean().optional().describe("Only show directories, not files. Defaults to false."),
      pattern: z.string().optional().describe("Only show files matching this pattern (e.g., '*.ts', '*.js')."),
      ignore: z.array(z.string()).optional().describe("Patterns to ignore (e.g., ['node_modules', '.git', 'dist'])."),
    }),
    outputSchema: z.object({
      path: z.string().describe("The root directory that was displayed."),
      maxDepth: z.number().describe("The maximum depth that was traversed."),
      tree: z.string().describe("The tree structure as a formatted string."),
      totalEntries: z.number().describe("Total number of entries (files and directories) shown."),
      truncated: z.boolean().describe("Whether the tree output was truncated."),
      message: z.string().describe("Human-readable summary of the operation."),
      durationMs: z.number().describe("Execution duration in milliseconds."),
    }),
    execute: async ({ path, maxDepth, showHidden, dirsOnly, pattern, ignore }) => {
      return withDuration(async () => {
        const rootPath = path ?? ".";
        const depth = maxDepth ?? 3;

        // Build tree command (try 'tree' first, fall back to 'find' based approach)
        let treeCommand = `tree "${rootPath}" -L ${depth}`;

        if (!showHidden) {
          treeCommand += " -I '.*'";
        }

        if (dirsOnly) {
          treeCommand += " -d";
        }

        if (pattern) {
          treeCommand += ` -P '${pattern}'`;
        }

        if (ignore && ignore.length > 0) {
          const ignorePattern = ignore.join("|");
          treeCommand += ` -I '${ignorePattern}'`;
        }

        // Add file count summary
        treeCommand += " --noreport";

        let result = await sandbox.runCommand(treeCommand + " 2>/dev/null");

        // If tree command not available, use find-based fallback
        if (result.exitCode !== 0 || result.stdout.trim() === "") {
          // Fallback using find command
          let findCommand = `find "${rootPath}" -maxdepth ${depth}`;

          if (dirsOnly) {
            findCommand += " -type d";
          }

          if (!showHidden) {
            findCommand += " -not -path '*/.*'";
          }

          if (pattern) {
            findCommand += ` -name '${pattern}'`;
          }

          if (ignore && ignore.length > 0) {
            for (const ig of ignore) {
              findCommand += ` -not -path '*/${ig}/*' -not -name '${ig}'`;
            }
          }

          findCommand += ` | sort | head -${MAX_TREE_ENTRIES}`;

          result = await sandbox.runCommand(findCommand);

          if (result.exitCode !== 0) {
            throw new Error(`Failed to list directory tree: ${result.stderr}`);
          }

          // Convert find output to tree-like format
          const paths = result.stdout.split("\n").filter((p) => p.trim());
          let tree = formatAsTree(paths, rootPath);

          // Truncate tree output if too long
          const { text: truncatedTree, truncated } = truncateString(tree, MAX_TREE_CHARS);
          tree = truncatedTree;

          const truncationNote = truncated ? " (output truncated)" : "";

          return {
            path: rootPath,
            maxDepth: depth,
            tree,
            totalEntries: paths.length,
            truncated,
            message: `Directory tree for: ${rootPath} (depth: ${depth})${truncationNote}`,
          };
        }

        const lines = result.stdout.split("\n").filter((l) => l.trim());

        // Truncate tree output if too long
        const { text: truncatedTree, truncated } = truncateString(result.stdout, MAX_TREE_CHARS);

        const truncationNote = truncated ? " (output truncated)" : "";

        return {
          path: rootPath,
          maxDepth: depth,
          tree: truncatedTree,
          totalEntries: lines.length,
          truncated,
          message: `Directory tree for: ${rootPath} (depth: ${depth})${truncationNote}`,
        };
      });
    },
  });
};

/**
 * Format flat path list into tree-like structure
 */
function formatAsTree(paths: string[], rootPath: string): string {
  if (paths.length === 0) return "(empty)";

  const lines: string[] = [];
  const root = rootPath.replace(/\/$/, "");

  // Sort paths
  const sortedPaths = paths.sort();

  for (const fullPath of sortedPaths) {
    const relativePath = fullPath.startsWith(root + "/")
      ? fullPath.slice(root.length + 1)
      : fullPath === root
        ? "."
        : fullPath;

    if (!relativePath || relativePath === ".") {
      lines.push(root);
      continue;
    }

    const parts = relativePath.split("/");
    const depth = parts.length - 1;
    const indent = "  ".repeat(depth);
    const name = parts[parts.length - 1];

    lines.push(`${indent}${name}`);
  }

  return lines.join("\n");
}
