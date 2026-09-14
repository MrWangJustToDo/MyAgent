import type { ToolActivityCategory, ToolPresentation } from "./types.js";

/**
 * Built-in fallback table: presentation for tools that do not declare their own
 * metadata (e.g. a third-party tool reusing a built-in name).
 *
 * Migrated out of `packages/app/src/utils/tool-activity-summary.ts` (`TOOL_BUCKET`)
 * and `packages/app/src/utils/tool-display.ts` (keep-row / detailed sets). Stage 2 of
 * the change moves each entry to the tool's definition site; the table stays as the
 * last-resort layer, and the app copy is deleted.
 */
export interface BuiltinPresentationEntry {
  category: ToolActivityCategory;
  /** Completed rows never fold (interactive / structured results). */
  keepRow?: boolean;
  /** Detailed result block in full display. */
  detailed?: boolean;
  /** The host supplies the result. */
  clientSide?: boolean;
}

export const BUILTIN_PRESENTATION: Record<string, BuiltinPresentationEntry> = {
  // File / resource inspection.
  read_file: { category: "reads" },
  list_file: { category: "reads" },
  tree: { category: "reads" },
  // LSP inspection (read-like queries).
  lsp_definition: { category: "reads" },
  lsp_references: { category: "reads" },
  lsp_hover: { category: "reads" },
  lsp_symbols: { category: "reads" },
  code_overview: { category: "reads" },
  // Memory / skill retrieval.
  memory_read: { category: "reads" },
  load_skill: { category: "reads" },

  // State / file mutation.
  edit_file: { category: "edits" },
  write_file: { category: "edits" },
  delete_file: { category: "edits" },
  lsp_rename: { category: "edits" },
  code_rewrite: { category: "edits" },
  memory_write: { category: "edits" },

  // Discovery / searching.
  grep: { category: "searches" },
  glob: { category: "searches" },
  websearch: { category: "searches" },
  webfetch: { category: "searches" },
  lsp_diagnostics: { category: "searches" },
  lsp_completions: { category: "searches" },
  lsp_code_actions: { category: "searches" },
  ast_search: { category: "searches" },
  memory_list: { category: "searches" },
  list_skills: { category: "searches" },
  discover_tools: { category: "searches" },

  // Shell / code execution.
  run_command: { category: "commands", detailed: true },
  get_command_output: { category: "commands", detailed: true },
  kill_command: { category: "commands", detailed: true },
  execute_typescript: { category: "commands" },

  // Delegation.
  task: { category: "tasks", detailed: true },

  // Structured / interactive results (row is the message).
  ask_user: { category: "other", keepRow: true, detailed: true, clientSide: true },
  todo: { category: "other", keepRow: true, detailed: true },
  complete_plan: { category: "other", keepRow: true, detailed: true },
  create_plan: { category: "other" },
  update_plan: { category: "other" },
};

export function builtinPresentationNames(): string[] {
  return Object.keys(BUILTIN_PRESENTATION);
}

/** Fallback descriptor for a built-in name (flags only; text/summary/input come from the ported formatters). */
export function builtinPresentation(name: string): ToolPresentation | undefined {
  const entry = BUILTIN_PRESENTATION[name];
  if (!entry) return undefined;
  return { ...entry };
}
