import { tool } from "ai";
import { z } from "zod";

import { OUTPUT_LIMITS, withDuration } from "./util/helpers.js";
import { DEFAULT_EXCLUDE_DIRS, runSearchCommand } from "./util/search-command.js";
import { maybeCacheOutput } from "./util/tool-output-cache.js";
import { grepOutputSchema } from "./util/types.js";

import type { GrepOutput } from "./util/types.js";

/** Maximum characters per matching line content (to prevent context overflow) */
const MAX_CONTENT_LENGTH = 500;

/** Maximum total characters for all match content combined */
const MAX_TOTAL_CONTENT = OUTPUT_LIMITS.MAX_CONTENT_CHARS;

/** Default number of matches per page */
const DEFAULT_LIMIT = 100;

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + "...[truncated]";
}

function buildRgCommand(
  pattern: string,
  searchPath: string,
  options: {
    ignoreCase: boolean;
    include: string | undefined;
    outputMode: string;
    context: number;
    fetchCount: number;
  }
): string {
  const args: string[] = ["--color=never"];

  if (options.ignoreCase) {
    args.push("-i");
  }

  if (options.outputMode === "files_with_matches") {
    args.push("--files-with-matches");
  } else if (options.outputMode === "count") {
    args.push("--count");
  } else {
    args.push("--line-number", "--no-heading");
    if (options.context > 0) {
      args.push("-C", String(options.context));
    }
  }

  if (options.include) {
    args.push("--glob", `"${options.include}"`);
  }

  for (const dir of DEFAULT_EXCLUDE_DIRS) {
    args.push("--glob", `"!**/${dir}/**"`);
  }

  const escapedPattern = pattern.replace(/"/g, '\\"');
  args.push("--", `"${escapedPattern}"`, searchPath);

  return `set -o pipefail; rg ${args.join(" ")} 2>/dev/null | head -n ${options.fetchCount}`;
}

function buildGrepCommand(
  pattern: string,
  searchPath: string,
  options: {
    ignoreCase: boolean;
    include: string | undefined;
    outputMode: string;
    context: number;
    fetchCount: number;
  }
): string {
  let command = "grep -r";

  if (options.ignoreCase) {
    command += "i";
  }

  if (options.outputMode === "files_with_matches") {
    command += "l";
  } else if (options.outputMode === "count") {
    command += "c";
  } else {
    command += "n";
  }

  command += " --color=never";
  command += ` -m ${options.fetchCount}`;

  if (options.outputMode === "content" && options.context > 0) {
    command += ` -C ${options.context}`;
  }

  if (options.include) {
    command += ` --include="${options.include}"`;
  }

  for (const dir of DEFAULT_EXCLUDE_DIRS) {
    command += ` --exclude-dir="${dir}"`;
  }

  const escapedPattern = pattern.replace(/"/g, '\\"');
  command += ` -E "${escapedPattern}" ${searchPath}`;

  return `set -o pipefail; ${command} 2>/dev/null | head -n ${options.fetchCount}`;
}

/**
 * Parse a positive integer line number; rejects NaN (JSON.stringify(NaN) → null).
 */
function parseLineNumber(value: string): number | null {
  const lineNumber = Number(value);
  if (!Number.isFinite(lineNumber) || lineNumber < 0 || !Number.isInteger(lineNumber)) {
    return null;
  }
  return lineNumber;
}

/**
 * Parse ripgrep/grep content output.
 *
 * Match lines use `path:line:content` — the line number is the first `:digits:` segment
 * (non-greedy path), not the last, so colons in file content are not mistaken for a line.
 * Context lines use `path-line-content` (rg uses `-` instead of `:` around the line number).
 */
function parseGrepLine(line: string): { file: string; lineNumber: number; content: string } | null {
  if (line === "--") {
    return null;
  }

  const matchLine = line.match(/^(.+?):(\d+):(.*)$/s);
  if (matchLine) {
    const lineNumber = parseLineNumber(matchLine[2]);
    if (lineNumber === null) {
      return null;
    }
    return {
      file: matchLine[1],
      lineNumber,
      content: matchLine[3],
    };
  }

  const contextLine = line.match(/^(.+?)-(\d+)-(.*)$/s);
  if (contextLine) {
    const lineNumber = parseLineNumber(contextLine[2]);
    if (lineNumber === null) {
      return null;
    }
    return {
      file: contextLine[1],
      lineNumber,
      content: `[context] ${contextLine[3]}`,
    };
  }

  return null;
}

/** Parse `rg --count` / `grep -c` output: `path:count` (count is the trailing `:digits`). */
function parseCountLine(line: string): { file: string; lineNumber: number; content: string } {
  const countMatch = line.match(/:(\d+)$/);
  if (!countMatch) {
    return { file: line, lineNumber: 0, content: "Count: 0" };
  }
  const count = parseLineNumber(countMatch[1]) ?? 0;
  const file = line.slice(0, -countMatch[0].length);
  return {
    file,
    lineNumber: 0,
    content: `Count: ${count}`,
  };
}

export const createGrepTool = () => {
  return tool({
    description:
      "Searches file contents using regular expressions. Returns file paths and line numbers with matching content. " +
      "Uses ripgrep (rg) when available, falls back to grep. " +
      'Use output_mode="files_with_matches" for broad searches (just file paths). ' +
      'Use output_mode="count" to get match counts per file. ' +
      "Supports pagination with offset/limit, context lines, and case-insensitive search.",
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
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Number of matches to skip (0-indexed). Use for pagination. Defaults to 0."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe(`Maximum number of matches to return. Defaults to ${DEFAULT_LIMIT}.`),
      outputMode: z
        .enum(["content", "files_with_matches", "count"])
        .optional()
        .describe(
          'Output mode: "content" (default, shows matching lines), ' +
            '"files_with_matches" (just file paths), "count" (match counts per file).' +
            ' Use "files_with_matches" for broad searches.'
        ),
      context: z
        .number()
        .int()
        .min(0)
        .max(20)
        .optional()
        .describe("Lines of surrounding context per match (only with output_mode 'content'). Defaults to 0."),
    }),
    outputSchema: grepOutputSchema,
    execute: async ({ pattern, path, include, ignoreCase, offset, limit, outputMode, context }, { toolCallId }) => {
      return withDuration(async () => {
        const searchPath = path ?? ".";
        const skip = offset ?? 0;
        const take = limit ?? DEFAULT_LIMIT;
        const mode = outputMode ?? "content";
        const contextLines = context ?? 0;
        const fetchCount = skip + take + 1;

        const searchOptions = {
          ignoreCase: ignoreCase ?? false,
          include,
          outputMode: mode,
          context: contextLines,
          fetchCount,
        };

        const rawOutput = await runSearchCommand(
          buildRgCommand(pattern, searchPath, searchOptions),
          buildGrepCommand(pattern, searchPath, searchOptions)
        );

        const lines = rawOutput
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        if (lines.length === 0) {
          return {
            matches: [] as { file: string; lineNumber: number; content: string }[],
            content: "",
            offset: skip,
            limit: take,
            cachedOutputPath: null,
          };
        }

        let allMatches: { file: string; lineNumber: number; content: string }[] = [];
        let totalContentLength = 0;

        if (mode === "files_with_matches") {
          allMatches = lines.map((file) => ({
            file,
            lineNumber: 0,
            content: "",
          }));
        } else if (mode === "count") {
          allMatches = lines.map((line) => parseCountLine(line));
        } else {
          for (const line of lines) {
            const parsed = parseGrepLine(line);
            if (!parsed) continue;

            if (parsed.content.length > MAX_CONTENT_LENGTH) {
              parsed.content = truncateContent(parsed.content, MAX_CONTENT_LENGTH);
            }

            totalContentLength += parsed.content.length;
            if (totalContentLength > MAX_TOTAL_CONTENT) {
              parsed.content = "[content omitted - total size limit reached]";
            }

            allMatches.push(parsed);
          }
        }

        // Drop any match with an invalid line number (NaN serializes to null in JSON).
        const validMatches = allMatches.filter((m) => Number.isFinite(m.lineNumber));
        const paginatedMatches = validMatches.slice(skip, skip + take);

        const fullMatchText = paginatedMatches.map((m) => `${m.file}:${m.lineNumber}:${m.content}`).join("\n");
        const cached = await maybeCacheOutput(fullMatchText, `${toolCallId}-grep`);
        const { cachedOutputPath } = cached;

        return {
          matches: cachedOutputPath ? [] : paginatedMatches,
          content: cached.content,
          offset: skip,
          limit: take,
          cachedOutputPath,
        };
      });
    },

    // Only send matches to the LLM — search params are echoed in the input,
    // pagination/truncation/cache metadata is for the UI only.
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: GrepOutput }) {
      const lines = output.matches.map((m) => `${m.file}:${m.lineNumber}: ${m.content}`);
      return {
        type: "content" as const,
        value: [
          {
            type: "text" as const,
            text:
              `<params> offset(current pagination): ${output.offset}; limit(Maximum number of items to return): ${output.limit} </params>` +
              (output.content || `${output.matches.length} matches:\n${lines.join("\n")}`),
          },
        ],
      };
    },
  });
};
