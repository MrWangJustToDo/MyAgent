import { getUiToolState, parseToolInput } from "./tool-part.js";

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

/** Minimum contiguous foldable tools before collapsing into an activity summary. */
export const MIN_FOLD_COUNT = 3;

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
  grep: "searches",
  glob: "searches",
  websearch: "searches",
  webfetch: "searches",
  run_command: "commands",
  get_command_output: "commands",
  kill_command: "commands",
  task: "tasks",
};

/** Tools that always stay as one-line rows in compact transcript mode. */
export const HIGH_SIGNAL_TOOLS = new Set([
  "edit_file",
  "write_file",
  "delete_file",
  "run_command",
  "get_command_output",
  "kill_command",
  "task",
  "todo",
  "create_plan",
  "update_plan",
  "ask_user",
  "compact",
]);

/** Exploration tools that may fold into activity summaries when successfully completed. */
export const FOLDABLE_NOISE_TOOLS = new Set([
  "read_file",
  "list_file",
  "tree",
  "grep",
  "glob",
  "websearch",
  "webfetch",
]);

/**
 * Whether a tool call must stay as a real row in compact mode.
 * Covers high-signal names plus lifecycle (executing / incomplete / error / denied / approval).
 */
export function shouldKeepToolRow(part: ToolCallPart): boolean {
  const ui = getUiToolState(part);
  if (
    ui === "approval-requested" ||
    ui === "output-error" ||
    ui === "output-denied" ||
    ui === "input-streaming" ||
    ui === "input-available" ||
    ui === "approval-responded"
  ) {
    return true;
  }

  // Abort / Esc mid-tool: no output yet — never fold away.
  if (part.output === undefined) return true;

  if (HIGH_SIGNAL_TOOLS.has(part.name)) return true;

  return false;
}

/** Successfully completed foldable noise (reads/searches/other non-signal). */
export function shouldFoldToolRow(part: ToolCallPart): boolean {
  if (shouldKeepToolRow(part)) return false;
  if (FOLDABLE_NOISE_TOOLS.has(part.name)) return true;
  // Non-signal "other" tools (e.g. skill discovery) fold when complete.
  return !HIGH_SIGNAL_TOOLS.has(part.name);
}

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

function basenameLabel(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

function shortenLabel(raw: string, max = 28): string {
  const text = raw.trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Extract a short path / pattern / query label from a tool call for activity lines. */
export function extractActivityLabel(part: ToolCallPart): string | null {
  const input = parseToolInput(part);
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;

  if (typeof obj.path === "string" && obj.path) return shortenLabel(basenameLabel(obj.path));
  if (typeof obj.pattern === "string" && obj.pattern) return shortenLabel(JSON.stringify(obj.pattern));
  if (typeof obj.query === "string" && obj.query) return shortenLabel(JSON.stringify(obj.query));
  if (typeof obj.url === "string" && obj.url) {
    try {
      return shortenLabel(new URL(obj.url).hostname || obj.url);
    } catch {
      return shortenLabel(obj.url);
    }
  }
  if (typeof obj.name === "string" && obj.name) return shortenLabel(obj.name);
  return null;
}

/**
 * Path-aware activity line for compact mode, e.g.
 * `Explored 3 files · a.ts, b.ts, +1` or `2 reads, 1 search · foo.ts, "bar"`.
 */
export function formatExploredActivitySummary(parts: ToolCallPart[]): string | null {
  const list = Array.from(parts);
  if (list.length === 0) return null;

  const counts = countToolActivity(list);
  const countText = formatToolActivitySummary(counts);
  if (!countText) return null;

  const labels: string[] = [];
  const seen = new Set<string>();
  for (const part of list) {
    const label = extractActivityLabel(part);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }

  const onlyReads =
    counts.reads > 0 &&
    counts.searches === 0 &&
    counts.edits === 0 &&
    counts.commands === 0 &&
    counts.tasks === 0 &&
    counts.other === 0;

  const head = onlyReads ? (counts.reads === 1 ? "Explored 1 file" : `Explored ${counts.reads} files`) : countText;

  if (labels.length === 0) return head;

  const shown = labels.slice(0, 2);
  const extra = labels.length - shown.length;
  const detail = extra > 0 ? `${shown.join(", ")}, +${extra}` : shown.join(", ");
  return `${head} · ${detail}`;
}

/** Count + format in one step (counts only). */
export function summarizeToolActivity(parts: Iterable<ToolCallPart>): string | null {
  return formatToolActivitySummary(countToolActivity(parts));
}
