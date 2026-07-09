import { z } from "zod";

import { getEnv } from "../../env.js";

import { defineServerTool } from "./tanstack/define-tool.js";
import { OUTPUT_LIMITS, truncateString, withDuration } from "./util/helpers.js";
import { maybeCacheOutput } from "./util/tool-output-cache.js";
import { toolOutputBaseSchema } from "./util/types.js";

/** Maximum characters for tree output */
const MAX_TREE_CHARS = OUTPUT_LIMITS.MAX_CONTENT_CHARS;

/** Maximum entries to show in tree */
const MAX_TREE_ENTRIES = OUTPUT_LIMITS.MAX_ARRAY_ITEMS;

/**
 * Creates a tree tool for displaying directory structure.
 *
 * This tool displays the directory tree structure in a hierarchical format.
 * Useful for understanding project structure.
 */
export const createTreeTool = () => {
  return defineServerTool({
    name: "tree",
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
      durationMs: z.number().describe("Execution duration in milliseconds."),
      ...toolOutputBaseSchema.shape,
    }),
    execute: async ({ path, maxDepth, showHidden, dirsOnly, pattern, ignore }, { toolCallId }) => {
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

        const env = getEnv();
        let result = await env.runCommand(treeCommand + " 2>/dev/null");

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

          result = await env.runCommand(findCommand);

          if (result.exitCode !== 0) {
            throw new Error(`Failed to list directory tree: ${result.stderr}`);
          }

          // Convert find output to tree-like format
          const paths = result.stdout.split("\n").filter((p) => p.trim());
          const rawTree = formatAsTree(paths, rootPath);

          const cached = await maybeCacheOutput(rawTree, `${toolCallId}-tree`);
          let tree: string;
          let truncated: boolean;
          if (cached.cachedOutputPath) {
            tree = cached.content;
            truncated = true;
          } else {
            ({ text: tree, truncated } = truncateString(rawTree, MAX_TREE_CHARS));
          }

          return {
            path: rootPath,
            maxDepth: depth,
            tree,
            totalEntries: paths.length,
            truncated,
            cachedOutputPath: cached.cachedOutputPath,
          };
        }

        const lines = result.stdout.split("\n").filter((l) => l.trim());

        const cached = await maybeCacheOutput(result.stdout, `${toolCallId}-tree`);
        let truncatedTree: string;
        let truncated: boolean;
        if (cached.cachedOutputPath) {
          truncatedTree = cached.content;
          truncated = true;
        } else {
          ({ text: truncatedTree, truncated } = truncateString(result.stdout, MAX_TREE_CHARS));
        }

        return {
          path: rootPath,
          maxDepth: depth,
          tree: truncatedTree,
          totalEntries: lines.length,
          truncated,
          cachedOutputPath: cached.cachedOutputPath,
        };
      });
    },
    // Only send the tree text to the LLM — path/maxDepth are echoed in the
    // input, totalEntries/truncated/cachedOutputPath are UI metadata.
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: { tree: string } }) {
      return [{ type: "text" as const, content: output.tree }];
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
