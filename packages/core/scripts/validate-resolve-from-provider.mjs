/**
 * Validates resolveModelConfigFromProvider proxy vs direct merge rules.
 *
 * Run: pnpm --filter @my-agent/core run validate:resolve-from-provider
 */
/* eslint-disable no-undef */
/* eslint-disable import/no-useless-path-segments */

import assert from "node:assert/strict";

import { clearModelProvider, registerModelProvider, resolveModelConfigFromProvider } from "../dist/index.mjs";

clearModelProvider();

registerModelProvider({
  getConnection: async () => ({
    mode: "proxy",
    style: "openai",
    model: "server-model",
    baseURL: "http://remote/api/provider/openai/v1",
    apiKey: "remote-coreenv",
  }),
});

const proxied = await resolveModelConfigFromProvider({
  model: "client-override-model",
  style: "anthropic",
  baseURL: "http://evil.example/v1",
  apiKey: "sk-client",
});

assert.equal(proxied.connection.model, "client-override-model");
assert.equal(proxied.connection.style, "openai", "proxy forces provider style");
assert.equal(proxied.connection.baseURL, "http://remote/api/provider/openai/v1");
assert.equal(proxied.connection.apiKey, "remote-coreenv");
assert.equal(proxied.providerMode, "proxy");

// models.dev / MODEL_* metadata must not clobber the proxy baseURL
const proxiedMeta = await resolveModelConfigFromProvider({
  model: "client-override-model",
  modelInfo: {
    id: "client-override-model",
    name: "client-override-model",
    style: "openai",
    apiModel: "client-override-model",
    capabilities: [],
    baseURL: "https://api.openai.com/v1",
  },
});
assert.equal(proxiedMeta.connection.baseURL, "http://remote/api/provider/openai/v1");
assert.equal(proxiedMeta.modelInfo?.baseURL, undefined);

clearModelProvider();

registerModelProvider({
  getConnection: async () => ({
    mode: "direct",
    style: "openai",
    model: "local-model",
    baseURL: "http://localhost:11434/v1",
    apiKey: "local-key",
  }),
});

const direct = await resolveModelConfigFromProvider({
  model: "gpt-test",
  baseURL: "https://api.openai.com/v1",
  apiKey: "sk-local",
});
assert.equal(direct.connection.model, "gpt-test");
assert.equal(direct.connection.baseURL, "https://api.openai.com/v1");
assert.equal(direct.connection.apiKey, "sk-local");
assert.equal(direct.providerMode, "direct");

clearModelProvider();
console.log("resolve-from-provider validation passed");
