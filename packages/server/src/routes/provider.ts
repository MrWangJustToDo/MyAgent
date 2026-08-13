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
  return resolveModelConnection({
    model: env.MODEL || env.model || "",
    style: parseModelStyle(env.MODEL_STYLE || env.STYLE),
    baseURL: env.BASE_URL || env.MODEL_BASE_URL || undefined,
    apiKey: env.API_KEY || "",
  });
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

/** OpenAI-compatible error body so Chat Completions clients show `message`, not `502 true`. */
function openaiErrorResponse(status: number, message: string, code: string): Response {
  return Response.json(
    {
      error: {
        message,
        type: "proxy_error",
        code,
      },
    },
    { status }
  );
}

function formatUnknownError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  let cause: unknown = err.cause;
  for (let depth = 0; cause instanceof Error && depth < 3; depth += 1) {
    if (cause.message) parts.push(cause.message);
    const code = (cause as Error & { code?: string }).code;
    if (typeof code === "string" && code) parts.push(code);
    cause = cause.cause;
  }
  return parts.join(": ");
}

async function proxyStream(
  c: { req: { raw: Request; url: string; path: string; method: string } },
  family: "openai" | "anthropic"
): Promise<Response> {
  const connection = readServerModelEnv();
  if (connection.style !== family) {
    return openaiErrorResponse(
      400,
      `Server MODEL_STYLE is "${connection.style}", but client requested ${family} proxy`,
      "style_mismatch"
    );
  }
  if (!connection.apiKey) {
    return openaiErrorResponse(500, "Server API_KEY is not configured", "missing_api_key");
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

  // The server is the single source of truth for the model: rewrite any JSON request
  // body's `model` field to the server-configured model so clients cannot forward a
  // different one (e.g. a leftover local default like "gpt-4o-mini").
  let body: BodyInit | undefined = c.req.raw.body ?? undefined;
  if (hasBody && connection.model && connection.baseURL) {
    const contentType = headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const rawText = await c.req.raw.clone().text();
      try {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") {
          if (parsed.model !== connection.model) {
            parsed.model = connection.model;
            body = JSON.stringify(parsed);
          } else {
            body = rawText;
          }
        }
      } catch {
        // Not JSON or unparseable — forward the original body unchanged.
        body = c.req.raw.body ?? undefined;
      }
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? body : undefined,
      ...(hasBody ? ({ duplex: "half" } as RequestInit) : {}),
      signal: c.req.raw.signal,
    });
  } catch (err) {
    return openaiErrorResponse(502, `Upstream provider error: ${formatUnknownError(err)}`, "upstream_fetch_failed");
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
