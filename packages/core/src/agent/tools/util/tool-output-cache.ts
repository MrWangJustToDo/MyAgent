/**
 * Tool Output Cache — saves large tool results to disk and returns a preview.
 *
 * When a tool result exceeds the cache threshold, the full output is written
 * to `.agent-cache/tool-output/{id}.txt` and a preview (head + tail) is returned
 * to the LLM with instructions to use `read_file` for the full content.
 *
 * ## Cache Cleanup on Compaction
 *
 * When the conversation is compacted (auto or reactive), old messages before the
 * compact index are shadowed — the LLM will never see them again, so their cached
 * output files become stale. Call `cleanupOrphanedToolCache()` after compaction
 * to delete those files. Failure to delete a file is non-fatal (logged as warning).
 */

import type { Sandbox } from "../../../environment";
import type { ModelMessage } from "ai";

// ============================================================================
// Constants
// ============================================================================

const CACHE_DIR = ".agent-cache/tool-output";

/** Content length threshold to trigger disk caching (~2.5k tokens) */
export const CACHE_THRESHOLD = 10000;

/** Number of lines to show from the start of the output */
const DEFAULT_HEAD_LINES = 200;

/** Number of lines to show from the end of the output */
const DEFAULT_TAIL_LINES = 50;

// ============================================================================
// Public API
// ============================================================================

/**
 * Write full tool output to disk and return the cache file path.
 */
export async function cacheToolOutput(sandbox: Sandbox, content: string, id: string): Promise<string> {
  const filePath = `${CACHE_DIR}/${id}.txt`;
  await sandbox.filesystem.writeFile(filePath, content);
  return filePath;
}

/**
 * Build a preview string from large content with a reference to the cached file.
 */
export function buildCachedPreview(
  content: string,
  cachedPath: string,
  opts?: { headLines?: number; tailLines?: number }
): string {
  const headLines = opts?.headLines ?? DEFAULT_HEAD_LINES;
  const tailLines = opts?.tailLines ?? DEFAULT_TAIL_LINES;

  const lines = content.split("\n");
  const totalLines = lines.length;

  if (totalLines <= headLines + tailLines) {
    return content;
  }

  const head = lines.slice(0, headLines).join("\n");
  const tail = lines.slice(-tailLines).join("\n");
  const omitted = totalLines - headLines - tailLines;

  return [
    head,
    "",
    `... (${omitted} lines omitted) ...`,
    "",
    tail,
    "",
    `Full output saved to: ${cachedPath} (${totalLines} lines, ${content.length} chars)`,
    `Use read_file with path="${cachedPath}" and offset/limit to read specific sections.`,
  ].join("\n");
}

/**
 * Check if content should be cached to disk.
 */
export function shouldCache(content: string): boolean {
  return content.length > CACHE_THRESHOLD;
}

/**
 * Cache content if it exceeds the threshold, returning either the original
 * content or a preview with cache path. Also returns the cache path if cached.
 */
export async function maybeCacheOutput(
  sandbox: Sandbox,
  content: string,
  id: string,
  opts?: { headLines?: number; tailLines?: number }
): Promise<{ content: string; cachedOutputPath: string | null }> {
  if (!shouldCache(content)) {
    return { content, cachedOutputPath: null };
  }

  const cachedPath = await cacheToolOutput(sandbox, content, id);
  const preview = buildCachedPreview(content, cachedPath, opts);
  return { content: preview, cachedOutputPath: cachedPath };
}

/**
 * Extract `cachedOutputPath` from a message part, if present.
 *
 * Tool result parts from the Vercel AI SDK carry the result as a structured
 * object. Tools that cache output (run_command, grep, webfetch) include a
 * `cachedOutputPath` field in their result.
 */
function extractCachedPathFromPart(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  const p = part as Record<string, unknown>;
  if (p.type !== "tool-result") return null;
  const result = p.result;
  if (!result || typeof result !== "object") return null;
  const path = (result as Record<string, unknown>).cachedOutputPath;
  return typeof path === "string" && path.length > 0 ? path : null;
}

/**
 * Scan orphaned messages (those before compactIndex) for cached tool output
 * file paths and delete them from disk. This prevents stale cache files from
 * accumulating when the conversation is compacted.
 *
 * Failure to delete any individual file is non-fatal; the error is logged to
 * the sandbox stderr but does not throw.
 *
 * @param sandbox - Sandbox for file system operations
 * @param messages - All messages in the conversation
 * @param compactIndex - Index before which messages are considered orphaned
 */
export async function cleanupOrphanedToolCache(
  sandbox: Sandbox,
  messages: ModelMessage[],
  compactIndex: number
): Promise<void> {
  if (compactIndex <= 0 || messages.length === 0) return;

  const pathsToDelete = new Set<string>();

  for (let i = 0; i < Math.min(compactIndex, messages.length); i++) {
    const msg = messages[i];
    if (msg.role !== "tool") continue;

    const content = msg.content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      const path = extractCachedPathFromPart(part);
      if (path) pathsToDelete.add(path);
    }
  }

  if (pathsToDelete.size === 0) return;

  const deletions = Array.from(pathsToDelete).map(async (filePath) => {
    try {
      // Check existence first to avoid errors on already-deleted files
      const exists = await sandbox.filesystem.exists(filePath);
      if (exists) {
        await sandbox.filesystem.remove(filePath);
      }
    } catch {
      // Non-fatal — stale cache files are harmless, just noisy
    }
  });

  await Promise.all(deletions);
}
