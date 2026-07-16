/**
 * Cloudflare Worker: CORS-safe fetch proxy for GitHub Pages playground.
 *
 * Deploy:
 *   cd packages/playground/workers/fetch-proxy && npx wrangler deploy
 *
 * Then set Settings → Fetch proxy URL to the worker URL, or build with:
 *   VITE_FETCH_PROXY_URL=https://your-worker.workers.dev
 */

const MAX_BODY_BYTES = 5 * 1024 * 1024;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  // Required when the playground page is cross-origin isolated (COEP)
  "Cross-Origin-Resource-Policy": "cross-origin",
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "POST only" }, 405);
    }

    try {
      const payload = (await request.json()) as {
        url?: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };

      if (!payload.url || (!payload.url.startsWith("http://") && !payload.url.startsWith("https://"))) {
        return json({ ok: false, error: "url must start with http:// or https://" }, 400);
      }

      const upstream = await fetch(payload.url, {
        method: payload.method ?? "GET",
        headers: payload.headers,
        body: payload.body,
        redirect: "follow",
      });

      const buffer = new Uint8Array(await upstream.arrayBuffer());
      if (buffer.byteLength > MAX_BODY_BYTES) {
        return json({ ok: false, error: `Upstream response too large (>${MAX_BODY_BYTES} bytes)` }, 502);
      }

      let binary = "";
      for (let i = 0; i < buffer.byteLength; i++) {
        binary += String.fromCharCode(buffer[i]!);
      }

      return json({
        ok: true,
        status: upstream.status,
        statusText: upstream.statusText,
        headers: Object.fromEntries(upstream.headers.entries()),
        body: btoa(binary),
        encoding: "base64",
      });
    } catch (err) {
      return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
    }
  },
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
