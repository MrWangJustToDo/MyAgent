/* global process, URL */
import assert from "node:assert/strict";

/** Mirrors resolveFetchProxyUrl priority without DOM. */
function resolveFetchProxyUrl(configured, envUrl, origin) {
  const fromSettings = configured?.trim();
  if (fromSettings) return fromSettings;
  const fromEnv = envUrl?.trim();
  if (fromEnv) return fromEnv;
  return new URL("/__fetch_proxy", origin).href;
}

assert.equal(
  resolveFetchProxyUrl("https://proxy.example/worker", "", "http://localhost:5177"),
  "https://proxy.example/worker"
);
assert.equal(resolveFetchProxyUrl("", "https://env.example", "http://localhost:5177"), "https://env.example");
assert.equal(resolveFetchProxyUrl("", "", "http://localhost:5177"), "http://localhost:5177/__fetch_proxy");

process.stdout.write("validate-resolve-fetch-proxy: ok\n");
