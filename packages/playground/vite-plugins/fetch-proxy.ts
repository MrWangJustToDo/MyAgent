import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";

const PROXY_PATH = "/__fetch_proxy";
const MAX_BODY_BYTES = 5 * 1024 * 1024;

type ProxyRequest = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

async function readJsonBody(req: IncomingMessage): Promise<ProxyRequest> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.byteLength;
    if (size > MAX_BODY_BYTES) {
      throw new Error(`Proxy request too large (>${MAX_BODY_BYTES} bytes)`);
    }
    chunks.push(buf);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as ProxyRequest;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.end(body);
}

async function handleProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "POST only" });
    return;
  }

  try {
    const payload = await readJsonBody(req);
    if (!payload.url || (!payload.url.startsWith("http://") && !payload.url.startsWith("https://"))) {
      sendJson(res, 400, { ok: false, error: "url must start with http:// or https://" });
      return;
    }

    const upstream = await fetch(payload.url, {
      method: payload.method ?? "GET",
      headers: payload.headers,
      body: payload.body,
      redirect: "follow",
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > MAX_BODY_BYTES) {
      sendJson(res, 502, { ok: false, error: `Upstream response too large (>${MAX_BODY_BYTES} bytes)` });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      status: upstream.status,
      statusText: upstream.statusText,
      headers: Object.fromEntries(upstream.headers.entries()),
      body: buffer.toString("base64"),
      encoding: "base64",
    });
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Same-origin Node proxy for webfetch/websearch during `vite` / `vite preview`.
 * GitHub Pages has no Node — deploy `workers/fetch-proxy` (Cloudflare Worker) instead.
 */
export function fetchProxyPlugin(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use((req, res, next) => {
      const path = req.url?.split("?")[0];
      if (path !== PROXY_PATH) {
        next();
        return;
      }
      void handleProxy(req, res);
    });
  };

  return {
    name: "playground-fetch-proxy",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

export const FETCH_PROXY_PATH = PROXY_PATH;
