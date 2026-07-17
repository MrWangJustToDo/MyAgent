import chalk from "chalk";

function formatFilePathInput(input: Record<string, unknown>, toolName?: string): string {
  const path = input.path as string | undefined;
  if (!path) return "";

  if (toolName === "read_file" && (input.offset !== undefined || input.limit !== undefined)) {
    const offset = typeof input.offset === "number" ? input.offset : undefined;
    const limit = typeof input.limit === "number" ? input.limit : undefined;

    if (offset !== undefined && limit !== undefined) {
      return `${path} lines ${offset}-${offset + limit - 1}`;
    }
    if (offset !== undefined) {
      return `${path} from line ${offset}`;
    }
    if (limit !== undefined) {
      return `${path} first ${limit} lines`;
    }
  }

  return path;
}

function formatRunCommandInput(input: Record<string, unknown>): string {
  const command = input.command as string | undefined;
  let res = chalk.bold.green("$");
  res += ` ${command ?? ""}`;
  if (input.cwd) {
    res += ` (cwd: ${input.cwd})`;
  }
  if (input.timeout) {
    res += ` (timeout: ${input.timeout}ms)`;
  }
  if (input.run_in_background) {
    res += ` (background: true)`;
  }
  return res;
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

/** Format tool input for display based on tool name. */
export function formatToolInput(input: unknown, toolName?: string): string {
  if (input === undefined || input === null) return "";

  if (toolName && typeof input === "object") {
    const obj = input as Record<string, unknown>;

    switch (toolName) {
      case "read_file":
        return formatFilePathInput(obj, toolName);
      case "list_file":
      case "write_file":
      case "edit_file":
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
      case "ask_user":
        return formatAskUserInput(obj);
      case "list_skills":
        return "";
      default:
        return formatGenericInput(input);
    }
  }

  return formatGenericInput(input);
}
