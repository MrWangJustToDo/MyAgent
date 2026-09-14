/**
 * Registry for per-tool display metadata used by the compact transcript:
 * the fold bucket for activity summaries and an optional short label for a
 * call's input.
 *
 * Parallel to {@link registerToUI} but for transcript density instead of the
 * result block text. Extensions (and custom tools) declare their own grouping
 * here, so the host does not have to grow another hard-coded tool-name table.
 */
export type ToolActivityCategory = "reads" | "edits" | "searches" | "commands" | "tasks" | "other";

export interface ToolDisplayMeta {
  /**
   * Fold bucket for activity summaries. Falls back to the host's built-in
   * table, then to `"other"`.
   */
  category?: ToolActivityCategory;
  /**
   * Short label for a tool call (rendered in activity-summary label lists),
   * derived from the parsed tool input. Return undefined for no label.
   */
  label?: (input: unknown) => string | undefined;
}

const displayRegistry = new Map<string, ToolDisplayMeta>();

export function registerToolDisplay(toolName: string, meta: ToolDisplayMeta): void {
  displayRegistry.set(toolName, meta);
}

export function getToolDisplay(toolName: string): ToolDisplayMeta | undefined {
  return displayRegistry.get(toolName);
}

export function clearToolDisplay(): void {
  displayRegistry.clear();
}
