/**
 * Grep gate: `packages/core/src/agent/**` must not import `managers/`.
 *
 * Shared types/host surfaces live under `src/runtime-types/`.
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-managers-boundary
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const agentRoot = join(scriptDir, "../src/agent");

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
for (const file of walkTsFiles(agentRoot)) {
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
  console.error("agent→managers boundary violated:");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  imports "${v.specifier}"`);
  }
  console.error("\nDomain modules must import shared types from src/runtime-types/ instead.");
  process.exit(1);
}

console.log("agent→managers boundary validation passed (0 imports)");
