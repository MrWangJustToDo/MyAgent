import { createHighlighter, bundledLanguages } from "shiki/bundle-full.mjs";

import type { ThemedToken } from "shiki";

// Initialize the Shiki highlighter somewhere in your app
const highlighter = await createHighlighter({ themes: ["github-dark"], langs: Object.values(bundledLanguages) });

/**
 * Synchronously highlight code and return tokens.
 * Used for source-side highlighting when content is complete.
 */
export const highlightCode = (code: string, lang?: string): ThemedToken[][] => {
  if (!lang || !lang.trim()) {
    return [];
  }

  try {
    // Check if language is loaded before attempting to highlight
    const loadedLangs = highlighter.getLoadedLanguages();
    if (!loadedLangs.includes(lang)) {
      return [];
    }

    const tokens = highlighter.codeToTokens(code, {
      lang: lang as Parameters<typeof highlighter.codeToTokens>[1]["lang"],
      theme: "github-dark",
    });
    return tokens.tokens;
  } catch {
    // If language is not supported, return empty tokens
    return [];
  }
};

/**
 * Check if a language is supported by the highlighter.
 */
export const isLanguageSupported = (lang: string): boolean => {
  try {
    const languages = highlighter.getLoadedLanguages();
    return languages.includes(lang);
  } catch {
    return false;
  }
};

export { highlighter };
