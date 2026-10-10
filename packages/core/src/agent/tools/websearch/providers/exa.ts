/**
 * Exa Provider — Free web search via Exa's public MCP endpoint (no API key).
 *
 * Calls the `web_search_exa` tool over JSON-RPC at https://mcp.exa.ai/mcp and
 * parses the SSE/JSON payload. Used as the default free provider because the
 * DuckDuckGo HTML endpoint is increasingly blocked by anti-bot challenges.
 *
 * No configuration required — {@link isAvailable} always returns true; failures
 * surface as thrown errors so the ProviderManager can fall back.
 *
 * @see https://exa.ai
 */

import { getEnv } from "../../../../env.js";
import { createTimeoutAbort } from "../abort-timeout.js";
import { filterResultsByDomain } from "../domain-filter.js";

import type { SearchProvider, SearchResult, SearchOptions } from "../types.js";

// ============================================================================
// Constants
// ============================================================================

const PROVIDER_NAME = "exa";
const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const EXA_TOOL_NAME = "web_search_exa";

// ============================================================================
// Result Parsing
// ============================================================================

/**
 * Collapse the free-form body that follows `Highlights:` / `Content:` into a
 * bounded single-line snippet.
 */
function extractBody(block: string): string {
  const match = block.match(/^(?:Highlights|Content):[ \t]*([\s\S]*)$/m);
  const body = match?.[1] ?? block;
  return body
    .replace(/^(?:Title|URL|Published|Author):.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/**
 * Parse Exa's text payload into results. Entries are separated by `---`, each
 * with `Title:` / `URL:` header lines and an optional `Highlights:`/`Content:`
 * body. Falls back to markdown links and bare URLs when the header format is
 * absent.
 */
export function parseExaResults(text: string): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  for (const block of text.split(/\n-{3,}\n/g)) {
    const urlMatch = block.match(/^URL:\s*(https?:\/\/\S+)$/m);
    if (!urlMatch) continue;

    const url = urlMatch[1].trim();
    if (seen.has(url)) continue;
    seen.add(url);

    const title = block.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || url;
    results.push({ title, url, snippet: extractBody(block) });
  }

  if (results.length === 0) {
    const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let match;
    while ((match = markdownLinkPattern.exec(text)) !== null) {
      const url = match[2].trim();
      if (seen.has(url)) continue;
      seen.add(url);
      results.push({ title: match[1].trim(), url, snippet: "" });
    }
  }

  return results;
}

/**
 * Extract the tool text from an Exa MCP response, accepting either an SSE
 * stream (`data: {...}` lines) or a plain JSON body.
 */
export function parseExaResponse(body: string): string | undefined {
  for (const line of body.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]" || data === "null") continue;
    const text = extractContentText(data);
    if (text) return text;
  }

  return extractContentText(body);
}

function extractContentText(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as { result?: { content?: Array<{ text?: string }> } };
    const content = parsed?.result?.content;
    if (Array.isArray(content) && typeof content[0]?.text === "string") {
      return content[0].text;
    }
  } catch {
    // Not JSON — fall through.
  }
  return undefined;
}

// ============================================================================
// Exa Provider
// ============================================================================

export const exaProvider: SearchProvider = {
  name: PROVIDER_NAME,

  isAvailable(): boolean {
    return true;
  },

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const maxResults = options?.maxResults ?? 10;
    const timeoutMs = options?.timeoutMs ?? 30000;
    const { controller, cleanup } = createTimeoutAbort({ timeoutMs, signal: options?.signal });

    try {
      const response = await getEnv().fetch(EXA_MCP_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: EXA_TOOL_NAME,
            arguments: { query, numResults: maxResults },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Exa search failed with status: ${response.status}`);
      }

      const body = await response.text();
      const text = parseExaResponse(body);
      let results = text ? parseExaResults(text) : [];
      results = filterResultsByDomain(results, options?.allowedDomains, options?.blockedDomains);

      if (options?.maxResults && results.length > options.maxResults) {
        results = results.slice(0, options.maxResults);
      }

      return results;
    } finally {
      cleanup();
    }
  },
};
