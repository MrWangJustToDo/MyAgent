/* global process, URL */
import assert from "node:assert/strict";

/** Mirrors resolveFetchProxyUrl priority without DOM. */
function resolveFetchProxyUrl(configured, envUrl, origin, isDev) {
  const fromSettings = configured?.trim();
  if (fromSettings) return fromSettings;
  const fromEnv = envUrl?.trim();
  if (fromEnv) return fromEnv;
  if (isDev) return new URL("/__fetch_proxy", origin).href;
  return "";
}

assert.equal(
  resolveFetchProxyUrl("https://proxy.example/worker", "", "http://localhost:5177", true),
  "https://proxy.example/worker"
);
assert.equal(resolveFetchProxyUrl("", "https://env.example", "http://localhost:5177", false), "https://env.example");
assert.equal(resolveFetchProxyUrl("", "", "http://localhost:5177", true), "http://localhost:5177/__fetch_proxy");
assert.equal(resolveFetchProxyUrl("", "", "https://example.github.io", false), "");

process.stdout.write("validate-resolve-fetch-proxy: ok\n");
