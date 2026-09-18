/**
 * Self-containment guard for the fully bundled release build.
 *
 * The whole point of `codent` is that its tarball installs on its own: no
 * `@codent/*` sibling on the registry, and no workspace package in the
 * published dependency graph. That property is invisible at build time —
 * tsdown happily leaves a bare specifier in the output and the build still
 * succeeds — so it needs its own assertion. Three checks:
 *
 *   1. `dist/index.mjs` and every emitted chunk reference no `@codent/*`
 *      specifier (static `from` or dynamic `import()`). Comments are stripped
 *      first: core/node ship dozens of JSDoc examples that quote
 *      `from "@codent/core"` and would otherwise read as false positives.
 *   2. `dependencies` is exactly the external allowlist. Each one is an import
 *      the emitted bundle still makes, so omitting it ships a package that
 *      crashes with ERR_MODULE_NOT_FOUND on the user's first invocation
 *      (verified by installing the tarball into an empty project).
 *   3. No `@codent/*` workspace package is declared as a dependency — those
 *      are build inputs, and publishing one would defeat the point.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(pkgRoot, "dist");

/**
 * Packages that may stay external: the single-copy renderer, plus the packages
 * that read assets through their own on-disk layout (`import.meta.url` /
 * `require.resolve`). Everything else is inlined by tsdown.
 */
const ALLOWED_EXTERNALS = [
  "@my-react/react",
  "@my-react/react-terminal",
  "@anthropic-ai/sandbox-runtime",
  "web-tree-sitter",
];

const failures = [];

// ============================================================================
// package.json shape
// ============================================================================

const pkg = JSON.parse(await readFile(join(pkgRoot, "package.json"), "utf8"));
const dependencies = Object.keys(pkg.dependencies ?? {});

for (const name of ALLOWED_EXTERNALS) {
  if (!dependencies.includes(name)) {
    failures.push(`external "${name}" is missing from dependencies — npm would not install it`);
  }
}
for (const name of dependencies) {
  if (!ALLOWED_EXTERNALS.includes(name)) {
    failures.push(`runtime dependency "${name}" is not in the external allowlist — inline it instead`);
  }
  if (name.startsWith("@codent/")) {
    failures.push(`workspace package "${name}" must not be published as a dependency`);
  }
}

// ============================================================================
// dist has no @codent/* specifier left
// ============================================================================

/** Strip block and line comments so JSDoc examples are not read as imports. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// `from "@codent/app"` / `import("@codent/server/client")`. The `[^"']`
// body plus the `@codent/` prefix keeps relative chunk imports out.
const SPECIFIER_PATTERN = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](@codent\/[^"']*)["']/g;

const entries = await readdir(distDir);
const jsFiles = entries.filter((name) => name.endsWith(".mjs") || name.endsWith(".js"));

if (jsFiles.length === 0) {
  failures.push(`no JS output found in ${distDir} — run "pnpm build" first`);
}

const found = new Map();
for (const file of jsFiles) {
  const text = stripComments(await readFile(join(distDir, file), "utf8"));
  for (const match of text.matchAll(SPECIFIER_PATTERN)) {
    const specifier = match[1];
    if (!found.has(specifier)) found.set(specifier, new Set());
    found.get(specifier).add(file);
  }
}

for (const [specifier, files] of found) {
  failures.push(`bare specifier "${specifier}" left in ${[...files].slice(0, 3).join(", ")}`);
}

// ============================================================================
// Report
// ============================================================================

if (failures.length > 0) {
  console.error("[codent] validate:self-contained FAILED\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("\nThe published package would not be self-contained.");
  process.exit(1);
}

const maps = entries.filter((name) => name.endsWith(".map"));
console.log(
  `[codent] validate:self-contained OK — ${jsFiles.length} JS files (${maps.length} maps), ` +
    `0 @codent/* specifiers, ${dependencies.length} externals declared`
);
