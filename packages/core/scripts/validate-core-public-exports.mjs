/**
 * Fail if forbidden symbols appear on the published `@my-agent/core` entry.
 *
 * Run: pnpm --filter @my-agent/core run validate:core-public-exports
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "dist/index.mjs");

const DENY = [
  "AgentLog",
  "TodoManager",
  "SessionStore",
  "AgentChatController",
  "autoCompact",
  "applyCompactionResult",
  "buildCanonicalModelMessages",
  "estimateTokens",
  "runSideTextQuery",
  "resolveTextAdapterForManaged",
  "ExtensionRunner",
  "ExtensionLoader",
  "getDefaultExtensionDirs",
  "DEFAULT_EXTENSION_DIR",
  "formatCompactionSummaryContent",
  "extractCompactionSummaryBody",
  "CONVERSATION_SUMMARY_START",
  "CONVERSATION_SUMMARY_END",
];

const mod = await import(indexPath);
const leaked = DENY.filter((name) => name in mod);

assert.equal(leaked.length, 0, `Forbidden public exports found: ${leaked.join(", ")}`);

for (const name of [
  "agentManager",
  "createLocalAgentSessionHost",
  "createRemoteProvider",
  "REMOTE_PROVIDER_API_KEY",
  "resolveModelConfigFromProvider",
  "buildDefaultSystemPrompt",
  "isActiveStatus",
  "getToUI",
  "previewEdit",
  "generateId",
]) {
  assert.ok(name in mod, `Expected public export missing: ${name}`);
}

console.log("core-public-exports validation passed");
