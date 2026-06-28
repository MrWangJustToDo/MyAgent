/**
 * Fuzzy matching utilities for edit operations.
 *
 * Handles common Unicode normalization issues like smart quotes,
 * dashes, and special spaces that LLMs sometimes produce.
 */

// ============================================================================
// Normalization Maps
// ============================================================================

/** Map of smart/curly quotes to ASCII equivalents */
const SMART_QUOTES: Record<string, string> = {
  // Left double quotes
  "\u201C": '"', // "
  "\u201D": '"', // "
  // Right double quotes
  "\u2018": "'", // '
  "\u2019": "'", // '
  // Single angle quotes
  "\u2039": "'",
  "\u203A": "'",
  // Double angle quotes
  "\u00AB": '"',
  "\u00BB": '"',
  // Low double comma quotes
  "\u201E": '"',
  "\u201F": '"',
  // Fullwidth quotation marks
  "\uFF02": '"',
  "\uFF07": "'",
};

/** Map of Unicode dashes to ASCII hyphen */
const UNICODE_DASHES: Record<string, string> = {
  "\u2010": "-", // hyphen
  "\u2011": "-", // non-breaking hyphen
  "\u2012": "-", // figure dash
  "\u2013": "-", // en dash
  "\u2014": "-", // em dash
  "\u2015": "-", // horizontal bar
  "\u2212": "-", // minus sign
  "\uFE58": "-", // small em dash
  "\uFE63": "-", // small hyphen-minus
  "\uFF0D": "-", // fullwidth hyphen-minus
};

/** Map of special spaces to regular space */
const SPECIAL_SPACES: Record<string, string> = {
  "\u00A0": " ", // non-breaking space
  "\u2000": " ", // en quad
  "\u2001": " ", // em quad
  "\u2002": " ", // en space
  "\u2003": " ", // em space
  "\u2004": " ", // three-per-em space
  "\u2005": " ", // four-per-em space
  "\u2006": " ", // six-per-em space
  "\u2007": " ", // figure space
  "\u2008": " ", // punctuation space
  "\u2009": " ", // thin space
  "\u200A": " ", // hair space
  "\u200B": "", // zero-width space (remove)
  "\u200C": "", // zero-width non-joiner (remove)
  "\u200D": "", // zero-width joiner (remove)
  "\u2060": "", // word joiner (remove)
  "\u2061": "", // function application (remove)
  "\uFEFF": "", // BOM / zero-width no-break space (remove)
};

/** Combined normalization map */
const NORMALIZATION_MAP: Record<string, string> = {
  ...SMART_QUOTES,
  ...UNICODE_DASHES,
  ...SPECIAL_SPACES,
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Normalize Unicode characters to their ASCII equivalents.
 *
 * Handles smart quotes, Unicode dashes, and special spaces that
 * LLMs sometimes produce when editing code.
 *
 * @param text - The text to normalize
 * @returns The normalized text with ASCII equivalents
 */
export function normalizeForFuzzyMatch(text: string): string {
  let result = "";
  for (const char of text) {
    const normalized = NORMALIZATION_MAP[char];
    if (normalized !== undefined) {
      result += normalized;
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Check if two strings are approximately equal using fuzzy matching.
 *
 * @param a - First string
 * @param b - Second string
 * @returns true if the strings are approximately equal
 */
export function fuzzyEquals(a: string, b: string): boolean {
  return normalizeForFuzzyMatch(a) === normalizeForFuzzyMatch(b);
}

/**
 * Find the index of a fuzzy match in a string.
 *
 * @param haystack - The string to search in
 * @param needle - The string to search for
 * @returns The index of the first fuzzy match, or -1 if not found
 */
export function fuzzyIndexOf(haystack: string, needle: string): number {
  const normalizedHaystack = normalizeForFuzzyMatch(haystack);
  const normalizedNeedle = normalizeForFuzzyMatch(needle);
  return normalizedHaystack.indexOf(normalizedNeedle);
}

/**
 * Check if a string contains a fuzzy match.
 *
 * @param haystack - The string to search in
 * @param needle - The string to search for
 * @returns true if the haystack contains the needle (fuzzy)
 */
export function fuzzyIncludes(haystack: string, needle: string): boolean {
  return fuzzyIndexOf(haystack, needle) !== -1;
}

/**
 * Replace the first fuzzy match in a string.
 *
 * @param haystack - The string to search in
 * @param needle - The string to replace
 * @param replacement - The replacement string
 * @returns The string with the first fuzzy match replaced
 */
export function fuzzyReplace(haystack: string, needle: string, replacement: string): string {
  const index = fuzzyIndexOf(haystack, needle);
  if (index === -1) {
    return haystack;
  }

  const normalizedNeedle = normalizeForFuzzyMatch(needle);
  const needleLength = normalizedNeedle.length;

  // Find the actual end position in the original string
  let endPos = index;
  let normalizedCount = 0;
  while (endPos < haystack.length && normalizedCount < needleLength) {
    const char = haystack[endPos];
    const normalized = NORMALIZATION_MAP[char];
    if (normalized !== undefined) {
      normalizedCount += normalized.length;
    } else {
      normalizedCount += 1;
    }
    endPos++;
  }

  return haystack.substring(0, index) + replacement + haystack.substring(endPos);
}

/**
 * Replace all fuzzy matches in a string.
 *
 * @param haystack - The string to search in
 * @param needle - The string to replace
 * @param replacement - The replacement string
 * @returns The string with all fuzzy matches replaced
 */
export function fuzzyReplaceAll(haystack: string, needle: string, replacement: string): string {
  let result = haystack;
  while (true) {
    const newResult = fuzzyReplace(result, needle, replacement);
    if (newResult === result) {
      break;
    }
    result = newResult;
  }
  return result;
}

/**
 * Count fuzzy matches in a string.
 *
 * @param haystack - The string to search in
 * @param needle - The string to count
 * @returns The number of fuzzy matches
 */
export function fuzzyCount(haystack: string, needle: string): number {
  const normalizedHaystack = normalizeForFuzzyMatch(haystack);
  const normalizedNeedle = normalizeForFuzzyMatch(needle);

  if (normalizedNeedle.length === 0) {
    return 0;
  }

  let count = 0;
  let pos = 0;
  while ((pos = normalizedHaystack.indexOf(normalizedNeedle, pos)) !== -1) {
    count++;
    pos += normalizedNeedle.length;
  }
  return count;
}
