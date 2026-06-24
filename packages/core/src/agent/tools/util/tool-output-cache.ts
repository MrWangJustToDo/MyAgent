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

import { getEnv } from "../../../env.js";

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
export async function cacheToolOutput(content: string, id: string): Promise<string> {
  const filePath = `${CACHE_DIR}/${id}.txt`;
  await getEnv().fs.writeFile(filePath, content);
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

  // Not large enough to benefit from truncation
  if (content.length <= CACHE_THRESHOLD) {
    return content;
  }

  // Line-based truncation — show first N and last N lines
  if (totalLines > headLines + tailLines) {
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

  // Char-based truncation — for content with few lines but very long lines
  // (e.g., a single 50000-char JSON line). Show head + tail by char count.
  const mid = Math.floor(content.length / 2);
  const tailStart = Math.max(mid, content.length - 5000);
  const omitted = tailStart - mid;

  const head = content.slice(0, mid);
  const tail = content.slice(tailStart);
  const note = `Full output saved to: ${cachedPath} (${totalLines} lines, ${content.length} chars)`;

  if (omitted > 0) {
    return [
      head,
      "",
      `... (${omitted} chars omitted) ...`,
      "",
      tail,
      "",
      note,
      `Use read_file with path="${cachedPath}" and offset/limit to read specific sections.`,
    ].join("\n");
  }

  // Content fits in head+tail with no omission — still show cache hint
  return [
    content,
    "",
    note,
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
  content: string,
  id: string,
  opts?: { headLines?: number; tailLines?: number }
): Promise<{ content: string; cachedOutputPath: string | null }> {
  if (!shouldCache(content)) {
    return { content, cachedOutputPath: null };
  }

  const cachedPath = await cacheToolOutput(content, id);
  const preview = buildCachedPreview(content, cachedPath, opts);
  return { content: preview, cachedOutputPath: cachedPath };
}

/**
 * Extract `cachedOutputPath` from a message part, if present.
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
 * file paths and delete them from disk.
 */
export async function cleanupOrphanedToolCache(messages: ModelMessage[], compactIndex: number): Promise<void> {
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

  const fs = getEnv().fs;
  const deletions = Array.from(pathsToDelete).map(async (filePath) => {
    try {
      const exists = await fs.exists(filePath);
      if (exists) {
        await fs.remove(filePath);
      }
    } catch {
      // Non-fatal — stale cache files are harmless
    }
  });

  await Promise.all(deletions);
}
