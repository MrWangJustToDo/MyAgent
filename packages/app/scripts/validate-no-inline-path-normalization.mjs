/**
 * Fail when a source module spells the backslash-to-forward-slash substitution out instead of
 * calling the shared rule.
 *
 * This exists because the previous fixes were correct and did not hold. The substitution was
 * written at seventeen call sites; two of them had already wrapped it in a private helper, two
 * more cited their neighbours in comments, and a fourth consumer of git output was written by
 * copying the pattern — which is how a third instance of the same defect shipped. A comment is
 * not a compile error, so the count grows back silently.
 *
 * Scans `packages/*\/src` for the literal substitution and reports every file but the one that
 * defines it. Scanned rather than enforced by types because the point is the *text*: a caller
 * re-deriving the regex is the failure, whether or not its result happens to agree today.
 */
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(here, "../..");

/** The one module allowed to contain the substitution, relative to `packages/`. */
const DEFINITION = "core/src/utils/posix-path.ts";

/**
 * A backslash-to-slash substitution, in the shapes it is actually written in.
 *
 * Matches `replace(/\\/g, "/")` and the same call spelled with a single-quoted replacement or
 * an escaped forward slash. Deliberately tight: matching any `replace` would flag unrelated
 * code and the check would be disabled rather than fixed.
 */
export const INLINE_SUBSTITUTION = /\.replace\(\s*\/\\{1,2}\/g\s*,\s*["']\/["']\s*\)/;

/**
 * Whether a path relative to `packages/`, in **either** separator flavour, is the definition.
 *
 * Takes the raw output of `relative()` and normalizes it here rather than at the call site,
 * because that is the decision this validator got wrong the first time: on Windows `relative()`
 * returns `core\src\utils\posix-path.ts`, the unnormalized compare missed, and the check
 * reported the one module that is *supposed* to contain the substitution — failing on exactly
 * the rule it exists to enforce.
 *
 * Exported as a pure function so the Windows shape is assertable from Linux, which is the same
 * approach `validate-path-portability.mjs` takes: a platform branch nobody can exercise is a
 * branch that rots, and this one rotted before it ever shipped.
 */
export function isDefinitionFile(rawRelativePath) {
  return rawRelativePath.replaceAll("\\", "/") === DEFINITION;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function scan() {
  const offenders = [];
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const src = join(packagesDir, pkg.name, "src");
    let files;
    try {
      files = walk(src);
    } catch {
      continue; // no src/ — not a source package
    }
    for (const file of files) {
      const rel = relative(packagesDir, file);
      if (isDefinitionFile(rel)) continue;
      const text = readFileSync(file, "utf8");
      text.split("\n").forEach((line, i) => {
        if (INLINE_SUBSTITUTION.test(line))
          offenders.push({ rel: rel.replaceAll("\\", "/"), line: i + 1, text: line.trim() });
      });
    }
  }
  return offenders;
}

/**
 * Run only when executed directly, so a test can import the decision above without this module
 * scanning the tree and exiting mid-suite.
 */
function isRunDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

if (isRunDirectly()) {
  const offenders = scan();

  if (offenders.length > 0) {
    process.stderr.write("Inline path normalization — call toPosixPath / toPosixPathKey from @codent/core instead:\n");
    for (const o of offenders) {
      process.stderr.write(`  ${o.rel}:${o.line}\n      ${o.text}\n`);
    }
    process.stderr.write(
      `\nThe rule is defined once in packages/${DEFINITION}. Re-deriving it is how three consumers\n` +
        "of git output each shipped the same defect.\n"
    );
    process.exit(1);
  }

  process.stdout.write("validate-no-inline-path-normalization: ok\n");
}
