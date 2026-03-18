import type { Sandbox } from "../../environment";

/**
 * Get file content and a modification identifier.
 * For just-bash, we use the content hash as the modification identifier
 * since just-bash doesn't track file modification times.
 */
export async function getFile(
  sandbox: Sandbox,
  path: string
): Promise<{
  content: string;
  modifiedTime: string;
}> {
  const content = await sandbox.filesystem.readFile(path);
  // Use a simple hash of content as the "modification time" identifier
  // This ensures we can detect if the file changed between operations
  const modifiedTime = hashContent(content);
  return { content, modifiedTime };
}

/**
 * Get just the modification identifier for a file.
 */
export async function getFileModifiedTime(sandbox: Sandbox, path: string): Promise<string> {
  const content = await sandbox.filesystem.readFile(path);
  return hashContent(content);
}

/**
 * Simple hash function for content-based modification detection.
 * Uses a fast non-cryptographic hash.
 */
function hashContent(content: string): string {
  // Simple djb2 hash for quick content fingerprinting
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
  }
  // Convert to positive hex string
  return (hash >>> 0).toString(16);
}

/**
 * Wraps an async function and measures its execution duration.
 * Returns the result along with durationMs.
 */
export async function withDuration<T>(fn: () => Promise<T>): Promise<T & { durationMs: number }> {
  const startTime = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - startTime);
  return { ...result, durationMs };
}
