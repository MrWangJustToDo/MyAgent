/**
 * Remote LLM provider proxy — streams upstream chat traffic with server-side keys.
 *
 * Clients point TanStack adapters at `/api/provider/openai/v1` (or anthropic) so
 * API keys never leave the CoreEnv server. Existing `/api/fetch/proxy` is unsuitable
 * (buffers the full body as JSON).
 */

import { parseModelStyle, resolveModelConnection } from "@my-agent/core";
import { Hono } from "hono";

import { REMOTE_PROVIDER_API_KEY } from "../provider-constants.js";

export { REMOTE_PROVIDER_API_KEY };

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

/**
 * Headers that must not be forwarded on the response when Node `fetch` has already
 * decoded the body (undici auto-decompresses gzip/br). Passing Content-Encoding
 * through causes clients (OpenAI SDK) to gunzip plain text → Z_DATA_ERROR / "terminated".
 */
const RESPONSE_STRIP = new Set([...HOP_BY_HOP, "content-encoding"]);

// ============================================================================
// Upstream resolution
// ============================================================================

export function readServerModelEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
) {
  const connection = resolveModelConnection({ env });
  return connection;
}

/** Relative adapter base path on this server (includes /v1 when upstream does). */
export function openaiProxyBasePath(upstreamBaseURL: string): string {
  const trimmed = upstreamBaseURL.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return "/api/provider/openai/v1";
  return "/api/provider/openai";
}

export function anthropicProxyBasePath(upstreamBaseURL: string): string {
  const trimmed = upstreamBaseURL.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return "/api/provider/anthropic/v1";
  return "/api/provider/anthropic";
}

/**
 * Map a request path under `/api/provider/{family}` onto the upstream base URL.
 */
export function normalizeProviderRequestPath(requestPath: string): string {
  const pathOnly = requestPath.split("?")[0] ?? requestPath;
  if (pathOnly.startsWith("/api/provider/")) return pathOnly;
  if (pathOnly.startsWith("/provider/")) return `/api${pathOnly}`;
  if (pathOnly.startsWith("/openai") || pathOnly.startsWith("/anthropic")) {
    return `/api/provider${pathOnly}`;
  }
  return pathOnly;
}

export function mapProviderPathToUpstream(
  upstreamBaseURL: string,
  family: "openai" | "anthropic",
  requestPath: string
): string {
  const proxyBase =
    family === "openai" ? openaiProxyBasePath(upstreamBaseURL) : anthropicProxyBasePath(upstreamBaseURL);
  const pathOnly = normalizeProviderRequestPath(requestPath);
  let rest = pathOnly.startsWith(proxyBase) ? pathOnly.slice(proxyBase.length) : pathOnly;
  if (!rest.startsWith("/")) rest = `/${rest}`;
  if (rest === "/") rest = "";
  return `${upstreamBaseURL.replace(/\/+$/, "")}${rest}`;
}

function filterRequestHeaders(source: Headers, inject: Record<string, string>): Headers {
  const out = new Headers();
  source.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "authorization" || lower === "x-api-key") return;
    // Avoid asking upstream for encodings we would mishandle after undici decode.
    if (lower === "accept-encoding") return;
    out.set(key, value);
  });
  for (const [key, value] of Object.entries(inject)) {
    out.set(key, value);
  }
  return out;
}

function filterResponseHeaders(source: Headers): Headers {
  const out = new Headers();
  source.forEach((value, key) => {
    if (RESPONSE_STRIP.has(key.toLowerCase())) return;
    out.set(key, value);
  });
  return out;
}

async function proxyStream(
  c: { req: { raw: Request; url: string; path: string; method: string } },
  family: "openai" | "anthropic"
): Promise<Response> {
  const connection = readServerModelEnv();
  if (connection.style !== family) {
    return Response.json(
      {
        error: true,
        message: `Server MODEL_STYLE is "${connection.style}", but client requested ${family} proxy`,
      },
      { status: 400 }
    );
  }
  if (!connection.apiKey) {
    return Response.json({ error: true, message: "Server API_KEY is not configured" }, { status: 500 });
  }

  const pathname = new URL(c.req.url).pathname;
  const target = mapProviderPathToUpstream(connection.baseURL, family, pathname);
  const url = new URL(c.req.url);
  const targetUrl = `${target}${url.search}`;

  const inject: Record<string, string> =
    family === "anthropic"
      ? {
          "x-api-key": connection.apiKey,
          "anthropic-version": process.env.ANTHROPIC_VERSION?.trim() || "2023-06-01",
        }
      : {
          Authorization: `Bearer ${connection.apiKey}`,
        };

  const headers = filterRequestHeaders(c.req.raw.headers, inject);
  const method = c.req.method;
  const hasBody = method !== "GET" && method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? c.req.raw.body : undefined,
      ...(hasBody ? ({ duplex: "half" } as RequestInit) : {}),
      signal: c.req.raw.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: true, message: `Upstream provider error: ${message}` }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: filterResponseHeaders(upstream.headers),
  });
}

// ============================================================================
// Routes
// ============================================================================

export interface ProviderInfoResponse {
  mode: "proxy";
  style: "openai" | "anthropic";
  model: string;
  /** Absolute-path adapter baseURL on this server (no host). */
  basePath: string;
}

export const providerRoutes = new Hono()
  .get("/info", (c) => {
    const connection = readServerModelEnv();
    const style = parseModelStyle(connection.style);
    const basePath =
      style === "anthropic" ? anthropicProxyBasePath(connection.baseURL) : openaiProxyBasePath(connection.baseURL);
    const body: ProviderInfoResponse = {
      mode: "proxy",
      style,
      model: connection.model,
      basePath,
    };
    return c.json(body);
  })
  .all("/openai/*", (c) => proxyStream(c, "openai"))
  .all("/openai", (c) => proxyStream(c, "openai"))
  .all("/anthropic/*", (c) => proxyStream(c, "anthropic"))
  .all("/anthropic", (c) => proxyStream(c, "anthropic"));
