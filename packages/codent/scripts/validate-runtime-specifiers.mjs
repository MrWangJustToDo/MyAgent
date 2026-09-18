/**
 * Runtime-specifier guard for the bundled release package.
 *
 * `validate:self-contained` proves two things about the published artifact: no
 * `@codent/*` specifier survives into `dist`, and `dependencies` is exactly the
 * four externals. Neither covers the third failure mode — a specifier that is
 * neither inlined nor declared, which resolves fine *inside this monorepo*
 * (where every devDependency is installed) and dies for a real user with
 * `ERR_MODULE_NOT_FOUND` on the code path that reaches it.
 *
 * Pointing the check at "is it declared in `dependencies`" rather than "does it
 * resolve here" is the whole trick: the repo installs `devDependencies`, so
 * resolvability proves nothing about a consumer's install.
 *
 * Only dynamic `import()` / `require()` calls are scanned. That is where a
 * lazy-loaded dependency hides; a static `import` at the top of a chunk is
 * covered structurally by the bundle graph, and the validator's own smoke test
 * (`npm install <tarball> && codent --help`) would fail immediately.
 */
import { readFile, readdir } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(pkgRoot, "dist");

/**
 * Specifiers this scan finds that are **not** real runtime dependencies, with
 * the reason each is inert. Every entry is a string literal that some bundler
 * target emits for code it also bundles: the generator writes a `require("…")`
 * call into *generated source*, so the identifier appears in the artifact
 * without the artifact ever evaluating it.
 *
 * If one of these ever grows a real call site, the entry must be moved to
 * `dependencies` — the point of listing them individually rather than switching
 * the scan off.
 */
const INERT_PATTERNS = new Map([
  ["ajv", 'ajv\'s generated validators emit `require("ajv/dist/runtime/...")` as a codegen template'],
  ["ajv-formats", "same generator; the formats module is a codegen template"],
  ["react-hot-loader", "projen writes these into generated HMR prefix code"],
  ["web-worker", "ELK's layout worker template; also guarded by try/catch around require.resolve"],
]);

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

/** `import("x")` / `require("x")`, matched with a valid npm specifier shape only. */
const SPECIFIER = /[@a-zA-Z][a-zA-Z0-9._@/-]*/;
const PATTERNS = [
  new RegExp(String.raw`\bimport\s*\(\s*["'](${SPECIFIER.source})["']\s*\)`, "g"),
  new RegExp(String.raw`\brequire\s*\(\s*["'](${SPECIFIER.source})["']\s*\)`, "g"),
];

/** Strip block comments so JSDoc `@typedef {import("pkg")}` never reads as a call. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

const packageOf = (specifier) =>
  specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];

/** Walk `dist`, including the nested directories tsdown emits for entry points. */
async function collectBundleFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await collectBundleFiles(full)));
    else if (entry.name.endsWith(".mjs") || entry.name.endsWith(".js")) found.push(full);
  }
  return found;
}

const pkg = JSON.parse(await readFile(join(pkgRoot, "package.json"), "utf8"));
const declared = new Set(Object.keys(pkg.dependencies ?? {}));

const files = await collectBundleFiles(distDir);
if (files.length === 0) {
  console.error(
    `[codent] validate:runtime-specifiers FAILED\n  - no bundle output in ${distDir} — run "pnpm build" first`
  );
  process.exit(1);
}

const seen = new Map(); // package -> Set(relative file)
for (const file of files) {
  const text = stripComments(await readFile(file, "utf8"));
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier.startsWith(".") || specifier.startsWith("/") || BUILTINS.has(specifier)) continue;

      const name = packageOf(specifier);
      if (declared.has(name) || INERT_PATTERNS.has(name)) continue;

      if (!seen.has(name)) seen.set(name, new Set());
      seen.get(name).add(file.slice(pkgRoot.length + 1));
    }
  }
}

if (seen.size > 0) {
  console.error("[codent] validate:runtime-specifiers FAILED\n");
  for (const [name, where] of seen) {
    console.error(`  - "${name}" is neither inlined nor declared in dependencies`);
    console.error(`      reached from: ${[...where].slice(0, 3).join(", ")}`);
  }
  console.error(
    "\nA consumer installs `dependencies` only, so this specifier would throw ERR_MODULE_NOT_FOUND.\n" +
      "Either inline it (tsdown `alwaysBundle`), declare it, or add it to INERT_PATTERNS with a reason."
  );
  process.exit(1);
}

console.log(
  `[codent] validate:runtime-specifiers OK — ${files.length} bundle files, ` +
    `${declared.size} declared externals, ${INERT_PATTERNS.size} inert codegen patterns allowlisted`
);
