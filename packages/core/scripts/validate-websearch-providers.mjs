/**
 * Validates websearch helpers: domain filter, abort-timeout wiring, provider fallback naming.
 *
 * Run: pnpm --filter @codent/core run validate:websearch-providers
 */

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
// The cancel verdict is a render-layer reader and lives on the public entry, not the
// internal one — same split as validate-cancel-semantics.mjs.
import { isAbortError } from "../dist/index.mjs";

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

// The timeout must abort with a REASON that is not a cancel.
//
// A bare `controller.abort()` makes `fetch` reject with the platform's `AbortError`, and
// `isAbortError` accepts that by `name` alone — so a pure timeout settled as "cancelled by
// user" and the model was told `[Search cancelled by user.] <query>` for a search nobody
// stopped. Asserting `isAbortError` on the signal's reason is what pins it: it is the same
// predicate the tools and the presentation layer use to decide "cancel or failure".
{
  const external = new AbortController();
  const { controller, cleanup } = createTimeoutAbort({ timeoutMs: 1, signal: external.signal });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(controller.signal.aborted, true, "the timeout still aborts");
  assert.equal(
    isAbortError(controller.signal.reason, external.signal),
    false,
    "a timeout must NOT read as a user cancel (the run signal is still live)"
  );
  cleanup();

  // …and the user-abort path must keep reading as a cancel, or the fix traded one
  // false negative for a false positive.
  const run = new AbortController();
  const aborted = createTimeoutAbort({ timeoutMs: 60_000, signal: run.signal });
  run.abort();
  assert.equal(aborted.controller.signal.aborted, true, "an external abort still aborts");
  assert.equal(
    isAbortError(aborted.controller.signal.reason, run.signal),
    true,
    "a user abort must still read as a cancel"
  );
  aborted.cleanup();
}

// Provider manager: without braveApiKey, duckduckgo is selected
resetWebsearchProviders();
registerCoreEnv({
  rootPath: "/tmp",
  getPlatform: async () => "linux",
  getArch: async () => "x64",
  getEnv: async () => ({}),
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

  // With braveApiKey configured, brave becomes available
  pm.configure({ braveApiKey: "test-key" });
  assert.equal(await (await pm.selectProvider()).name, "brave");
} finally {
  clearCoreEnv();
  resetWebsearchProviders();
}

console.log("websearch-providers validation passed");
