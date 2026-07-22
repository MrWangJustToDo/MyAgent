/**
 * Validation for extension path helpers + export normalization.
 *
 * Run: pnpm --filter @my-agent/core run validate:extension-loader
 */

import assert from "node:assert/strict";

import { isExtensionModuleFile, normalizeExtensionExport, pathToFileUrl } from "../dist/dev.mjs";

assert.equal(isExtensionModuleFile("hello.js"), true);
assert.equal(isExtensionModuleFile("hello.mjs"), true);
assert.equal(isExtensionModuleFile("hello.ts"), true);
assert.equal(isExtensionModuleFile("hello.d.ts"), false);
assert.equal(isExtensionModuleFile("hello.test.js"), false);
assert.equal(isExtensionModuleFile("hello.spec.ts"), false);
assert.equal(isExtensionModuleFile("readme.md"), false);

assert.equal(pathToFileUrl("/tmp/ext.js"), "file:///tmp/ext.js");
assert.equal(pathToFileUrl("C:\\ext\\a.js"), "file:///C:/ext/a.js");

const asApi = await normalizeExtensionExport(
  {
    default: {
      id: "from-api",
      name: "From API",
      version: "1.0.0",
      description: "test",
      activate: async () => {},
    },
  },
  "fallback"
);
assert.equal(asApi.id, "from-api");

const asFactory = await normalizeExtensionExport(
  {
    default: {
      create: async () => ({
        id: "from-factory",
        name: "Factory",
        version: "0.1.0",
        description: "",
        activate: async () => {},
      }),
    },
  },
  "fallback"
);
assert.equal(asFactory.id, "from-factory");

let activated = false;
const asFn = await normalizeExtensionExport(
  {
    default: async () => {
      activated = true;
    },
  },
  "fn-ext"
);
assert.equal(asFn.id, "fn-ext");
await asFn.activate({
  id: "fn-ext",
  env: {},
  z: { object: () => ({}) },
  registerTool: () => {},
  registerCommand: () => {},
  registerInterceptor: () => () => {},
  events: { emit: async () => undefined, on: () => () => {}, off: () => {} },
  ui: { notify: () => {}, subscribe: () => () => {} },
  logger: { info: () => {}, warn: () => {}, error: () => {} },
});
assert.equal(activated, true);

await assert.rejects(() => normalizeExtensionExport({ default: { nope: true } }, "bad"), /must be an ExtensionAPI/);

console.log("extension-loader validation passed");
