/**
 * WebFetch Tool - Fetches web content and converts to various formats.
 *
 * This tool fetches content from URLs and can:
 * - Return raw HTML
 * - Convert HTML to Markdown (default)
 * - Extract plain text from HTML
 * - Handle images by returning base64 data
 *
 * Based on OpenCode's webfetch implementation.
 */

import { tool } from "ai";
import TurndownService from "turndown";
import { z } from "zod";

import { withDuration } from "./helpers.js";

// ============================================================================
// Constants
// ============================================================================

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT = 30; // 30 seconds
const MAX_TIMEOUT = 120; // 2 minutes

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert HTML to Markdown using Turndown
 */
function convertHTMLToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });

  // Remove script, style, and other non-content elements
  turndownService.remove(["script", "style", "meta", "link", "noscript"]);

  return turndownService.turndown(html);
}

/**
 * Extract plain text from HTML by stripping tags
 */
function extractTextFromHTML(html: string): string {
  // Remove script and style content first
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "");

  // Replace block-level elements with newlines
  text = text.replace(/<(p|div|br|hr|h[1-6]|li|tr)[^>]*>/gi, "\n");

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  return text.trim();
}

/**
 * Build Accept header based on requested format
 */
function buildAcceptHeader(format: string): string {
  switch (format) {
    case "markdown":
      return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1";
    case "text":
      return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1";
    case "html":
      return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1";
    default:
      return "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
  }
}

// ============================================================================
// Output Schema
// ============================================================================

export const webfetchOutputSchema = z.object({
  /** The URL that was fetched */
  url: z.string().describe("The URL that was fetched"),
  /** Content type of the response */
  contentType: z.string().describe("The Content-Type header of the response"),
  /** The fetched content in the requested format */
  content: z.string().describe("The fetched content in the requested format"),
  /** Length of the content in characters */
  contentLength: z.number().describe("Length of the content in characters"),
  /** Whether the content is an image (base64 encoded) */
  isImage: z.boolean().describe("Whether the content is an image"),
  /** Human-readable message */
  message: z.string().describe("Human-readable result message"),
  /** Execution duration in milliseconds */
  durationMs: z.number().describe("Execution duration in milliseconds"),
});

export type WebfetchOutput = z.infer<typeof webfetchOutputSchema>;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Creates a webfetch tool for fetching web content.
 *
 * Unlike the simpler fetch-url tool which uses curl, this tool:
 * - Uses native fetch API
 * - Converts HTML to Markdown by default
 * - Handles images by returning base64 data
 * - Has better content type handling
 *
 * @example
 * ```typescript
 * const webfetchTool = createWebfetchTool();
 * ```
 */
export const createWebfetchTool = () => {
  return tool({
    description: `Fetches content from a URL and returns it in the specified format.

Use this tool when you need to:
- Read documentation from the web
- Fetch API responses
- Download and analyze web page content
- Get content from GitHub, Stack Overflow, or other web resources

Features:
- Converts HTML to Markdown by default (cleaner for reading)
- Can return raw HTML or plain text
- Handles images by returning base64-encoded data
- Follows redirects automatically
- Has a 5MB size limit

Usage notes:
- The URL must start with http:// or https://
- Format options: "markdown" (default), "text", or "html"
- Timeout defaults to 30 seconds, max 120 seconds
- For large pages, content may be truncated`,

    inputSchema: z.object({
      url: z.string().describe("The URL to fetch content from. Must start with http:// or https://"),
      format: z
        .enum(["text", "markdown", "html"])
        .default("markdown")
        .describe("The format to return content in. Defaults to markdown."),
      timeout: z
        .number()
        .int()
        .min(1)
        .max(MAX_TIMEOUT)
        .optional()
        .describe(`Timeout in seconds (1-${MAX_TIMEOUT}). Defaults to ${DEFAULT_TIMEOUT}.`),
    }),

    outputSchema: webfetchOutputSchema,

    execute: async ({ url, format, timeout }) => {
      return withDuration(async () => {
        // Validate URL
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          throw new Error("URL must start with http:// or https://");
        }

        const timeoutMs = Math.min((timeout ?? DEFAULT_TIMEOUT) * 1000, MAX_TIMEOUT * 1000);

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const headers = {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            Accept: buildAcceptHeader(format),
            "Accept-Language": "en-US,en;q=0.9",
          };

          let response = await fetch(url, {
            signal: controller.signal,
            headers,
            redirect: "follow",
          });

          // Retry with honest UA if blocked by Cloudflare bot detection
          if (response.status === 403 && response.headers.get("cf-mitigated") === "challenge") {
            response = await fetch(url, {
              signal: controller.signal,
              headers: { ...headers, "User-Agent": "my-agent-webfetch" },
              redirect: "follow",
            });
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          // Check content length
          const contentLengthHeader = response.headers.get("content-length");
          if (contentLengthHeader && parseInt(contentLengthHeader) > MAX_RESPONSE_SIZE) {
            throw new Error(`Response too large: ${contentLengthHeader} bytes (limit: ${MAX_RESPONSE_SIZE})`);
          }

          const arrayBuffer = await response.arrayBuffer();
          if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
            throw new Error(`Response too large: ${arrayBuffer.byteLength} bytes (limit: ${MAX_RESPONSE_SIZE})`);
          }

          const contentType = response.headers.get("content-type") || "text/plain";
          const mime = contentType.split(";")[0]?.trim().toLowerCase() || "text/plain";

          // Handle images
          const isImage = mime.startsWith("image/") && mime !== "image/svg+xml";
          if (isImage) {
            const base64Content = Buffer.from(arrayBuffer).toString("base64");
            return {
              url,
              contentType,
              content: `data:${mime};base64,${base64Content}`,
              contentLength: base64Content.length,
              isImage: true,
              message: `Fetched image (${mime}, ${arrayBuffer.byteLength} bytes)`,
            };
          }

          // Decode text content
          const rawContent = new TextDecoder().decode(arrayBuffer);

          // Convert content based on requested format
          let content: string;
          switch (format) {
            case "markdown":
              if (contentType.includes("text/html")) {
                content = convertHTMLToMarkdown(rawContent);
              } else {
                content = rawContent;
              }
              break;

            case "text":
              if (contentType.includes("text/html")) {
                content = extractTextFromHTML(rawContent);
              } else {
                content = rawContent;
              }
              break;

            case "html":
            default:
              content = rawContent;
              break;
          }

          return {
            url,
            contentType,
            content,
            contentLength: content.length,
            isImage: false,
            message: `Fetched ${url} (${contentType}, ${content.length} chars)`,
          };
        } finally {
          clearTimeout(timeoutId);
        }
      });
    },
  });
};
