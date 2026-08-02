/**
 * Grep gate: `packages/core/src/models/**` must not import `managers/`.
 *
 * Prompt-cache ownership and side-text helpers live under models/runtime-types.
 *
 * Run: pnpm --filter @my-agent/core run validate:models-managers-boundary
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const modelsRoot = join(scriptDir, "../src/models");

/** Matches ESM/CJS-style imports whose specifier path includes `/managers/`. */
const MANAGERS_IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']*\/managers\/[^"']*)["']/;

function walkTsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
for (const file of walkTsFiles(modelsRoot)) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = MANAGERS_IMPORT_RE.exec(line);
    if (match) {
      violations.push({
        file: relative(join(scriptDir, ".."), file),
        line: i + 1,
        specifier: match[1],
      });
    }
  }
}

if (violations.length > 0) {
  console.error("models→managers boundary violated:");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  imports "${v.specifier}"`);
  }
  console.error("\nModels must not import managers/; use runtime-types or local models helpers.");
  process.exit(1);
}

console.log("models→managers boundary validation passed (0 imports)");
