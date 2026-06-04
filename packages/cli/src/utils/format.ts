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

// ============================================================================
// Tool-Specific Input Formatters
// ============================================================================

function formatFilePathInput(input: Record<string, unknown>): string {
  const path = input.path as string | undefined;
  if (!path) return "";
  const parts: string[] = [path];
  if (input.offset !== undefined || input.limit !== undefined) {
    const range = [
      input.offset !== undefined ? `offset=${input.offset}` : "",
      input.limit !== undefined ? `limit=${input.limit}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    parts.push(`(${range})`);
  }
  return parts.join(" ");
}

function formatRunCommandInput(input: Record<string, unknown>): string {
  const command = input.command as string | undefined;
  return command ?? "";
}

function formatGrepInput(input: Record<string, unknown>): string {
  const pattern = input.pattern as string | undefined;
  if (!pattern) return "";
  const parts: string[] = [JSON.stringify(pattern)];
  if (input.path) parts.push(`in ${input.path}`);
  if (input.include) parts.push(`--include=${input.include}`);
  return parts.join(" ");
}

function formatGlobInput(input: Record<string, unknown>): string {
  const pattern = input.pattern as string | undefined;
  if (!pattern) return "";
  const parts: string[] = [JSON.stringify(pattern)];
  if (input.path) parts.push(`in ${input.path}`);
  return parts.join(" ");
}

function formatTaskInput(input: Record<string, unknown>): string {
  const description = input.description as string | undefined;
  const prompt = input.prompt as string | undefined;
  if (description) return description;
  if (prompt) {
    return prompt.length > 60 ? prompt.slice(0, 60) + "..." : prompt;
  }
  return "";
}

function formatTodoInput(input: Record<string, unknown>): string {
  const title = input.title as string | undefined;
  return title ?? "";
}

function formatWebSearchInput(input: Record<string, unknown>): string {
  const query = input.query as string | undefined;
  return query ? JSON.stringify(query) : "";
}

function formatWebFetchInput(input: Record<string, unknown>): string {
  const url = input.url as string | undefined;
  return url ?? "";
}

function formatTreeInput(input: Record<string, unknown>): string {
  const path = (input.path as string) ?? ".";
  const parts: string[] = [path];
  if (input.maxDepth !== undefined) parts.push(`depth=${input.maxDepth}`);
  if (input.pattern) parts.push(`pattern=${input.pattern}`);
  return parts.join(" ");
}

function formatMoveOrCopyInput(input: Record<string, unknown>): string {
  const source = input.sourcePath as string | undefined;
  const target = input.targetPath as string | undefined;
  if (!source || !target) return "";
  return `${source} → ${target}`;
}

function formatLoadSkillInput(input: Record<string, unknown>): string {
  const name = input.name as string | undefined;
  return name ?? "";
}

function formatGenericInput(input: unknown): string {
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

function formatAskUserInput(input: Record<string, unknown>): string {
  const question = input.question as string | undefined;
  return question ?? "";
}

/** Format tool input for display based on tool name */
export function formatToolInput(input: unknown, toolName?: string): string {
  if (input === undefined || input === null) return "";

  if (toolName && typeof input === "object") {
    const obj = input as Record<string, unknown>;

    switch (toolName) {
      case "read_file":
      case "list_file":
      case "write_file":
      case "edit_file":
      case "search_replace":
      case "delete_file":
        return formatFilePathInput(obj);
      case "run_command":
        return formatRunCommandInput(obj);
      case "grep":
        return formatGrepInput(obj);
      case "glob":
        return formatGlobInput(obj);
      case "task":
        return formatTaskInput(obj);
      case "todo":
        return formatTodoInput(obj);
      case "web_search":
        return formatWebSearchInput(obj);
      case "web_fetch":
        return formatWebFetchInput(obj);
      case "tree":
        return formatTreeInput(obj);
      case "move_file":
      case "copy_file":
        return formatMoveOrCopyInput(obj);
      case "load_skill":
        return formatLoadSkillInput(obj);
      case "ask_user": {
        return formatAskUserInput(obj);
      }
      case "list_skills":
        return "";
      default:
        return formatGenericInput(input);
    }
  }

  return formatGenericInput(input);
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

  if (!success) {
    lines.push(`Exit code: ${exitCode}`);
  }

  // Show last few lines of stderr (most relevant for errors)
  if (stderr && stderr.trim()) {
    const stderrLines = stderr.trim().split("\n");
    const tail = stderrLines.slice(-3);
    if (stderrLines.length > 3) {
      lines.push(`stderr: ... (${stderrLines.length - 3} more lines)`);
    }
    lines.push(...tail.map((l) => `stderr: ${l}`));
  }

  // Show last few lines of stdout
  if (stdout && stdout.trim()) {
    const stdoutLines = stdout.trim().split("\n");
    const tail = stdoutLines.slice(-3);
    if (stdoutLines.length > 3) {
      lines.push(`... (${stdoutLines.length - 3} more lines)`);
    }
    lines.push(...tail);
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
