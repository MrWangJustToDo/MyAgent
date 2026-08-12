/**
 * Grep gate: core must not resolve LLM/tool secrets from env bags or CoreEnv.getEnv() digs.
 *
 * Run: pnpm --filter @my-agent/core run validate:core-no-env-config
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");

function rg(pattern, globs) {
  const args = ["-n", "--no-heading", "-e", pattern, src];
  for (const g of globs) {
    args.push("--glob", g);
  }
  try {
    return execFileSync("rg", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (err && typeof err === "object" && "status" in err && err.status === 1) {
      return "";
    }
    throw err;
  }
}

const hits = [
  rg("env\\s*\\?:\\s*Record", ["**/models/**"]),
  rg("parseModelInfoFromEnv", ["**/models/**", "**/index.ts"]),
  rg("MODEL_ENV_KEYS", ["**/models/**", "**/index.ts"]),
  rg("BRAVE_API_KEY", ["**/agent/tools/websearch/**", "**/agent/tools/websearch-tool.ts"]),
  rg("WEBSEARCH_PROVIDER", ["**/agent/tools/websearch/**", "**/agent/tools/websearch-tool.ts"]),
  rg("getEnv\\(\\)\\.getEnv\\(\\)", ["**/agent/tools/websearch/**"]),
  rg("env:\\s*process\\.env", ["**/models/**"]),
]
  .filter(Boolean)
  .join("\n");

assert.equal(hits, "", `core-no-env-config: forbidden patterns found:\n${hits}`);

console.log("core-no-env-config validation passed");
