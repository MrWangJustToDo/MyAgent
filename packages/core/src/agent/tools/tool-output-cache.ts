/**
 * Tool Output Cache — saves large tool results to disk and returns a preview.
 *
 * When a tool result exceeds the cache threshold, the full output is written
 * to `.agent-cache/tool-output/{id}.txt` and a preview (head + tail) is returned
 * to the LLM with instructions to use `read_file` for the full content.
 */

import type { Sandbox } from "../../environment";

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
