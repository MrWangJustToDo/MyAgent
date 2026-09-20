/**
 * Join conditional class names.
 *
 * Exists so a conditional class can never be concatenated without a separator.
 * Writing `` `row${active ? "row--active" : ""}` `` silently produces a single
 * unknown class (`rowrow--active`) that matches no rule, and the element then
 * renders with browser defaults — which is very hard to spot in review.
 */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
