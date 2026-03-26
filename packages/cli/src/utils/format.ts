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
// Tool Formatting
// ============================================================================

/** Format duration in milliseconds to a human-readable string */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

/** Format tool input for display */
export function formatToolInput(input: unknown): string {
  if (input === undefined || input === null) return "";
  if (typeof input === "string") return input.length > 50 ? input.slice(0, 50) + "..." : input;

  const obj = input as Record<string, unknown>;
  const entries = Object.entries(obj);
  if (entries.length === 0) return "";

  const formatted = entries
    .slice(0, 2)
    .map(([key, value]) => {
      const strValue = typeof value === "string" ? value : JSON.stringify(value);
      const truncated = strValue.length > 30 ? strValue.slice(0, 30) + "..." : strValue;
      return `${key}=${truncated}`;
    })
    .join(", ");

  return entries.length > 2 ? `(${formatted}, ...)` : `(${formatted})`;
}

// ============================================================================
// Tool-Specific Formatters
// ============================================================================

function formatListFileOutput(output: ListFileOutput): string {
  const { entries, count } = output;
  if (count === 0) return "Empty directory";

  // Show first few entries
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

function formatRunCommandOutput(output: RunCommandOutput): string {
  const { stdout, stderr, exitCode, success } = output;

  const lines: string[] = [];

  // Show exit status if failed
  if (!success) {
    lines.push(`Exit code: ${exitCode}`);
  }

  // Show stderr if present (often contains errors/warnings)
  if (stderr && stderr.trim()) {
    const stderrLines = stderr.trim().split("\n");
    const maxLines = 3;
    if (stderrLines.length <= maxLines) {
      lines.push(...stderrLines.map((l) => `stderr: ${l}`));
    } else {
      lines.push(...stderrLines.slice(0, maxLines).map((l) => `stderr: ${l}`));
      lines.push(`stderr: ... (${stderrLines.length - maxLines} more lines)`);
    }
  }

  // Show stdout summary
  if (stdout && stdout.trim()) {
    const stdoutLines = stdout.trim().split("\n");
    const maxLines = 5;
    if (stdoutLines.length <= maxLines) {
      lines.push(...stdoutLines);
    } else {
      lines.push(...stdoutLines.slice(0, maxLines));
      lines.push(`... (${stdoutLines.length - maxLines} more lines)`);
    }
  }

  if (lines.length === 0) {
    return success ? "Command completed successfully" : `Command failed (exit ${exitCode})`;
  }

  return lines.join("\n");
}

function formatReadFileOutput(output: ReadFileOutput): string {
  return output.message;
}

function formatWriteFileOutput(output: WriteFileOutput): string {
  return output.message;
}

function formatEditFileOutput(output: EditFileOutput): string {
  return output.message;
}

function formatGlobOutput(output: GlobOutput): string {
  const { files, count } = output;
  if (count === 0) return "No files found";

  const maxShow = 5;
  const shown = files.slice(0, maxShow);
  const lines = shown.map((f) => `  ${f}`);

  if (count > maxShow) {
    lines.push(`  ... and ${count - maxShow} more`);
  }

  return `${count} files found:\n${lines.join("\n")}`;
}

function formatGrepOutput(output: GrepOutput): string {
  const { matches, count, contentTruncated } = output;
  if (count === 0) return "No matches found";

  const maxShow = 5;
  const shown = matches.slice(0, maxShow);
  const lines = shown.map((m) => `  ${m.file}:${m.lineNumber}`);

  if (count > maxShow || contentTruncated) {
    const remaining = count - maxShow;
    if (remaining > 0) {
      lines.push(`  ... and ${remaining} more matches`);
    }
  }

  return `${count} matches:\n${lines.join("\n")}`;
}

function formatTodoOutput(output: TodoOutput): string {
  return output.message;
}

function formatTaskOutput(output: TaskOutput): string {
  const { summary, iterations, truncated, reachedLimit, usage } = output;

  const lines: string[] = [];

  // Status line
  const statusParts: string[] = [];
  statusParts.push(`${iterations} iteration${iterations !== 1 ? "s" : ""}`);
  statusParts.push(`${usage.totalTokens} tokens`);
  if (truncated) statusParts.push("truncated");
  if (reachedLimit) statusParts.push("limit reached");
  lines.push(`[${statusParts.join(", ")}]`);

  // Summary (show first few lines)
  const summaryLines = summary.trim().split("\n");
  const maxSummaryLines = 10;
  if (summaryLines.length <= maxSummaryLines) {
    lines.push(...summaryLines);
  } else {
    lines.push(...summaryLines.slice(0, maxSummaryLines));
    lines.push(`... (${summaryLines.length - maxSummaryLines} more lines)`);
  }

  return lines.join("\n");
}

// ============================================================================
// Main Format Function
// ============================================================================

/** Format tool output for display based on tool name */
export function formatToolOutput(output: unknown, toolName?: string): string {
  if (output === undefined || output === null) return "";

  // Try to use tool-specific formatter
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
      default:
        // For unknown tools, try to use message field if available
        if ("message" in out && typeof out.message === "string") {
          return out.message;
        }
    }
  }

  // Fallback: show truncated JSON
  const str = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return str.length > 200 ? str.slice(0, 200) + "..." : str;
}

/** Format tool arguments for detailed display (multi-line) */
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
