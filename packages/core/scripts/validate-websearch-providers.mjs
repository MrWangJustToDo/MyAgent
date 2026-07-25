/**
 * Validates websearch helpers: domain filter, abort-timeout wiring, provider fallback naming.
 *
 * Run: pnpm --filter @my-agent/core run validate:websearch-providers
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import {
  clearCoreEnv,
  createTimeoutAbort,
  filterResultsByDomain,
  getProviderManager,
  initializeProviders,
  registerCoreEnv,
  resetWebsearchProviders,
} from "../dist/dev.mjs";

// Domain filter
const results = [
  { title: "GH", snippet: "", url: "https://github.com/foo" },
  { title: "SO", snippet: "", url: "https://stackoverflow.com/q/1" },
  { title: "Pin", snippet: "", url: "https://www.pinterest.com/x" },
  { title: "Bad", snippet: "", url: "not-a-url" },
];

assert.deepEqual(
  filterResultsByDomain(results, ["github.com"]).map((r) => r.title),
  ["GH"]
);
assert.deepEqual(
  filterResultsByDomain(results, undefined, ["pinterest.com"]).map((r) => r.title),
  ["GH", "SO", "Bad"]
);
assert.equal(
  filterResultsByDomain(results, ["github.com"]).some((r) => r.title === "Bad"),
  false
);

// Abort + timeout: external abort cancels controller.signal
{
  const external = new AbortController();
  const { controller, cleanup } = createTimeoutAbort({ timeoutMs: 60_000, signal: external.signal });
  assert.equal(controller.signal.aborted, false);
  external.abort();
  assert.equal(controller.signal.aborted, true);
  cleanup();
}

// Already-aborted external signal
{
  const external = new AbortController();
  external.abort();
  const { controller, cleanup } = createTimeoutAbort({ timeoutMs: 60_000, signal: external.signal });
  assert.equal(controller.signal.aborted, true);
  cleanup();
}

// Provider manager: report the provider that actually succeeded
resetWebsearchProviders();
registerCoreEnv({
  rootPath: "/tmp",
  getPlatform: async () => "linux",
  getArch: async () => "x64",
  getEnv: async () => ({}), // no BRAVE_API_KEY → brave unavailable
  homedir: async () => "/tmp",
  fs: {
    readFile: async () => "",
    writeFile: async () => {},
    mkdir: async () => {},
    exists: async () => false,
    readdir: async () => [],
    stat: async () => ({ isDirectory: false, isFile: true, size: 0, mtime: new Date() }),
    remove: async () => {},
  },
  runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
  exec: async () => ({ stdout: "", stderr: "", code: 0 }),
  fetch: async () =>
    new Response(
      `<div class="result web-result"><a class="result__a" href="https://example.com">Example</a><a class="result__snippet">Hi</a></div>`,
      { status: 200, headers: { "content-type": "text/html" } }
    ),
});

try {
  initializeProviders();
  const pm = getProviderManager();
  const selected = await pm.selectProvider();
  assert.equal(selected.name, "duckduckgo");

  const outcome = await pm.search("test query", { maxResults: 3, timeoutMs: 5000 });
  assert.equal(outcome.provider, "duckduckgo");
  assert.ok(outcome.results.length >= 1);
  assert.equal(outcome.results[0].url, "https://example.com");
} finally {
  clearCoreEnv();
  resetWebsearchProviders();
}

console.log("websearch-providers validation passed");
