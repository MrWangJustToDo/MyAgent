/* global process */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../src/theme");

function exportKeys(fileName, constName) {
  const src = readFileSync(join(root, fileName), "utf8");
  const match = src.match(new RegExp(`export const ${constName} = \\{([\\s\\S]*?)\\n\\} as const;`));
  assert.ok(match, `missing ${constName} in ${fileName}`);
  return [...match[1].matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort();
}

for (const name of ["COLORS", "BG", "GRADIENT"]) {
  assert.deepEqual(exportKeys("colors-claude.ts", name), exportKeys("colors-gemini.ts", name), name);
}

process.stdout.write("validate-theme-palettes: ok\n");
