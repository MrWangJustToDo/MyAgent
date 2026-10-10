/**
 * Module-organization gate.
 *
 * Three rules from `AGENTS.md` ("Core Naming Conventions") were honoured by hand and had
 * silently drifted, because nothing read the tree:
 *
 * 1. **A module name states its responsibility.** The placeholder list is small and
 *    deliberate (`helpers.ts` / `misc.ts` / `utils.ts` / `common.ts` / `shared.ts`).
 *    `tools/util/helpers.ts` was the one that had slipped through.
 * 2. **A domain directory exposes `index.ts`, and its barrel is consumed.** A barrel that
 *    nothing imports is dead weight that reads as an API; `managers/index.ts` and
 *    `managers/stream-recovery/index.ts` were both exactly that.
 * 3. **A public symbol has one definition.** Two `isToolCallPart` copies (one `null`-safe,
 *    one not) and two different `TaskRunPhase` unions under one name is the failure this
 *    catches — a duplicate that compiles is one whose behaviour quietly diverges.
 *
 * Rule 3 is checked for a curated watch-list rather than every symbol: a *deliberate*
 * re-export (`export { x } from "./y.js"`) is the barrel pattern these rules encourage, so
 * a blanket scan would flag the design. The list names the symbols where two independent
 * definitions would be a bug; add to it when a duplicate is found, as one was for
 * `isToolCallPart`.
 *
 * Run: pnpm --filter @codent/core run validate:module-organization
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(scriptDir, "../src");

let failures = 0;
function check(label, fn) {
  const problems = fn();
  if (problems.length === 0) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += problems.length;
  console.log(`  FAIL ${label}`);
  for (const problem of problems) console.log(`         ${problem}`);
}

// ============================================================================
// Tree helpers
// ============================================================================

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

/** Every `.ts` file under `src/`, excluding generated trees. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const files = walk(srcRoot);
const rel = (file) => relative(srcRoot, file).split("\\").join("/");

// ============================================================================
// Rule 1 — module names state their responsibility
// ============================================================================

/**
 * Names that say nothing about what the module does. `types.ts` is deliberately absent:
 * a single-purpose type module in a domain directory *does* state its responsibility, and
 * there are ~15 of them by design. `index.ts` is the barrel convention.
 */
const PLACEHOLDER_NAMES = new Set(["helpers.ts", "misc.ts", "utils.ts", "common.ts", "shared.ts"]);

check("no placeholder module names", () => {
  return files
    .filter((file) => PLACEHOLDER_NAMES.has(file.slice(file.lastIndexOf("/") + 1)))
    .map((file) => `${rel(file)} — rename it after the responsibility it holds (see AGENTS.md "Files")`);
});

// ============================================================================
// Rule 2 — a barrel that exists is consumed
// ============================================================================
//
// Deliberately *not* "every domain directory exposes index.ts". AGENTS.md says the opposite
// for the domain tree: "The top-level `src/agent/` namespace is intentionally barrel-free —
// cross-domain imports use direct module paths there." A rule that requires a barrel
// everywhere contradicts that policy and would have flagged a documented decision. What is
// worth catching is the other half: an aggregation file that nothing imports. It reads as
// an API, so its exports look supported while being unreachable by any consumer — dead
// weight with a misleading shape. (`agent/compaction/index.ts` and
// `agent/persistence/index.ts`, by contrast, are consumed from `managers/` and stay.)

/**
 * A barrel is "consumed" when some other module imports the *directory* it backs — i.e. a
 * relative specifier that resolves to the barrel's directory (`"./foo"`, `"../foo"`), not a
 * deep path inside it (`"./foo/bar.js"`).
 *
 * Resolution is done on the real path rather than by string-matching the specifier: matching
 * text alone flags a barrel whenever a same-named directory appears at any depth.
 */
check("every barrel is imported as a directory (no dead barrels)", () => {
  const problems = [];
  // The package entry (`src/index.ts`) is the published surface, not an internal barrel.
  const barrels = files.filter((file) => file.endsWith("/index.ts") && file !== join(srcRoot, "index.ts"));

  const SPECIFIER = /from\s+"([^"]+)"/g;

  for (const barrel of barrels) {
    const targetDir = dirname(barrel);

    const consumed = files.some((file) => {
      if (file === barrel) return false;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(SPECIFIER)) {
        const specifier = match[1];
        if (!specifier.startsWith(".")) continue;
        // Resolve the specifier the way the bundler would: relative to the importer. A
        // directory specifier (`"./foo"`) resolves to the barrel's directory; strip an
        // emitted `.js`/`.ts` so a deep path maps back to its source file.
        const bare = specifier.replace(/\.(js|ts)$/, "");
        const resolved = join(dirname(file), bare);
        if (resolved === targetDir || resolved === barrel.replace(/\.ts$/, "")) return true;
      }
      return false;
    });

    if (!consumed) {
      problems.push(`${rel(barrel)} — nothing imports its directory; delete the barrel or point consumers at it`);
    }
  }

  return problems;
});

// ============================================================================
// Rule 3 — watched public symbols have one definition
// ============================================================================

/**
 * Symbols where two independent definitions would be a bug (not a re-export). The check
 * counts *definitions*, so `export { x } from "./y.js"` is transparent and only real
 * `export function x` / `export type x = …` bodies count.
 */
const SINGLE_DEFINITION_SYMBOLS = ["isToolCallPart", "TaskRunPhase"];

function countDefinitions(symbol) {
  const defining = [
    new RegExp(`^export\\s+(async\\s+)?function\\s+${symbol}\\b`, "m"),
    new RegExp(`^export\\s+(const|class|interface|type)\\s+${symbol}\\b`, "m"),
  ];
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (defining.some((pattern) => pattern.test(text))) hits.push(rel(file));
  }
  return hits;
}

check("watched public symbols have a single definition", () => {
  const problems = [];
  for (const symbol of SINGLE_DEFINITION_SYMBOLS) {
    const definitions = countDefinitions(symbol);
    if (definitions.length > 1) {
      problems.push(
        `${symbol} — defined in ${definitions.length} modules (${definitions.join(", ")}); keep one and re-export it`
      );
    }
  }
  return problems;
});

// ============================================================================

if (failures > 0) {
  console.log(`\nmodule-organization validation FAILED (${failures} problem(s))`);
  process.exit(1);
}
console.log("\nmodule-organization validation passed");
