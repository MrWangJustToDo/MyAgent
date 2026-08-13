/**
 * Ensures initConfig-style optional field copy keeps toolConfig / agentRemote.
 *
 * Run: node packages/app/test/apply-app-config.test.mjs
 */
import assert from "node:assert/strict";

import { applyOptionalAppConfig, clearOptionalAppConfig } from "../dist/utils/apply-app-config.mjs";

const target = {
  model: "m",
  style: "openai",
  baseURL: "http://localhost",
  apiKey: "",
  systemPrompt: "",
  initialPrompt: "",
  maxIterations: 50,
  debug: false,
  mcpConfigPath: "",
  extensionDirs: [],
  continueSession: false,
  resumeSession: "",
};

applyOptionalAppConfig(target, {
  toolConfig: { websearch: { braveApiKey: "sk-brave", provider: "brave" } },
  agentRemote: "http://localhost:3100",
  providerMode: "direct",
  modelInfo: { id: "m" },
});

assert.equal(target.toolConfig?.websearch?.braveApiKey, "sk-brave");
assert.equal(target.toolConfig?.websearch?.provider, "brave");
assert.equal(target.agentRemote, "http://localhost:3100");
assert.equal(target.providerMode, "direct");
assert.equal(target.modelInfo?.id, "m");

clearOptionalAppConfig(target);
assert.equal(target.toolConfig, undefined);
assert.equal(target.agentRemote, undefined);
assert.equal(target.providerMode, undefined);
assert.equal(target.modelInfo, undefined);

applyOptionalAppConfig(target, {});
assert.equal(target.toolConfig, undefined);
assert.equal(target.agentRemote, undefined);

console.log("apply-app-config: ok");
