import type { ToolCallPart } from "@tanstack/ai";

/** Count buckets for Cursor-style turn activity lines. */
export type ToolActivityCounts = {
  reads: number;
  edits: number;
  searches: number;
  commands: number;
  tasks: number;
  other: number;
};

export type ToolActivityBucket = keyof ToolActivityCounts;

const BUCKET_ORDER: ToolActivityBucket[] = ["reads", "edits", "searches", "commands", "tasks", "other"];

const BUCKET_LABEL: Record<ToolActivityBucket, { one: string; many: string }> = {
  reads: { one: "read", many: "reads" },
  edits: { one: "edit", many: "edits" },
  searches: { one: "search", many: "searches" },
  commands: { one: "command", many: "commands" },
  tasks: { one: "task", many: "tasks" },
  other: { one: "other", many: "other" },
};

const TOOL_BUCKET: Record<string, ToolActivityBucket> = {
  read_file: "reads",
  list_file: "reads",
  tree: "reads",
  edit_file: "edits",
  write_file: "edits",
  delete_file: "edits",
  move_file: "edits",
  copy_file: "edits",
  grep: "searches",
  glob: "searches",
  run_command: "commands",
  get_command_output: "commands",
  kill_command: "commands",
  task: "tasks",
};

export function emptyToolActivityCounts(): ToolActivityCounts {
  return { reads: 0, edits: 0, searches: 0, commands: 0, tasks: 0, other: 0 };
}

/** Map a tool name to a summary bucket. */
export function getToolActivityBucket(toolName: string): ToolActivityBucket {
  return TOOL_BUCKET[toolName] ?? "other";
}

/** Count tool-call parts into activity buckets (dedupe by tool call id). */
export function countToolActivity(parts: Iterable<ToolCallPart>): ToolActivityCounts {
  const counts = emptyToolActivityCounts();
  const seen = new Set<string>();

  for (const part of parts) {
    const id = part.id ?? `${part.name}:${JSON.stringify(part.arguments ?? "")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    counts[getToolActivityBucket(part.name)] += 1;
  }

  return counts;
}

/** Format counts as `3 reads, 2 edits`. Returns null when there is nothing to show. */
export function formatToolActivitySummary(counts: ToolActivityCounts): string | null {
  const segments: string[] = [];
  for (const bucket of BUCKET_ORDER) {
    const n = counts[bucket];
    if (n <= 0) continue;
    const label = n === 1 ? BUCKET_LABEL[bucket].one : BUCKET_LABEL[bucket].many;
    segments.push(`${n} ${label}`);
  }
  return segments.length > 0 ? segments.join(", ") : null;
}

/** Count + format in one step. */
export function summarizeToolActivity(parts: Iterable<ToolCallPart>): string | null {
  return formatToolActivitySummary(countToolActivity(parts));
}
