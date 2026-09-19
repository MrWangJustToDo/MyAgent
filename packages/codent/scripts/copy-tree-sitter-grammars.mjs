/**
 * Ship the tree-sitter grammars the Node host actually parses with.
 *
 * `tree-sitter-wasms` is a 36-grammar, 50 MB aggregate package, and the host
 * uses 18 of them (22.8 MB). It cannot be a runtime dependency — the consumer
 * would install all 50 MB, 27.2 MB of it dead weight — and it cannot be inlined
 * either, because the grammars are `.wasm`, not JavaScript. So it is a
 * **build-time input**: this script copies the needed grammars next to `dist`
 * and nothing of the package reaches the tarball.
 *
 * The manifest comes from core (`LANGUAGE_TO_GRAMMAR`), not a list kept here,
 * so adding a language cannot leave the tarball behind. That import is why this
 * runs *after* the core build and not as part of tsdown's own pipeline.
 *
 * Copies are additive: tsdown's `clean: true` empties `dist` on every build, so
 * a stale grammar cannot survive a rebuild and a removed one cannot linger.
 * `files: ["dist"]` in package.json picks the directory up unchanged.
 *
 * `dist/tree-sitter/` is also what the runtime looks in — see
 * `grammar.ts` in `@codent/node` for the resolution order.
 */
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadLanguageToGrammar, resolveTreeSitterWasmsOut } from "./resolve-workspace-deps.mjs";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(pkgRoot, "dist", "tree-sitter");

let LANGUAGE_TO_GRAMMAR;
let sourceDir;
try {
  LANGUAGE_TO_GRAMMAR = await loadLanguageToGrammar();
  sourceDir = await resolveTreeSitterWasmsOut();
} catch (error) {
  console.error(
    `[codent] copy-tree-sitter-grammars FAILED\n` +
      `  - ${error instanceof Error ? error.message : String(error)}\n\n` +
      `The grammars are a build-time input ("pnpm build:core" then "pnpm build").`
  );
  process.exit(1);
}

const needed = [...new Set(Object.values(LANGUAGE_TO_GRAMMAR))].sort();

let present;
try {
  present = new Set(await readdir(sourceDir));
} catch (error) {
  console.error(
    `[codent] copy-tree-sitter-grammars FAILED\n` +
      `  - cannot read ${sourceDir}\n` +
      `    ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}

const missing = needed.filter((file) => !present.has(file));
if (missing.length > 0) {
  console.error(
    `[codent] copy-tree-sitter-grammars FAILED\n\n` +
      missing.map((file) => `  - "${file}" is in LANGUAGE_TO_GRAMMAR but not in tree-sitter-wasms`).join("\n") +
      `\n\nThe published package would ship a language that cannot be parsed.`
  );
  process.exit(1);
}

// Fail loudly rather than shipping an empty directory: the tarball would build
// fine and every tree-sitter tool would fail at runtime, for a consumer only.
if (needed.length === 0) {
  console.error("[codent] copy-tree-sitter-grammars FAILED\n  - LANGUAGE_TO_GRAMMAR is empty");
  process.exit(1);
}
// tsdown clears `dist` before each build, so this is a create rather than a
// reconcile. Any leftover is from a build that was interrupted mid-copy.
await mkdir(outDir, { recursive: true });
for (const file of needed) {
  await cp(join(sourceDir, file), join(outDir, file));
}

let total = 0;
for (const file of needed) total += (await stat(join(outDir, file))).size;

console.log(
  `[codent] copy-tree-sitter-grammars OK — ${needed.length} grammars (${(total / 1024 / 1024).toFixed(1)} MB) ` +
    `→ ${join(resolve(pkgRoot), "dist", "tree-sitter")}`
);
