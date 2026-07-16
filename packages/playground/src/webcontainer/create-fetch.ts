import type { WebContainer } from "@webcontainer/api";

/** Node script mounted in the WebContainer — server-side fetch, no browser CORS. */
export const FETCH_RUNNER_SOURCE = `import { readFileSync, writeFileSync } from "node:fs";

const reqPath = process.argv[2];
const resPath = process.argv[3];
const req = JSON.parse(readFileSync(reqPath, "utf8"));

try {
  const res = await fetch(req.url, {
    method: req.method ?? "GET",
    headers: req.headers,
    body: req.body,
    redirect: req.redirect ?? "follow",
  });
  const body = Buffer.from(await res.arrayBuffer()).toString("base64");
  writeFileSync(
    resPath,
    JSON.stringify({
      ok: true,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body,
      encoding: "base64",
    })
  );
} catch (error) {
  writeFileSync(
    resPath,
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exit(1);
}
`;

const FETCH_DIR = "/.playground/fetch";
const FETCH_SCRIPT = "/.playground/fetch.mjs";

interface FetchRequestPayload {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  redirect?: RequestRedirect;
}

interface FetchResponsePayload {
  ok: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
  encoding?: "base64";
  error?: string;
}

function resolveUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function collectHeaders(input: string | URL | Request, init?: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {};
  const raw = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  if (!raw) return headers;

  if (raw instanceof Headers) {
    raw.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  if (Array.isArray(raw)) {
    for (const [key, value] of raw) {
      headers[key] = value;
    }
    return headers;
  }

  return { ...raw };
}

async function readBody(input: string | URL | Request, init?: RequestInit): Promise<string | undefined> {
  if (typeof init?.body === "string") return init.body;
  if (input instanceof Request && init?.body === undefined) {
    return input.text();
  }
  return undefined;
}

function decodeBase64(body: string): Uint8Array {
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * CoreEnv.fetch for the browser playground.
 *
 * Browser fetch is blocked by CORS on GitHub Pages and most static hosts.
 * WebContainer's Node runtime can fetch outbound URLs without CORS limits.
 */
export function createWebContainerFetch(wc: WebContainer): typeof fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const payload: FetchRequestPayload = {
      url: resolveUrl(input),
      method: init?.method ?? (input instanceof Request ? input.method : "GET"),
      headers: collectHeaders(input, init),
      body: await readBody(input, init),
      redirect: init?.redirect,
    };

    const id = crypto.randomUUID();
    const reqPath = `${FETCH_DIR}/req-${id}.json`;
    const resPath = `${FETCH_DIR}/res-${id}.json`;

    await wc.fs.mkdir(FETCH_DIR, { recursive: true });
    await wc.fs.writeFile(reqPath, JSON.stringify(payload));

    const process = await wc.spawn("node", [FETCH_SCRIPT, reqPath, resPath]);
    const abortListener = () => {
      try {
        process.kill();
      } catch {
        // ignore
      }
    };
    init?.signal?.addEventListener("abort", abortListener, { once: true });

    try {
      const exitCode = await process.exit;
      const raw = await wc.fs.readFile(resPath, "utf-8");
      const data = JSON.parse(raw) as FetchResponsePayload;

      if (!data.ok) {
        throw new TypeError(data.error ?? "Fetch failed inside WebContainer");
      }

      if (exitCode !== 0 && !data.status) {
        throw new TypeError(data.error ?? `Fetch runner exited with code ${exitCode ?? 1}`);
      }

      const bytes = data.body ? decodeBase64(data.body) : new Uint8Array();
      return new Response(bytes as unknown as BodyInit, {
        status: data.status ?? 500,
        statusText: data.statusText ?? "",
        headers: data.headers,
      });
    } catch (err) {
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      if (err instanceof TypeError || err instanceof DOMException) throw err;
      throw new TypeError(err instanceof Error ? err.message : String(err));
    } finally {
      init?.signal?.removeEventListener("abort", abortListener);
      await wc.fs.rm(reqPath, { force: true }).catch(() => undefined);
      await wc.fs.rm(resPath, { force: true }).catch(() => undefined);
    }
  };
}
