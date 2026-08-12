/**
 * WebSearch Tool — Search the web using multiple search providers.
 *
 * Provider architecture:
 * - Brave Search API (when toolConfig.websearch.braveApiKey is set)
 * - DuckDuckGo HTML search (free, no API key required, fallback)
 *
 * Provider selection via ProviderManager:
 * 1. toolConfig.websearch.provider can override (e.g., "brave", "duckduckgo", "auto")
 * 2. auto mode: Brave (if key available) → DuckDuckGo
 * 3. On failure, automatically falls back to the next available provider
 */

import { z } from "zod";

import { defineServerTool } from "./runtime/define-tool.js";
import { withDuration } from "./util/helpers.js";
import { toolOutputBaseSchema } from "./util/types.js";
import { filterResultsByDomain, getProviderManager, initializeProviders } from "./websearch";

import type { ManagedAgent } from "../../runtime-types/hosts.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT = 30; // 30 seconds
const MAX_TIMEOUT = 60; // 1 minute
const MAX_RESULTS = 10; // Maximum results to return
const DEFAULT_RESULTS = 5; // Default number of results

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
  /** Provider used for this search */
  provider: z.string().describe("The search provider used"),
  /** Execution duration in milliseconds */
  durationMs: z.number().describe("Execution duration in milliseconds"),
  ...toolOutputBaseSchema.shape,
});

export type WebsearchOutput = z.infer<typeof websearchOutputSchema>;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Creates a web search tool for searching the web via multiple providers.
 *
 * Features:
 * - Brave Search API (when toolConfig.websearch.braveApiKey is set)
 * - DuckDuckGo HTML search (free, no API key, fallback)
 * - Automatic provider selection and fallback
 * - Domain filtering (allow/block specific domains)
 * - Returns titles, snippets, and URLs
 */
export const createWebsearchTool = ({ managed }: { managed?: ManagedAgent }) => {
  initializeProviders(managed?.config?.toolConfig?.websearch);

  return defineServerTool({
    name: "websearch",
    description: `Search the web and return titles, snippets, and URLs.

Use when you need current information, docs, or to discover URLs (then webfetch). Prefer over webfetch when the URL is unknown.
Supports domain allow/block filters. Provider is chosen automatically (Brave when a key is configured, else DuckDuckGo).

When answering from search results, include a Sources section with markdown links: [Title](URL).
Use the current year from <current_date> in turn context for time-sensitive queries.`,

    inputSchema: z.object({
      query: z.string().min(2, { message: "query: must be at least 2 characters" }).describe("The search query to use"),
      maxResults: z
        .number()
        .int({ message: "maxResults: must be an integer" })
        .min(1, { message: "maxResults: must be >= 1" })
        .max(MAX_RESULTS, { message: "maxResults: must be <= 10" })
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
        .int({ message: "timeout: must be an integer (seconds)" })
        .min(5, { message: "timeout: must be >= 5 seconds" })
        .max(MAX_TIMEOUT, { message: "timeout: must be <= 60 seconds" })
        .optional()
        .describe(`Timeout in seconds (5-${MAX_TIMEOUT}). Defaults to ${DEFAULT_TIMEOUT}.`),
    }),

    outputSchema: websearchOutputSchema,

    execute: async ({ query, maxResults, allowedDomains, blockedDomains, timeout }, { abortSignal }) => {
      return withDuration(async () => {
        if (allowedDomains?.length && blockedDomains?.length) {
          throw new Error("Cannot specify both allowedDomains and blockedDomains in the same request");
        }

        const timeoutMs = Math.min((timeout ?? DEFAULT_TIMEOUT) * 1000, MAX_TIMEOUT * 1000);
        const limit = maxResults ?? DEFAULT_RESULTS;

        const controller = new AbortController();
        const managedAgent = managed;
        const hasParentAgent = managedAgent?.parentId;

        abortSignal?.addEventListener("abort", () => {
          controller.abort();
        });

        if (!hasParentAgent) {
          managedAgent?.addPendingAbortController(controller);
        }

        try {
          const pm = getProviderManager();
          pm.configure(managed?.config?.toolConfig?.websearch);
          const { results: rawResults, provider } = await pm.search(query, {
            maxResults: limit,
            allowedDomains,
            blockedDomains,
            timeoutMs,
            signal: controller.signal,
          });

          const filteredResults = filterResultsByDomain(rawResults, allowedDomains, blockedDomains);

          return {
            query,
            results: filteredResults.slice(0, limit),
            provider,
          };
        } finally {
          if (!hasParentAgent) {
            managedAgent?.removePendingAbortController(controller);
          }
        }
      });
    },
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: z.infer<typeof websearchOutputSchema> }) {
      const lines = output.results?.map?.((r) => `${r.title}\n${r.url}\n${r.snippet}`);
      return [
        {
          type: "text" as const,
          content: `Search (${output.provider}): ${output.query}\n\n${lines?.join("\n\n") ?? "(no results)"}`,
        },
      ];
    },
  });
};
