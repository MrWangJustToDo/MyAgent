/**
 * WebSearch Tool - Search the web using DuckDuckGo.
 *
 * This tool allows agents to search the web for up-to-date information:
 * - Uses DuckDuckGo HTML search (no API key required)
 * - Returns search results with title, snippet, and URL
 * - Supports domain filtering (allow/block specific domains)
 * - Uses TurndownService for clean HTML-to-text conversion
 *
 * Based on Kode-Agent's WebSearchTool implementation.
 */

import { tool } from "ai";
import TurndownService from "turndown";
import { z } from "zod";

import { withDuration } from "./helpers.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT = 30; // 30 seconds
const MAX_TIMEOUT = 60; // 1 minute
const MAX_RESULTS = 10; // Maximum results to return
const DEFAULT_RESULTS = 5; // Default number of results

// ============================================================================
// Types
// ============================================================================

export interface SearchResult {
  /** Title of the search result */
  title: string;
  /** Snippet/description of the result */
  snippet: string;
  /** URL of the result */
  url: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get today's date in ISO format (YYYY-MM-DD)
 */
function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Extract hostname from URL
 */
function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Clean DuckDuckGo redirect URL to get the actual URL
 */
function cleanDuckDuckGoUrl(url: string): string {
  if (url.startsWith("https://duckduckgo.com/l/?uddg=")) {
    try {
      const parsedUrl = new URL(url);
      const actualUrl = parsedUrl.searchParams.get("uddg");
      if (actualUrl) {
        return decodeURIComponent(actualUrl);
      }
    } catch {
      // Fall through to return original
    }
  }
  return url;
}

/**
 * Create a TurndownService instance configured for extracting plain text
 */
function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });

  // Remove script, style, and other non-content elements
  turndown.remove(["script", "style", "meta", "link", "noscript", "nav", "footer", "header"]);

  return turndown;
}

// Shared TurndownService instance
const turndownService = createTurndownService();

/**
 * Extract clean text from HTML using TurndownService
 */
function extractText(html: string): string {
  try {
    // Use turndown to convert HTML to markdown, then strip markdown formatting for plain text
    const markdown = turndownService.turndown(html);
    // Remove markdown links but keep text: [text](url) -> text
    return markdown
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold
      .replace(/\*([^*]+)\*/g, "$1") // Remove italic
      .replace(/`([^`]+)`/g, "$1") // Remove inline code
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    // Fallback to simple regex extraction
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }
}

/**
 * Parse DuckDuckGo HTML search results using TurndownService for clean text extraction.
 * DuckDuckGo HTML structure:
 * - .result.web-result contains each result
 * - .result__a is the title link with href
 * - .result__snippet contains the description
 */
function parseDuckDuckGoResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Match individual result blocks - DuckDuckGo wraps each result in a div with class "result"
  // We'll extract each result block and parse title, URL, and snippet from it
  const resultBlockPattern = /<div[^>]*class="[^"]*result[^"]*web-result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div|$)/gi;

  // Patterns for extracting data from each result block
  const titleLinkPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
  const snippetPattern = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i;

  let blockMatch;
  while ((blockMatch = resultBlockPattern.exec(html)) !== null) {
    const block = blockMatch[1];

    // Extract title and URL
    const titleMatch = titleLinkPattern.exec(block);
    if (!titleMatch) continue;

    const rawUrl = titleMatch[1];
    const rawTitle = titleMatch[2];

    if (!rawUrl || !rawTitle) continue;

    const url = cleanDuckDuckGoUrl(rawUrl);
    const title = extractText(rawTitle);

    // Skip if no valid title
    if (!title || title.length < 2) continue;

    // Extract snippet
    const snippetMatch = snippetPattern.exec(block);
    const snippet = snippetMatch ? extractText(snippetMatch[1]) : "";

    results.push({ title, url, snippet });
  }

  // Fallback: If block parsing failed, try simpler pattern matching
  if (results.length === 0) {
    const titlePattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetPatternGlobal = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

    // Extract all titles with their URLs
    const titles: Array<{ url: string; title: string }> = [];
    let match;

    while ((match = titlePattern.exec(html)) !== null) {
      const url = cleanDuckDuckGoUrl(match[1]);
      const title = extractText(match[2]);
      if (url && title && title.length >= 2) {
        titles.push({ url, title });
      }
    }

    // Extract all snippets
    const snippets: string[] = [];
    while ((match = snippetPatternGlobal.exec(html)) !== null) {
      const snippet = extractText(match[1]);
      snippets.push(snippet || "");
    }

    // Pair titles with snippets
    for (let i = 0; i < titles.length; i++) {
      results.push({
        title: titles[i].title,
        url: titles[i].url,
        snippet: snippets[i] || "",
      });
    }
  }

  // Final fallback: extract any external links that look like search results
  if (results.length === 0) {
    const linkPattern = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const seen = new Set<string>();
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
      const url = cleanDuckDuckGoUrl(match[1]);
      const title = extractText(match[2]);

      // Skip DuckDuckGo internal links and duplicates
      if (
        url &&
        title &&
        !url.includes("duckduckgo.com") &&
        !seen.has(url) &&
        title.length > 5 &&
        !url.includes("javascript:")
      ) {
        seen.add(url);
        results.push({
          title,
          url,
          snippet: "",
        });
      }
    }
  }

  return results;
}

/**
 * Search DuckDuckGo and return results
 */
async function searchDuckDuckGo(query: string, timeoutMs: number): Promise<SearchResult[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed with status: ${response.status}`);
    }

    const html = await response.text();
    return parseDuckDuckGoResults(html);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Filter results by allowed/blocked domains
 */
function filterResultsByDomain(
  results: SearchResult[],
  allowedDomains?: string[],
  blockedDomains?: string[]
): SearchResult[] {
  if (!allowedDomains?.length && !blockedDomains?.length) {
    return results;
  }

  const allowed = allowedDomains?.map((d) => d.toLowerCase()) ?? null;
  const blocked = blockedDomains?.map((d) => d.toLowerCase()) ?? null;

  return results.filter((result) => {
    const host = getHostname(result.url);
    if (!host) return false;

    if (allowed && allowed.length > 0) {
      return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
    }

    if (blocked && blocked.length > 0) {
      return !blocked.some((domain) => host === domain || host.endsWith(`.${domain}`));
    }

    return true;
  });
}

// ============================================================================
// Output Schema
// ============================================================================

export const websearchOutputSchema = z.object({
  /** The search query */
  query: z.string().describe("The search query that was executed"),
  /** Search results */
  results: z
    .array(
      z.object({
        title: z.string().describe("Title of the search result"),
        snippet: z.string().describe("Snippet/description of the result"),
        url: z.string().describe("URL of the result"),
      })
    )
    .describe("Array of search results"),
  /** Number of results returned */
  resultCount: z.number().describe("Number of results returned"),
  /** Human-readable message */
  message: z.string().describe("Human-readable result message"),
  /** Execution duration in milliseconds */
  durationMs: z.number().describe("Execution duration in milliseconds"),
});

export type WebsearchOutput = z.infer<typeof websearchOutputSchema>;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Creates a web search tool for searching the web via DuckDuckGo.
 *
 * Features:
 * - No API key required (uses DuckDuckGo HTML search)
 * - Returns titles, snippets, and URLs
 * - Domain filtering support
 * - Automatic URL cleaning
 *
 * @example
 * ```typescript
 * const websearchTool = createWebsearchTool();
 * ```
 */
export const createWebsearchTool = () => {
  const today = getTodayISO();

  return tool({
    description: `Search the web using DuckDuckGo and return relevant results.

Use this tool when you need to:
- Find up-to-date information beyond your knowledge cutoff
- Research current events, news, or recent developments
- Look up documentation, tutorials, or technical information
- Find specific websites or resources
- Verify facts or get multiple perspectives

Features:
- No API key required
- Returns search result titles, snippets, and URLs
- Supports domain filtering (allow or block specific domains)
- Results include direct links to sources

IMPORTANT:
- Today's date is ${today}. Use the current year when searching for recent information.
- After answering the user's question based on search results, ALWAYS include a "Sources:" section
- List all relevant URLs from the search results as markdown hyperlinks: [Title](URL)

Example response format:
  [Your answer here based on search results]

  Sources:
  - [Source Title 1](https://example.com/page1)
  - [Source Title 2](https://example.com/page2)`,

    inputSchema: z.object({
      query: z.string().min(2).describe("The search query to use"),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(MAX_RESULTS)
        .optional()
        .describe(`Maximum number of results to return (1-${MAX_RESULTS}). Defaults to ${DEFAULT_RESULTS}.`),
      allowedDomains: z
        .array(z.string())
        .optional()
        .describe("Only include results from these domains (e.g., ['github.com', 'stackoverflow.com'])"),
      blockedDomains: z
        .array(z.string())
        .optional()
        .describe("Exclude results from these domains (e.g., ['pinterest.com', 'quora.com'])"),
      timeout: z
        .number()
        .int()
        .min(5)
        .max(MAX_TIMEOUT)
        .optional()
        .describe(`Timeout in seconds (5-${MAX_TIMEOUT}). Defaults to ${DEFAULT_TIMEOUT}.`),
    }),

    outputSchema: websearchOutputSchema,

    execute: async ({ query, maxResults, allowedDomains, blockedDomains, timeout }) => {
      return withDuration(async () => {
        // Validate that we don't have both allowed and blocked domains
        if (allowedDomains?.length && blockedDomains?.length) {
          throw new Error("Cannot specify both allowedDomains and blockedDomains in the same request");
        }

        const timeoutMs = Math.min((timeout ?? DEFAULT_TIMEOUT) * 1000, MAX_TIMEOUT * 1000);
        const limit = maxResults ?? DEFAULT_RESULTS;

        // Perform search
        const rawResults = await searchDuckDuckGo(query, timeoutMs);

        // Filter by domains
        const filteredResults = filterResultsByDomain(rawResults, allowedDomains, blockedDomains);

        // Limit results
        const results = filteredResults.slice(0, limit);

        // Format message
        let message = `Found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}"`;
        if (allowedDomains?.length) {
          message += ` (filtered to: ${allowedDomains.join(", ")})`;
        }
        if (blockedDomains?.length) {
          message += ` (excluding: ${blockedDomains.join(", ")})`;
        }

        return {
          query,
          results,
          resultCount: results.length,
          message,
        };
      });
    },
  });
};
