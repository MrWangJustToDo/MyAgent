/**
 * Resolve the two workspace inputs `packages/codent` needs at build time.
 *
 * Both are **build inputs**, deliberately absent from the published package:
 *
 * - `LANGUAGE_TO_GRAMMAR` (from core) — the manifest of languages that exist.
 *   Core owns it; this package only mirrors it into the tarball, so neither the
 *   copy step nor the gate keeps a second list to drift out of sync.
 * - `tree-sitter-wasms` — the 36-grammar / 50 MB aggregate the manifest is read
 *   against. 18 grammars (22.8 MB) are copied into `dist`; the package itself
 *   never reaches a consumer.
 *
 * Resolution is by path rather than by specifier because the two are reached
 * differently, and neither is a plain `import`:
 *
 * - core's `dist/dev.mjs` is its internal-validation entry, deliberately **not**
 *   in its `exports` map, so `@codent/core/dev` and a `package.json` lookup are
 *   both rejected. Walk up from this script so a hoisted install resolves too.
 * - `tree-sitter-wasms` is a dependency of `@codent/node`, not of this package,
 *   so it is **not** reachable by walking up from here (pnpm does not hoist it).
 *   It is found from `@codent/node`'s own location instead.
 */
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

/** @returns {Promise<boolean>} whether `path` exists and is a directory */
async function isDir(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Walk up from `from` looking for `node_modules/<specifier>`, returning its path.
 * @returns {Promise<string | null>} directory, or null when not installed
 */
async function findInstalled(from, specifier) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", specifier);
    if (await isDir(candidate)) return candidate;

    const parent = dirname(dir);
    if (parent === dir) return null;
  }
}

/**
 * Load `LANGUAGE_TO_GRAMMAR` from the installed `@codent/core`.
 *
 * Throws rather than returning an empty manifest: an empty list would make the
 * gate and the copy step trivially agree while shipping no grammars at all.
 * @returns {Promise<Record<string, string>>} language id → grammar file name
 */
export async function loadLanguageToGrammar() {
  const coreDir = await findInstalled(scriptDir, join("@codent", "core"));
  if (!coreDir) {
    throw new Error(`cannot find @codent/core from ${scriptDir} — run "pnpm install" first`);
  }

  // Imported outside a try so a genuine failure inside core surfaces as itself
  // rather than being mistaken for "not installed".
  const { LANGUAGE_TO_GRAMMAR } = await import(pathToFileURL(join(coreDir, "dist", "dev.mjs")).href);

  if (!LANGUAGE_TO_GRAMMAR || Object.keys(LANGUAGE_TO_GRAMMAR).length === 0) {
    throw new Error(`@codent/core (${coreDir}) exports an empty LANGUAGE_TO_GRAMMAR`);
  }
  return LANGUAGE_TO_GRAMMAR;
}

/**
 * Resolve `tree-sitter-wasms`'s `out/` directory, where the `.wasm` files live.
 * @returns {Promise<string>} absolute path to the grammar directory
 */
export async function resolveTreeSitterWasmsOut() {
  const nodeDir = await findInstalled(scriptDir, join("@codent", "node"));
  if (!nodeDir) {
    throw new Error(`cannot find @codent/node from ${scriptDir} — run "pnpm install" first`);
  }

  const wasmsDir = await findInstalled(nodeDir, "tree-sitter-wasms");
  if (!wasmsDir) {
    throw new Error(
      `cannot find tree-sitter-wasms from ${nodeDir} — it declares it as a dependency, ` + `so run "pnpm install"`
    );
  }
  return join(wasmsDir, "out");
}
