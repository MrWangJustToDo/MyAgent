/**
 * Tree-sitter grammar locator for the WebContainer playground.
 *
 * Bundles the grammar `.wasm` files as same-origin Vite assets so `web-tree-sitter`
 * can `Language.load(url)` them without CORS issues (WebContainer outbound fetch is
 * CORS-limited; the playground origin is not). Only the grammars referenced by core's
 * `LANGUAGE_TO_GRAMMAR` are globbed, so build output stays small.
 *
 * Injected into CoreEnv as `locateTreeSitterGrammar`, consumed by
 * `@my-agent/core`'s TreeSitterManager (`locateGrammar`).
 */

import type { CoreEnv } from "@my-agent/core";

/**
 * Same-origin URLs for each grammar, resolved by Vite at build time.
 * Lazy: Vite emits each `.wasm` as an independent asset and only fetches it
 * when `Language.load` is called for that grammar.
 *
 * Vite keys these by full resolved path (e.g. `/node_modules/tree-sitter-wasms/out/...`);
 * core passes just the file name (`tree-sitter-typescript.wasm`), so look up by suffix.
 */
const GRAMMAR_URLS: Record<string, () => Promise<string>> = import.meta.glob("tree-sitter-wasms/out/*.wasm", {
  query: "?url",
  import: "default",
}) as Record<string, () => Promise<string>>;

/** Map from file name (e.g. "tree-sitter-typescript.wasm") to its loader. */
const GRAMMAR_BY_FILE: Record<string, () => Promise<string>> = Object.fromEntries(
  Object.entries(GRAMMAR_URLS).map(([key, load]) => [key.split("/").pop() ?? key, load])
);

/**
 * Locate a tree-sitter grammar WASM file (e.g. "tree-sitter-typescript.wasm").
 * Returns the same-origin URL string, or null when the grammar is not bundled.
 */
export const locateTreeSitterGrammar: NonNullable<CoreEnv["locateTreeSitterGrammar"]> = async (
  grammarFile: string
): Promise<Uint8Array | string | null> => {
  const load = GRAMMAR_BY_FILE[grammarFile];
  if (!load) return null;
  try {
    const url = await load();
    return typeof url === "string" ? url : String(url);
  } catch {
    return null;
  }
};
