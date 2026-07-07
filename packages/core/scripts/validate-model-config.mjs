/**
 * Unit validation for model connection resolution (no network).
 *
 * Run: pnpm --filter @my-agent/core run validate:model-config
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import {
  DEFAULT_BASE_URLS,
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  parseModelStyle,
  resolveModelConnection,
} from "../dist/index.mjs";

assert.equal(parseModelStyle("anthropic"), "anthropic");
assert.equal(parseModelStyle("openai"), "openai");
assert.equal(parseModelStyle("ollama"), "openai");
assert.equal(parseModelStyle(undefined), "openai");

const openaiDefault = resolveModelConnection({ style: "openai", model: "gpt-4.1" });
assert.equal(openaiDefault.baseURL, DEFAULT_BASE_URLS.openai);

const anthropicDefault = resolveModelConnection({ style: "anthropic", model: "claude-sonnet-4" });
assert.equal(anthropicDefault.baseURL, DEFAULT_BASE_URLS.anthropic);

const fromEnv = resolveModelConnection({
  env: {
    MODEL_STYLE: "openai",
    MODEL: "qwen2.5-coder:7b",
    BASE_URL: "http://localhost:11434/v1",
    API_KEY: "sk-test",
  },
});
assert.equal(fromEnv.style, "openai");
assert.equal(fromEnv.baseURL, DEFAULT_LOCAL_OPENAI_BASE_URL);
assert.equal(fromEnv.apiKey, "sk-test");

const explicit = resolveModelConnection({
  style: "openai",
  model: "custom",
  baseURL: "https://gateway.example.com/v1",
  apiKey: "key",
});
assert.equal(explicit.baseURL, "https://gateway.example.com/v1");

console.log("model-config validation passed");
