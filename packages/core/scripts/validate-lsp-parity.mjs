/**
 * Validation for LSP parity helpers (Lombok discovery, synthetic dot, tool output).
 *
 * Run: pnpm --filter @my-agent/core run validate:lsp-parity
 */

import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DIAGNOSTIC_SETTLE_DELAY_MS,
  SYNTHETIC_DOT_SETTLE_DELAY_MS,
  findLombokJar,
  insertDot,
  lspTextToModelOutput,
  shouldSyntheticTrigger,
} from "../dist/dev.mjs";

assert.equal(DIAGNOSTIC_SETTLE_DELAY_MS, 1500);
assert.equal(SYNTHETIC_DOT_SETTLE_DELAY_MS, 100);

assert.deepEqual(shouldSyntheticTrigger("foo", 0, 3), { insertLine: 0, insertChar: 3 });
assert.equal(shouldSyntheticTrigger("foo.bar", 0, 4), null);
assert.equal(insertDot("foo", 0, 3), "foo.");

const textOut = lspTextToModelOutput({
  toolCallId: "t1",
  input: {},
  output: { text: "hello", count: 1 },
});
assert.equal(textOut, "hello");

const root = await mkdtemp(join(tmpdir(), "lsp-parity-"));
const envDir = join(root, "env", "Lombok-1.18.30", "runtime", "lib");
await mkdir(envDir, { recursive: true });
const jarPath = join(envDir, "lombok-1.18.30.jar");
await writeFile(jarPath, "fake");

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const found = await findLombokJar({
  rootDir: root,
  path: { join, resolve: join },
  exists,
  readdir: async (p) => {
    const entries = await readdir(p, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
    }));
  },
  getEnvVar: () => undefined,
  explicitJar: null,
});
assert.equal(found, jarPath);

console.log("lsp-parity validation passed");
