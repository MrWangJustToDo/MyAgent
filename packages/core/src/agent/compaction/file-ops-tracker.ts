/**
 * File operation tracking for compaction summaries.
 *
 * Scans tool-call messages to build an accurate list of files read and modified.
 * This metadata is appended to the compaction summary so the LLM doesn't have to
 * rely on memory to list which files were involved.
 */

import type { ModelMessage } from "ai";

// ============================================================================
// Types & Constants
// ============================================================================

/**
 * Tracked file operations from tool calls.
 *
 * To add new tools, update READ_TOOLS or WRITE_TOOLS below.
 * For tools with non-standard arg field names (e.g., copy_file uses
 * sourcePath/targetPath instead of path), add special handling in
 * extractFileOpsFromMessages().
 */
export interface FileOps {
  /** Files that were read (read_file, list_file, tree, etc.) */
  readFiles: Set<string>;
  /** Files that were created or modified (write_file, edit_file, etc.) */
  modifiedFiles: Set<string>;
}

/** Tools that read file content or structure */
const READ_TOOLS = new Set(["read_file", "list_file", "tree"]);

/** Tools that create or modify files */
const WRITE_TOOLS = new Set(["write_file", "edit_file", "copy_file", "move_file", "delete_file"]);

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Extract a string path field from a tool-call's args.
 * Handles both object args and JSON-string args.
 */
function extractPathFromArgs(args: unknown, field: string): string | undefined {
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      const val = parsed[field];
      return typeof val === "string" && val.length > 0 ? val : undefined;
    } catch {
      return undefined;
    }
  }
  if (args && typeof args === "object") {
    const val = (args as Record<string, unknown>)[field];
    return typeof val === "string" && val.length > 0 ? val : undefined;
  }
  return undefined;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Extract file operations from assistant tool-call messages.
 *
 * Scans all assistant messages for tool-call parts and tracks:
 * - Files read: read_file, list_file, tree calls
 * - Files modified: write_file, edit_file, copy_file, move_file, delete_file
 *
 * @param messages - Messages to scan for tool calls
 * @returns Deduplicated sets of read and modified file paths
 *
 * @example
 * ```typescript
 * const ops = extractFileOpsFromMessages(messages);
 * console.log(ops.readFiles);     // Set {"src/index.ts", "package.json"}
 * console.log(ops.modifiedFiles); // Set {"src/new-file.ts"}
 * ```
 */
export function extractFileOpsFromMessages(messages: ModelMessage[]): FileOps {
  const ops: FileOps = { readFiles: new Set(), modifiedFiles: new Set() };

  for (const message of messages) {
    if (message.role !== "assistant") continue;

    const content = message.content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      const p = part as Record<string, unknown>;
      if (p.type !== "tool-call") continue;

      const toolName = p.toolName as string | undefined;
      if (!toolName) continue;

      const args = p.args;

      if (READ_TOOLS.has(toolName)) {
        const path = extractPathFromArgs(args, "path");
        if (path && path !== "." && path !== "./") {
          ops.readFiles.add(path);
        }
      } else if (WRITE_TOOLS.has(toolName)) {
        if (toolName === "copy_file" || toolName === "move_file") {
          const sourcePath = extractPathFromArgs(args, "sourcePath");
          const targetPath = extractPathFromArgs(args, "targetPath");
          if (targetPath) ops.modifiedFiles.add(targetPath);
          if (toolName === "move_file" && sourcePath) ops.modifiedFiles.add(sourcePath);
          if (toolName === "copy_file" && sourcePath) ops.readFiles.add(sourcePath);
        } else {
          const path = extractPathFromArgs(args, "path");
          if (path) ops.modifiedFiles.add(path);
        }
      }
    }
  }

  return ops;
}

/**
 * Format file operations into markdown sections for appending to a summary.
 *
 * Returns empty string if no operations were tracked.
 */
export function formatFileOperations(ops: FileOps): string {
  const parts: string[] = [];

  if (ops.readFiles.size > 0) {
    parts.push("## Files Read");
    for (const f of [...ops.readFiles].sort()) {
      parts.push(`- \`${f}\``);
    }
  }

  if (ops.modifiedFiles.size > 0) {
    parts.push("## Files Modified");
    for (const f of [...ops.modifiedFiles].sort()) {
      parts.push(`- \`${f}\``);
    }
  }

  return parts.length > 0 ? "\n\n" + parts.join("\n") : "";
}
