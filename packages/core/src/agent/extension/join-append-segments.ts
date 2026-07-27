/**
 * Join non-empty extension append segments in order (blank-line separated).
 */
export function joinExtensionAppendSegments(...parts: Array<string | undefined | null>): string | undefined {
  const trimmed = parts.map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean);
  return trimmed.length > 0 ? trimmed.join("\n\n") : undefined;
}
