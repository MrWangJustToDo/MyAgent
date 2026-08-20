/**
 * @my-agent/node tree-sitter grammar locator.
 *
 * Resolves grammar `.wasm` files from the `tree-sitter-wasms` package and returns
 * their bytes. Injected into CoreEnv as `locateTreeSitterGrammar` so core's
 * tree-sitter engine stays runtime-agnostic.
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);

/**
 * Locate and read a tree-sitter grammar WASM file (e.g. "tree-sitter-typescript.wasm").
 * Returns the file bytes, or null when the grammar is not installed.
 */
export async function locateTreeSitterGrammar(grammarFile: string): Promise<Uint8Array | null> {
  try {
    const wasmsPkgJson = require.resolve("tree-sitter-wasms/package.json");
    const outDir = resolve(dirname(wasmsPkgJson), "out");
    const grammarPath = resolve(outDir, grammarFile);
    const bytes = await readFile(grammarPath);
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}
