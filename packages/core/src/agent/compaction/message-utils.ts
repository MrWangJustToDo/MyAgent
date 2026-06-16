/**
 * Shared message content utilities for the compaction module.
 *
 * Part-type guards and text extraction helpers used by both
 * micro-compact (Layer 1) and auto-compact (Layer 2).
 */

/** Check if a message content part is a tool-call. */
export function isToolCallPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  return (part as Record<string, unknown>).type === "tool-call";
}

/** Check if a message content part is a tool-result. */
export function isToolResultPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  return (part as Record<string, unknown>).type === "tool-result";
}

/**
 * Extract text content from a message's content field.
 * Handles string content, text parts, and replaces media with placeholders.
 */
export function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const part of content) {
    const p = part as Record<string, unknown>;
    const type = p.type as string | undefined;

    if (type === "text" && typeof p.text === "string") {
      parts.push(p.text);
    } else if (type === "image") {
      parts.push("[Image was attached]");
    } else if (type === "file") {
      const filename = (p.filename as string) || "";
      parts.push(filename ? `[File attached: ${filename}]` : "[File was attached]");
    }
  }
  return parts.join("\n");
}

/**
 * Get text content from the first text part of a content array.
 * Needed because strict SDK types prevent casting to Record for find().
 */
export function getFirstTextPartContent(content: Array<unknown>): string {
  for (const part of content) {
    if (part && typeof part === "object") {
      const p = part as Record<string, unknown>;
      if (p.type === "text" && typeof p.text === "string") {
        return p.text;
      }
    }
  }
  return "";
}
