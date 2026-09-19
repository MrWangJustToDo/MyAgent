/**
 * @codent/node tree-sitter grammar locator.
 *
 * Resolves grammar `.wasm` files and returns their bytes. Injected into CoreEnv as
 * `locateTreeSitterGrammar` so core's tree-sitter engine stays runtime-agnostic.
 *
 * Two layouts are supported, in order:
 *
 * 1. **Next to this module** — `dist/tree-sitter/<file>`. This is what the
 *    published `codent-cli` tarball ships: the grammars are copied there at
 *    build time by `packages/codent/scripts/copy-tree-sitter-grammars.mjs`,
 *    because `tree-sitter-wasms` cannot be a runtime dependency (50 MB, 27.2 MB
 *    of which the host never parses) and cannot be inlined (they are `.wasm`).
 * 2. **The `tree-sitter-wasms` package** — the workspace / dev layout, where
 *    that package is installed and no copy has happened.
 *
 * Checking the sibling directory first is what makes the published package work
 * at all: in the bundle `import.meta.url` is the tarball's own `dist`, and no
 * `tree-sitter-wasms` exists under a consumer's `node_modules`.
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** Directory the build copies grammars into, relative to the bundle. */
const SHIPPED_GRAMMAR_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "tree-sitter");

/**
 * Resolve one grammar file to its bytes.
 *
 * Both lookups are attempted independently: a failure in either is expected on
 * one of the two layouts, and only a genuine miss in both returns `null`.
 */
async function readGrammar(grammarFile: string): Promise<Uint8Array | null> {
  for (const candidate of [
    resolve(SHIPPED_GRAMMAR_DIR, grammarFile),
    () => resolve(dirname(require.resolve("tree-sitter-wasms/package.json")), "out", grammarFile),
  ]) {
    try {
      const path = typeof candidate === "function" ? candidate() : candidate;
      return new Uint8Array(await readFile(path));
    } catch {
      // Try the next layout.
    }
  }
  return null;
}

/**
 * Locate and read a tree-sitter grammar WASM file (e.g. "tree-sitter-typescript.wasm").
 * Returns the file bytes, or null when the grammar is not available in either layout.
 */
export async function locateTreeSitterGrammar(grammarFile: string): Promise<Uint8Array | null> {
  return readGrammar(grammarFile);
}
