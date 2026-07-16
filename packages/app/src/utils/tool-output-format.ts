import { splitStreamingLines } from "./streaming-output-lines.js";

import type {
  EditFileOutput,
  GlobOutput,
  GrepOutput,
  ListFileOutput,
  ReadFileOutput,
  RunCommandOutput,
  TaskOutput,
  TodoOutput,
  WriteFileOutput,
} from "@my-agent/core";

// ============================================================================
// Helpers
// ============================================================================

const CACHE_HINT_PATTERNS = [
  /^Full output saved to:\s*.agent-cache\//,
  /^Use read_file with path=".agent-cache\//,
  /^\.\.\.\s*\(\d+\s+lines?\s+omitted\)\s*\.\.\.$/,
  /^\.\.\.\s*\(\d+\s+chars?\s+omitted\)\s*\.\.\.$/,
];

/** Strip LLM-directed cache hint lines from tool output for user display. */
function stripCacheHintLines(lines: string[]): string[] {
  return lines.filter((line) => !CACHE_HINT_PATTERNS.some((pattern) => pattern.test(line)));
}

/** Strip "(large output/content cached to disk)" note from message text. */
export function stripCacheNote(message: string): string {
  return message.replace(/\s*\(large (?:output|content) cached to disk\)/, "");
}

// ============================================================================
// Formatters
// ============================================================================

function formatListFileOutput(output: ListFileOutput): string {
  const { entries, count } = output;
  if (count === 0) return "Empty directory";

  const maxShow = 5;
  const shown = entries.slice(0, maxShow);
  const lines = shown.map((e) => {
    const icon = e.type === "directory" ? "/" : "";
    return `  ${e.name}${icon}`;
  });

  if (count > maxShow) {
    lines.push(`  ... and ${count - maxShow} more`);
  }

  return `${count} entries:\n${lines.join("\n")}`;
}

/** Max width for individual output lines before truncation. */
const MAX_LINE_WIDTH = 400;

function truncateLine(line: string, maxWidth: number = MAX_LINE_WIDTH): string {
  // Defense: strip any leftover CR before measuring / rendering in Ink.
  const cleaned = line.replace(/\r/g, "");
  if (cleaned.length > maxWidth) {
    return cleaned.slice(0, maxWidth - 3) + "...";
  }
  return cleaned;
}

function formatRunCommandOutput(output: RunCommandOutput): string {
  const { stdout, stderr, exitCode, success } = output;
  const lines: string[] = [];

  if (!success) {
    lines.push(`Exit code: ${exitCode}`);
  }

  if (stderr && stderr.trim()) {
    const stderrLines = stripCacheHintLines(splitStreamingLines(stderr.trim()));
    const tail = stderrLines.slice(-3);
    if (stderrLines.length > 3) {
      lines.push(`stderr: ... (${stderrLines.length - 3} more lines)`);
    }
    lines.push(...tail.map((line) => `stderr: ${truncateLine(line)}`));
  }

  if (stdout && stdout.trim()) {
    const stdoutLines = stripCacheHintLines(splitStreamingLines(stdout.trim()));
    const tail = stdoutLines.slice(-3);
    if (stdoutLines.length > 3) {
      lines.push(`... (${stdoutLines.length - 3} more lines)`);
    }
    lines.push(...tail.map((i) => truncateLine(i)));
  }

  if (lines.length === 0) {
    return success ? "Command completed successfully" : `Command failed (exit ${exitCode})`;
  }

  return lines.join("\n");
}

function formatReadFileOutput(output: ReadFileOutput): string {
  // Derive a summary from structured fields instead of the removed `message`.
  if (output.type === "text") {
    return `Read ${output.path} (lines ${output.startLine}-${output.endLine} of ${output.totalLines})`;
  }
  if (output.type === "directory") {
    return `Listed ${output.path} (${output.entries.length}/${output.totalEntries} entries)`;
  }
  if (output.type === "image") {
    return `Image: ${output.path} (${Math.round(output.size / 1024)}KB)`;
  }
  if (output.type === "pdf") {
    return `PDF: ${output.path} (${Math.round(output.size / 1024)}KB)`;
  }
  return "";
}

function formatWriteFileOutput(output: WriteFileOutput): string {
  return output.created ? `Created file: ${output.path}` : `Overwrote file: ${output.path}`;
}

function formatEditFileOutput(output: EditFileOutput): string {
  return `Edited ${output.path} (${output.replacements} replacement${output.replacements !== 1 ? "s" : ""})`;
}

function formatGlobOutput(output: GlobOutput): string {
  const { files } = output;
  if (files.length === 0) return "No files found";

  const maxShow = 5;
  const shown = files.slice(0, maxShow);
  const lines = shown.map((file) => `  ${file}`);

  if (files.length > maxShow) {
    lines.push(`  ... and ${files.length - maxShow} more`);
  }

  return `${files.length} files found:\n${lines.join("\n")}`;
}

function formatGrepOutput(output: GrepOutput): string {
  const { matches } = output;
  if (matches.length === 0) return "No matches found";

  const maxShow = 5;
  const shown = matches.slice(0, maxShow);
  const lines = shown.map((match) => {
    const line = Number.isFinite(match.lineNumber) && match.lineNumber > 0 ? match.lineNumber : "?";
    return `  ${match.file}:${line}`;
  });

  if (matches.length > maxShow) {
    lines.push(`  ... and ${matches.length - maxShow} more matches`);
  }

  return `${matches.length} matches:\n${lines.join("\n")}`;
}

function formatTodoOutput(output: TodoOutput): string {
  const { stats } = output;
  return `Updated ${stats.total} todos: ${stats.completed} completed, ${stats.inProgress} in progress, ${stats.pending} pending`;
}

function formatAskUserOutput(output: { question?: string; answer?: string; hasOptions?: boolean }): string {
  const { answer, hasOptions } = output;
  if (!answer) return "";

  const lines: string[] = [];
  // Label distinguishes a picked option from a free-form typed answer,
  // mirroring how the question itself is shown in the tool header.
  lines.push(hasOptions ? `Selected: ${truncateLine(answer)}` : `Answer: ${truncateLine(answer)}`);
  return lines.join("\n");
}

function formatTaskOutput(output: TaskOutput): string {
  const { summary, iterations, truncated, reachedLimit, incomplete, usage } = output;
  const lines: string[] = [];
  const statusParts: string[] = [];

  if (typeof incomplete === "number") statusParts.push(`${iterations} iteration${iterations !== 1 ? "s" : ""}`);
  if (usage) statusParts.push(`${usage.totalTokens} tokens`);
  if (truncated) statusParts.push("truncated");
  if (reachedLimit) statusParts.push("limit reached");
  if (incomplete && !reachedLimit) statusParts.push("stalled");
  if (!summary) return "";
  lines.push(`[${statusParts.join(", ")}]`);

  const summaryLines = stripCacheHintLines(splitStreamingLines(summary.trim()));
  const maxSummaryLines = 10;
  const shown = summaryLines.length <= maxSummaryLines ? summaryLines : summaryLines.slice(0, maxSummaryLines);
  lines.push(...shown.map((i) => truncateLine(i)));
  if (summaryLines.length > maxSummaryLines) {
    lines.push(`... (${summaryLines.length - maxSummaryLines} more lines)`);
  }

  return lines.join("\n");
}

/** Format tool output for display based on tool name. */
export function formatToolOutput(output: unknown, toolName?: string): string {
  if (output === undefined || output === null) return "";

  if (toolName && typeof output === "object") {
    const out = output as Record<string, unknown>;

    switch (toolName) {
      case "list_file":
        return formatListFileOutput(out as unknown as ListFileOutput);
      case "run_command":
        return formatRunCommandOutput(out as unknown as RunCommandOutput);
      case "read_file":
        return formatReadFileOutput(out as unknown as ReadFileOutput);
      case "write_file":
        return formatWriteFileOutput(out as unknown as WriteFileOutput);
      case "edit_file":
        return formatEditFileOutput(out as unknown as EditFileOutput);
      case "glob":
        return formatGlobOutput(out as unknown as GlobOutput);
      case "grep":
        return formatGrepOutput(out as unknown as GrepOutput);
      case "todo":
        return formatTodoOutput(out as unknown as TodoOutput);
      case "task":
        return formatTaskOutput(out as unknown as TaskOutput);
      case "ask_user":
        return formatAskUserOutput(
          out as unknown as { question?: string; answer?: string; hasOptions?: boolean; message?: string }
        );
      default:
        // No generic fallback to output.message (removed in phase 2).
        // Unknown tools get an empty string; they should add a dedicated case.
        return "";
    }
  }

  const str = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return str.length > 200 ? str.slice(0, 200) + "..." : str;
}

/** Format tool arguments for detailed display. */
export function formatToolArgs(args: unknown): string {
  if (args === undefined || args === null) return "No arguments";
  if (typeof args === "string") return args.length > 50 ? args.slice(0, 50) + "..." : args;

  const obj = args as Record<string, unknown>;
  const entries = Object.entries(obj);
  if (entries.length === 0) return "No arguments";

  return entries
    .map(([key, value]) => {
      const strValue = typeof value === "string" ? value : JSON.stringify(value);
      const truncated = strValue.length > 50 ? strValue.slice(0, 50) + "..." : strValue;
      return `  ${key}: ${truncated}`;
    })
    .join("\n");
}
