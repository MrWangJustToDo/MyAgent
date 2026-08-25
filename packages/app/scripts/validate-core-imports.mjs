/**
 * Fail if @my-agent/app UI code imports forbidden @my-agent/core runtime APIs.
 *
 * Run: pnpm --filter @my-agent/app run validate:core-imports
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(scriptDir, "../src");

/**
 * Runtime singletons / stateful classes stay forbidden — the host process owns
 * them. Pure resolvers (`resolveModelConfigFromProvider`,
 * `buildDefaultSystemPrompt`) are allowed: no runtime state crosses the seam.
 */
const FORBIDDEN_IDENTIFIERS = [
  "agentManager",
  "AgentManager",
  "ManagedAgent",
  "createManagedAgent",
  "createLocalAgentSessionHost",
  "SessionStore",
  "TodoManager",
  "AgentLog",
  "autoCompact",
  "applyCompactionResult",
  "runSideTextQuery",
  "resolveTextAdapterForManaged",
  "ExtensionRunner",
  "ExtensionLoader",
];

const CORE_IMPORT_RE =
  /(?:import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+|import\s*\(\s*)["']@my-agent\/core(?:\/[^"']*)?["']/;

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

function extractNamedImports(line) {
  const brace = line.match(/\{([^}]*)\}/);
  if (!brace) return [];
  return brace[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name] = part.split(/\s+as\s+/);
      return name.replace(/^type\s+/, "").trim();
    })
    .filter(Boolean);
}

const violations = [];
for (const file of walkTsFiles(srcRoot)) {
  const rel = relative(srcRoot, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!CORE_IMPORT_RE.test(line) && !line.includes("@my-agent/core")) continue;
    // Multi-line import: check following lines until from "@my-agent/core"
    let block = line;
    if (line.includes("import") && line.includes("{") && !line.includes("}")) {
      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        block += "\n" + lines[j];
        if (lines[j].includes("}")) break;
      }
    }
    if (!block.includes("@my-agent/core")) continue;

    const names = extractNamedImports(block);
    for (const name of names) {
      if (!FORBIDDEN_IDENTIFIERS.includes(name)) continue;
      if (
        name === "agentManager" ||
        name === "buildDefaultSystemPrompt" ||
        name === "createLocalAgentSessionHost" ||
        name === "resolveModelConfigFromProvider"
      ) {
        continue;
      }
      violations.push({ file: rel, line: i + 1, name });
    }
  }
}

if (violations.length > 0) {
  console.error("@my-agent/app forbidden @my-agent/core imports:");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  imports "${v.name}"`);
  }
  console.error("\nSee packages/app/README.md allowlist. Prefer AgentSession.dispatch / Host APIs.");
  process.exit(1);
}

console.log("app core-imports validation passed (0 forbidden)");
