/**
 * Validates provider path mapping, env secret filtering, and streaming proxy.
 *
 * Run: pnpm --filter @my-agent/server run validate:provider-proxy
 */

import { Hono } from "hono";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import {
  REMOTE_PROVIDER_API_KEY,
  anthropicProxyBasePath,
  filterSensitiveVars,
  mapProviderPathToUpstream,
  normalizeProviderRequestPath,
  openaiProxyBasePath,
  providerRoutes,
} from "../dist/index.mjs";

// --- path helpers ---

assert.equal(openaiProxyBasePath("https://api.openai.com/v1"), "/api/provider/openai/v1");
assert.equal(openaiProxyBasePath("https://api.deepseek.com"), "/api/provider/openai");
assert.equal(anthropicProxyBasePath("https://api.anthropic.com"), "/api/provider/anthropic");

assert.equal(
  mapProviderPathToUpstream("https://api.openai.com/v1", "openai", "/api/provider/openai/v1/chat/completions"),
  "https://api.openai.com/v1/chat/completions"
);
assert.equal(
  mapProviderPathToUpstream("https://api.deepseek.com", "openai", "/openai/v1/chat/completions"),
  "https://api.deepseek.com/v1/chat/completions"
);
assert.equal(normalizeProviderRequestPath("/openai/v1/x"), "/api/provider/openai/v1/x");

assert.equal(REMOTE_PROVIDER_API_KEY, "remote-provider");

// --- env secret filter ---

const filtered = filterSensitiveVars({
  MODEL: "gpt",
  API_KEY: "sk-secret",
  OPENAI_API_KEY: "sk-oai",
  BRAVE_API_KEY: "brave",
  PATH: "/usr/bin",
});
assert.equal(filtered.MODEL, "gpt");
assert.equal(filtered.PATH, "/usr/bin");
assert.equal(filtered.API_KEY, undefined);
assert.equal(filtered.OPENAI_API_KEY, undefined);
assert.equal(filtered.BRAVE_API_KEY, undefined);

// --- streaming proxy against mock upstream ---

const upstreamChunks = ["data: hello\n\n", "data: world\n\n"];
let sawAuth = "";
let sawBody = "";
const upstream = createServer((req, res) => {
  sawAuth = String(req.headers.authorization || "");
  req.on("data", (d) => (sawBody += d));
  req.on("end", () => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const chunk of upstreamChunks) res.write(chunk);
    res.end();
  });
});

await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
const upstreamPort = /** @type {import('node:net').AddressInfo} */ (upstream.address()).port;

process.env.MODEL_STYLE = "openai";
process.env.MODEL = "mock-model";
process.env.BASE_URL = `http://127.0.0.1:${upstreamPort}/v1`;
process.env.API_KEY = "sk-server-only";

const app = new Hono().route("/api/provider", providerRoutes);

const proxyRes = await app.request("http://local/api/provider/openai/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer client-should-not-win" },
  // Client sends a different model — the server must rewrite it to its own MODEL.
  body: JSON.stringify({ model: "client-wrong-model", stream: true }),
});

assert.equal(proxyRes.status, 200);
assert.equal(sawAuth, "Bearer sk-server-only", "server must inject its API_KEY");
const body = await proxyRes.text();
assert.ok(body.includes("hello"));
assert.ok(body.includes("world"));
assert.equal(proxyRes.headers.get("content-encoding"), null, "must not forward content-encoding after decode");

// Server is the single source of truth for the model (remote-mode request body rewrite).
assert.ok(sawBody.includes('"model":"mock-model"'), "server must rewrite forwarded body model");
assert.ok(!sawBody.includes("client-wrong-model"), "client model must not reach upstream");

const infoRes = await app.request("http://local/api/provider/info");
assert.equal(infoRes.status, 200);
const info = await infoRes.json();
assert.equal(info.mode, "remote");
assert.equal(info.style, "openai");
assert.equal(info.model, "mock-model");
assert.equal(info.basePath, "/api/provider/openai/v1");

upstream.close();

process.env.BASE_URL = "http://127.0.0.1:1/v1";
const failRes = await app.request("http://local/api/provider/openai/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ model: "mock-model", stream: false }),
});
assert.equal(failRes.status, 502);
const failBody = await failRes.json();
assert.equal(typeof failBody.error, "object");
assert.equal(failBody.error.code, "upstream_fetch_failed");
assert.match(String(failBody.error.message), /Upstream provider error:/);

console.log("provider-proxy validation passed");
