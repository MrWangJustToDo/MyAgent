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
 * `optionalDependencies` counts as declared. A native module cannot be inlined,
 * so it lives there deliberately: npm installs it when the platform has a
 * prebuilt binding and silently skips it otherwise, which is exactly the
 * degrade-not-crash behaviour the host wants. `validate:self-contained` keeps
 * those out of `dependencies` on purpose (they must not be required), so
 * ignoring the field here would report every one of them as undeclared.
 *
 * What this scan cannot see: a native addon resolved by *path* rather than by
 * package name. `node-gyp-build` does `require(path.join(__dirname, …))`, so a
 * bundle that inlines it leaves no bare specifier behind — `isolated-vm`
 * (code-mode) is exactly that case and is invisible to this check. Those are
 * covered by the external allowlist plus the install-and-run smoke test.
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
  [
    "@img/sharp-libvips-dev",
    "sharp's *build-time* helper (buildSharpLibvipsIncludeDir / ...LibDir) probing a dev-only " +
      'package for C headers and libs; every call sits in try/catch and falls back to "". sharp ' +
      "itself is inlined, and the `-dev` packages are not runnable, so this must stay inert rather " +
      "than become a dependency",
  ],
  [
    "@img/sharp-libvips",
    "the second fallback inside that same helper (buildSharpLibvipsLibDir tries `-dev-<arch>` " +
      'then `<arch>`, both in try/catch, returning ""). The prebuilt runtime path never calls it',
  ],
]);

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

/**
 * `import("x")` / `require("x")`, matched with a valid npm specifier shape only.
 *
 * The identifier before `require` is deliberately `\w*` rather than a word
 * boundary. A bundler cannot statically follow every call, so it emits a helper
 * for the ones it cannot — tsdown and esbuild both write `__require("pkg")` —
 * and `\brequire` does **not** match `__require`: `_` is a word character, so
 * there is no word boundary in front of it. That blind spot hid all 53
 * specifiers of `@crosscopy/clipboard`'s platform bindings in a single chunk —
 * precisely the failure this guard exists to catch — while reporting the
 * artifact clean.
 *
 * `\w*require` alone still misses rolldown's *per-file* rename. When the same
 * module ends up inlined more than once, rolldown disambiguates the helpers by
 * appending `$n` to the identifier itself — `require$1("pkg")`,
 * `require$2("pkg")`. `$` is a valid identifier character, so the whole thing
 * is one identifier; `\b\w*require` matches the `require` part and then expects
 * whitespace or `(`, but finds `$`, and the call goes unseen. That is how
 * sharp's twenty-plus `@img/sharp-*` bindings got through: every one of them is
 * reached only via a `require$2` template, so the gate called the artifact clean
 * while image resizing was broken for every consumer.
 *
 * The second pattern covers the other statically-unreachable shape,
 * `` __require(`pkg-${expr}`) ``, where only the literal prefix before the
 * interpolation is visible. The prefix is trimmed of its trailing separator so
 * it can still be allowlisted by the package it is being built for.
 */
const SPECIFIER = /[@a-zA-Z][a-zA-Z0-9._@/-]*/;
const REQUIRE_HELPER = String.raw`\b\w*require(?:\$\d+)?`;
const PATTERNS = [
  {
    re: new RegExp(String.raw`\bimport\s*\(\s*["'](${SPECIFIER.source})["']\s*\)`, "g"),
    template: false,
  },
  {
    re: new RegExp(`${REQUIRE_HELPER}\\s*\\(\\s*["'](${SPECIFIER.source})["']\\s*\\)`, "g"),
    template: false,
  },
  {
    // A template `require`; the opening backtick is written as `\x60` so this
    // line needs no backtick of its own.
    re: new RegExp(`${REQUIRE_HELPER}\\s*\\(\\s*\\x60(${SPECIFIER.source})`, "g"),
    template: true,
  },
];

/** Strip block comments so JSDoc `@typedef {import("pkg")}` never reads as a call. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

/** `` `pkg-${expr}` `` leaves a trailing separator on the prefix; drop it to allowlist by package. */
const trimPartialSpecifier = (specifier) => specifier.replace(/[-/]+$/, "");

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
// `optionalDependencies` is a real install target, so it satisfies the check as
// much as `dependencies` does — see the header note on native modules.
const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})]);

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
  for (const { re, template } of PATTERNS) {
    for (const match of text.matchAll(re)) {
      const specifier = template ? trimPartialSpecifier(match[1]) : match[1];
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
    console.error(`  - "${name}" is neither inlined nor declared in dependencies/optionalDependencies`);
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
    `${declared.size} declared externals (incl. optional), ${INERT_PATTERNS.size} inert codegen patterns allowlisted`
);
