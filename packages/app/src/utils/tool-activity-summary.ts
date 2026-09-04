import { formatDuration } from "./format.js";
import { DURATION_THRESHOLD_MS, getDurationMs } from "./tool-display.js";
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
  errors: number;
};

export type ToolActivityBucket = keyof ToolActivityCounts;

const BUCKET_ORDER: ToolActivityBucket[] = ["reads", "edits", "searches", "commands", "tasks", "other", "errors"];

const BUCKET_LABEL: Record<ToolActivityBucket, { one: string; many: string }> = {
  reads: { one: "read", many: "reads" },
  edits: { one: "edit", many: "edits" },
  searches: { one: "search", many: "searches" },
  commands: { one: "command", many: "commands" },
  tasks: { one: "task", many: "tasks" },
  other: { one: "other", many: "other" },
  errors: { one: "error", many: "errors" },
};

const TOOL_BUCKET: Record<string, ToolActivityBucket> = {
  // File / resource inspection.
  read_file: "reads",
  list_file: "reads",
  tree: "reads",
  // LSP inspection (read-like queries).
  lsp_definition: "reads",
  lsp_references: "reads",
  lsp_hover: "reads",
  lsp_symbols: "reads",
  code_overview: "reads",
  // Memory / skill retrieval.
  memory_read: "reads",
  load_skill: "reads",

  // State / file mutation.
  edit_file: "edits",
  write_file: "edits",
  delete_file: "edits",
  // LSP mutation.
  lsp_rename: "edits",
  code_rewrite: "edits",
  memory_write: "edits",

  // Discovery / searching.
  grep: "searches",
  glob: "searches",
  websearch: "searches",
  webfetch: "searches",
  // LSP analysis queries.
  lsp_diagnostics: "searches",
  lsp_completions: "searches",
  lsp_code_actions: "searches",
  ast_search: "searches",
  // Memory / skill listing.
  memory_list: "searches",
  list_skills: "searches",
  discover_tools: "searches",

  // Shell / code execution.
  run_command: "commands",
  get_command_output: "commands",
  kill_command: "commands",
  execute_typescript: "commands",

  // Delegation.
  task: "tasks",
};

/**
 * Whether a tool call must stay as a real row in compact mode.
 * Covers lifecycle states (executing / incomplete / denied / approval).
 * Errored tool rows may fold into an activity summary (counted as errors);
 * completed tools of any kind may fold into an activity summary.
 */
export function shouldKeepToolRow(part: ToolCallPart): boolean {
  const ui = getUiToolState(part);
  if (
    ui === "approval-requested" ||
    ui === "output-denied" ||
    ui === "input-streaming" ||
    ui === "input-available" ||
    ui === "approval-responded"
  ) {
    return true;
  }

  // Abort / Esc mid-tool: no output yet — never fold away.
  if (part.output === undefined) return true;

  return false;
}

/** Successfully completed tools of any kind may fold into an activity summary. */
export function shouldFoldToolRow(part: ToolCallPart): boolean {
  return !shouldKeepToolRow(part);
}

/** Errored tool rows fold into the activity summary as an error count. */
export function isErrorToolRow(part: ToolCallPart): boolean {
  return getUiToolState(part) === "output-error";
}

export function emptyToolActivityCounts(): ToolActivityCounts {
  return { reads: 0, edits: 0, searches: 0, commands: 0, tasks: 0, other: 0, errors: 0 };
}

/** Map a tool name to a summary bucket. */
export function getToolActivityBucket(toolName: string): ToolActivityBucket {
  return TOOL_BUCKET[toolName] ?? "other";
}

/** Count tool-call parts into activity buckets (dedupe by tool call id). Errored calls count as errors only — not double-counted in their own bucket. */
export function countToolActivity(parts: Iterable<ToolCallPart>): ToolActivityCounts {
  const counts = emptyToolActivityCounts();
  const seen = new Set<string>();

  for (const part of parts) {
    const id = part.id ?? `${part.name}:${JSON.stringify(part.arguments ?? "")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (isErrorToolRow(part)) {
      counts.errors += 1;
      continue;
    }
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

/** Quality tiers for activity labels (lower = more specific / useful). */
const TIER_FILE = 0;
const TIER_SEARCH = 1;
const TIER_DIR = 2;
const TIER_OTHER = 3;

type ActivityLabel = { text: string; tier: number };

/** Guess whether a path basename looks like a file (has a dotted extension). */
function looksLikeFile(basename: string): boolean {
  const idx = basename.lastIndexOf(".");
  return idx > 0 && idx < basename.length - 1;
}

/**
 * Extract a short path / pattern / query label from a tool call for activity lines,
 * ranked by usefulness: file basename > search pattern/query > directory basename.
 */
export function extractActivityLabelInfo(part: ToolCallPart): ActivityLabel | null {
  const input = parseToolInput(part);
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;

  // File path basenames are the most specific labels.
  if (typeof obj.path === "string" && obj.path) {
    const base = basenameLabel(obj.path);
    if (base && looksLikeFile(base)) {
      return { text: shortenLabel(base), tier: TIER_FILE };
    }
  }
  // Search terms beat directory basenames (a grep in `src` is about its pattern).
  if (typeof obj.pattern === "string" && obj.pattern) {
    return { text: shortenLabel(JSON.stringify(obj.pattern)), tier: TIER_SEARCH };
  }
  if (typeof obj.query === "string" && obj.query) {
    return { text: shortenLabel(JSON.stringify(obj.query)), tier: TIER_SEARCH };
  }
  // Directory basenames are least specific.
  if (typeof obj.path === "string" && obj.path) {
    const base = basenameLabel(obj.path);
    if (base) return { text: shortenLabel(base), tier: TIER_DIR };
  }
  if (typeof obj.url === "string" && obj.url) {
    try {
      return { text: shortenLabel(new URL(obj.url).hostname || obj.url), tier: TIER_OTHER };
    } catch {
      return { text: shortenLabel(obj.url), tier: TIER_OTHER };
    }
  }
  if (typeof obj.name === "string" && obj.name) {
    return { text: shortenLabel(obj.name), tier: TIER_OTHER };
  }
  return null;
}

/** Extract a short path / pattern / query label from a tool call for activity lines. */
export function extractActivityLabel(part: ToolCallPart): string | null {
  return extractActivityLabelInfo(part)?.text ?? null;
}

/**
 * Path-aware activity line for compact mode, e.g.
 * `Explored 3 files · a.ts, b.ts, +1 · 1.2s` or `2 reads, 1 error · foo.ts, "bar" · 850ms`.
 * Labels prefer file basenames over directories; a total elapsed time is appended
 * when the folded run is slow enough to be meaningful.
 */
export function formatExploredActivitySummary(parts: ToolCallPart[]): string | null {
  const list = Array.from(parts);
  if (list.length === 0) return null;

  const counts = countToolActivity(list);
  const countText = formatToolActivitySummary(counts);
  if (!countText) return null;

  const labels: ActivityLabel[] = [];
  const seen = new Set<string>();
  for (const part of list) {
    const label = extractActivityLabelInfo(part);
    if (!label || seen.has(label.text)) continue;
    seen.add(label.text);
    labels.push(label);
  }
  // Files first, then search terms, then directories — directories from tree/
  // list_file calls should not crowd out the actual files we touched.
  labels.sort((a, b) => a.tier - b.tier);

  const onlyReads =
    counts.reads > 0 &&
    counts.searches === 0 &&
    counts.edits === 0 &&
    counts.commands === 0 &&
    counts.tasks === 0 &&
    counts.other === 0 &&
    counts.errors === 0;

  const head = onlyReads ? (counts.reads === 1 ? "Explored 1 file" : `Explored ${counts.reads} files`) : countText;

  const parts2: string[] = [];
  if (labels.length > 0) {
    const shown = labels.slice(0, 2).map((l) => l.text);
    const extra = labels.length - shown.length;
    parts2.push(extra > 0 ? `${shown.join(", ")}, +${extra}` : shown.join(", "));
  }

  // Sum durationMs across the folded tools; only show when meaningful.
  const totalMs = list.reduce((sum, part) => sum + (getDurationMs(part.output) ?? 0), 0);
  if (totalMs >= DURATION_THRESHOLD_MS) {
    parts2.push(formatDuration(totalMs));
  }

  return parts2.length > 0 ? `${head} · ${parts2.join(" · ")}` : head;
}

/** Count + format in one step (counts only). */
export function summarizeToolActivity(parts: Iterable<ToolCallPart>): string | null {
  return formatToolActivitySummary(countToolActivity(parts));
}
