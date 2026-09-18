/**
 * Validates the client side of the remote-provider model contract: the model a remote
 * entry sends is the one its provider serves, and that model is always selectable.
 *
 * Remote mode forces the provider's own model onto every request
 * (`resolveModelConfigFromProvider`), so a client reporting anything else — the server's
 * models.json `active`, or the first id in its models.json — names a model that never
 * reaches the wire. That is exactly what a real deployment looked like:
 *
 *   {"mode":"remote","style":"openai","model":"deepseek/deepseek-v4-flash-0731",
 *    "config":{"models":[{"type":"direct","style":"anthropic",
 *                         "models":["deepseek/deepseek-v4.1-flash", …]}]}}
 *
 * …whose host displayed `deepseek/deepseek-v4.1-flash` while every request carried
 * `deepseek/deepseek-v4-flash-0731`.
 *
 * Both entry sources are covered: the provider source (`--remote-provider`) and a file
 * source whose models.json holds a `remote-provider` entry.
 *
 * Run: pnpm --filter @codent/core run validate:provider-model-list
 */
/* eslint-disable no-undef */

import assert from "node:assert/strict";

import {
  clearModelProvider,
  loadModels,
  registerCoreEnv,
  registerModelProviderForEntry,
  resolveModelConfigFromProvider,
} from "../dist/index.mjs";

// ============================================================================
// Stubbed provider info
// ============================================================================

const PROVIDER_URL = "http://provider.test:3100";
const SERVED_MODEL = "deepseek/deepseek-v4-flash-0731";
const OTHER_MODELS = ["deepseek/deepseek-v4.1-flash", "moonshot/kimi-k3", "zhipu/glm-5.3-flash"];

const infos = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const info = infos.get(String(input));
  // 404 rather than a throw for anything else: models.dev lookups stay offline, and the
  // resolve pipeline already treats "no metadata" as `undefined`.
  return info ? Response.json(info) : new Response("not found", { status: 404 });
};

/** Register the `/api/provider/info` payload a server would answer with. */
function serveProvider(url, config) {
  infos.set(`${url}/api/provider/info`, {
    mode: "remote",
    style: "openai",
    model: SERVED_MODEL,
    basePath: "/api/provider/openai/v1",
    ...(config ? { config } : {}),
  });
}

// ============================================================================
// 1. The deployed shape: models.json names other ids and records no selection
// ============================================================================

serveProvider(PROVIDER_URL, { models: [{ type: "direct", style: "anthropic", models: OTHER_MODELS }] });

const state = await loadModels({ kind: "provider", serverUrl: PROVIDER_URL });
const entry = state.entries[0];

assert.equal(state.entries.length, 1, "a provider source collapses to a single entry");
assert.equal(entry.type, "remote");
assert.equal(entry.servedModel, SERVED_MODEL, "the entry records what the provider serves");
assert.deepEqual(
  entry.models,
  [...OTHER_MODELS, SERVED_MODEL],
  "the served model must be selectable even though models.json does not list it"
);
assert.equal(entry.style, "openai", "the entry style follows the connection, not models.json");
assert.equal(entry.baseURL, `${PROVIDER_URL}/api/provider/openai/v1`);
assert.equal(state.active.model, SERVED_MODEL, "the reported model is the served one, not models.json's first id");

// The invariant all of this exists for: what the host displays (`active.model` — read by
// the footer, help, and the `/models` "(current)" marker) must equal the model the
// adapter will send.
clearModelProvider();
await registerModelProviderForEntry(state);
const { connection } = await resolveModelConfigFromProvider({ model: "gpt-4o-mini" });
assert.equal(connection.model, SERVED_MODEL, "remote mode forces the provider's model");
assert.equal(state.active.model, connection.model, "displayed model == the model carried by the request");
clearModelProvider();

// ============================================================================
// 2. No models.json at all
// ============================================================================

serveProvider("http://plain.test:3100");
const plain = await loadModels({ kind: "provider", serverUrl: "http://plain.test:3100" });
assert.deepEqual(plain.entries[0].models, [SERVED_MODEL]);
assert.equal(plain.active.model, SERVED_MODEL);

// ============================================================================
// 3. Chained config: a models.json holding only `remote-provider` entries
// ============================================================================

// An empty `flatMap` is not nullish, so the old `?? (info.model ? …)` fallback never
// applied here and the selectable list came out empty.
serveProvider("http://chained.test:3100", {
  models: [{ type: "remote-provider", url: "http://upstream.test:3200" }],
});
const chained = await loadModels({ kind: "provider", serverUrl: "http://chained.test:3100" });
assert.deepEqual(chained.entries[0].models, [SERVED_MODEL], "an id-less config must still offer the served model");
assert.equal(chained.active.model, SERVED_MODEL);

// ============================================================================
// 4. A file source recording a stale selection
// ============================================================================

// The same rule holds for a local models.json that routes through a provider: the
// recorded `active.model` cannot survive, because that server's model is what runs.
{
  const modelsJson = JSON.stringify({
    models: [{ type: "remote-provider", url: PROVIDER_URL }],
    active: { entryIndex: 0, model: "stale-model" },
  });
  registerCoreEnv({
    rootPath: "/workspace",
    fs: {
      exists: async (p) => p === "/workspace/.agents/config/models.json",
      readFile: async () => modelsJson,
    },
  });

  const fileState = await loadModels({ kind: "file" });
  assert.equal(fileState.entries[0].type, "remote");
  assert.equal(fileState.active.model, SERVED_MODEL, "a stale file selection yields to the served model");
  assert.ok(fileState.entries[0].models.includes(SERVED_MODEL), "and the served model stays selectable");
}

globalThis.fetch = realFetch;

console.log("provider-model-list validation passed");
