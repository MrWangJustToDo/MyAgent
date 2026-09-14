/**
 * Bounded content digest for display-cache invalidation.
 *
 * Display caches key rows by message id, but an id can outlive its content when a
 * synthetic or streamed row is rebuilt in place — the compact activity summary
 * keeps `display-activity:<userMessageId>:<seq>` while its text grows as more
 * tools fold in. Comparing content is what keeps those caches correct without
 * retaining (or re-flattening) the whole message.
 *
 * djb2 over the head and tail windows (same trick as the LSP parser cache in core)
 * bounds the per-row cost even for multi-megabyte image data URLs. The digest
 * includes the length, so any growth invalidates; a same-length edit strictly
 * between the two windows of a part larger than 2×window is not detected — rows
 * that big are not rewritten under a stable id in practice.
 */

const DEFAULT_WINDOW = 4096;

/** `length:headHash:tailHash` (base36) — stable across renders for equal input. */
export function digestString(value: string, window = DEFAULT_WINDOW): string {
  const length = value.length;
  const head = djb2(value, 0, Math.min(length, window));
  const tail = length > window ? djb2(value, Math.max(0, length - window), length) : head;
  return `${length}:${head.toString(36)}:${tail.toString(36)}`;
}

function djb2(value: string, start: number, end: number): number {
  let hash = 5381;
  for (let i = start; i < end; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}
