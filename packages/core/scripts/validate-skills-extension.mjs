/**
 * Validation for the built-in Skills extension (`my-agent-skills`).
 *
 * Covers:
 * - SkillRegistry loads SKILL.md files from `.agents/skills` (progressive disclosure)
 * - createSkillsExtension / skillsExtension are exported and produce an extension API
 * - activation registers list_skills / load_skill tools (ExtensionToolDefinition)
 * - activation registers a turn-context provider that emits the <skills> index
 * - skillsExtension config can disable tools / index independently
 * - ManagedAgentConfig.skills accepts boolean | SkillsExtensionConfig (typecheck)
 *
 * Run: pnpm --filter @my-agent/core run validate:skills-extension
 */

import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerCoreEnv, SkillRegistry, createSkillsExtension, skillsExtension } from "../dist/dev.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));

// SkillLoader uses the global CoreEnv (getEnv()) for fs/path/homedir — register a
// node-backed environment rooted at the package dir so .agents/skills resolves.
registerCoreEnv({
  rootPath: root,
  getPlatform: async () => "linux",
  getArch: async () => "arm64",
  getEnv: async () => ({}),
  homedir: async () => root,
  path,
  fs: {
    readFile: async (p) => readFile(p, "utf-8"),
    writeFile: async () => {},
    mkdir: async () => {},
    exists: async () => false,
    readdir: async (p) =>
      (await readdir(p, { withFileTypes: true })).map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : "file",
      })),
    stat: async (p) => {
      const s = await stat(p);
      return { isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size, mtime: s.mtime };
    },
    remove: async () => {},
  },
});

// ---------------------------------------------------------------------------
// 1. SkillRegistry loads real SKILL.md content from .agents/skills
// ---------------------------------------------------------------------------
const registry = new SkillRegistry({ rootPath: root });
await registry.loadFromDirectories([path.join(root, ".agents", "skills")]);
assert.ok(registry.size >= 1, `SkillRegistry loaded at least 1 skill (got ${registry.size})`);

const summaries = registry.list();
for (const s of summaries) {
  assert.equal(typeof s.name, "string", `skill name is string: ${s.name}`);
  assert.equal(typeof s.description, "string", `skill description is string: ${s.name}`);
}

// Loading a skill body returns wrapped <skill> content.
const first = summaries[0];
const loaded = registry.get(first.name);
assert.ok(loaded, `registry.get(${first.name}) resolves`);
assert.ok(loaded.body.length > 0, "skill body is non-empty");

// ---------------------------------------------------------------------------
// 2. Extension factory shape
// ---------------------------------------------------------------------------
const api = createSkillsExtension({ skillRegistry: registry });
assert.equal(api.id, "my-agent-skills", "extension id is my-agent-skills");
assert.equal(typeof api.activate, "function", "extension has activate");

const apiFromFactory = skillsExtension({ skillRegistry: registry });
assert.equal(apiFromFactory.id, "my-agent-skills", "skillsExtension factory id is my-agent-skills");

// ---------------------------------------------------------------------------
// 3. Activation registers tools + turn-context provider
// ---------------------------------------------------------------------------
const registeredTools = [];
let turnContextProvider = null;

const mockCtx = {
  z: (await import("zod")).z,
  registerTool: (def) => registeredTools.push(def),
  registerCommand: () => {},
  registerInterceptor: () => () => {},
  registerTurnContextProvider: (fn) => {
    turnContextProvider = fn;
    return () => {};
  },
  logger: { info: () => {}, warn: () => {}, error: () => {} },
};

await api.activate(mockCtx);

const toolNames = registeredTools.map((t) => t.name);
assert.ok(toolNames.includes("list_skills"), "registers list_skills");
assert.ok(toolNames.includes("load_skill"), "registers load_skill");

assert.ok(turnContextProvider, "registers a turn-context provider");
const index = await turnContextProvider();
assert.ok(index.includes("<skills>"), "turn-context index wraps <skills>");
assert.ok(index.includes(first.name), `turn-context index lists ${first.name}`);

// list_skills executes and returns summaries.
const listTool = registeredTools.find((t) => t.name === "list_skills");
const listResult = await listTool.execute({}, { toolCallId: "t1" });
assert.equal(listResult.count, registry.size, "list_skills returns correct count");

// load_skill executes and returns wrapped content.
const loadTool = registeredTools.find((t) => t.name === "load_skill");
const loadResult = await loadTool.execute({ name: first.name }, { toolCallId: "t2" });
assert.ok(loadResult.content.includes("<skill"), "load_skill wraps content in <skill> tags");
assert.ok(loadResult.content.includes(first.name), "load_skill content includes skill name");

// Unknown skill throws a helpful error.
await assert.rejects(() => loadTool.execute({ name: "does-not-exist" }, { toolCallId: "t3" }), /Unknown skill/);

// ---------------------------------------------------------------------------
// 4. Config semantics
// ---------------------------------------------------------------------------
const toolsOnlyApi = createSkillsExtension({ skillRegistry: registry, config: { indexDisabled: true } });
let toolsOnlyProvider = null;
const toolsOnlyTools = [];
await toolsOnlyApi.activate({
  z: (await import("zod")).z,
  registerTool: (def) => toolsOnlyTools.push(def),
  registerCommand: () => {},
  registerInterceptor: () => () => {},
  registerTurnContextProvider: (fn) => {
    toolsOnlyProvider = fn;
  },
  logger: { info: () => {}, warn: () => {}, error: () => {} },
});
assert.ok(
  toolsOnlyTools.some((t) => t.name === "list_skills"),
  "indexDisabled still registers tools"
);
assert.equal(toolsOnlyProvider, null, "indexDisabled removes turn-context provider");

const indexOnlyApi = createSkillsExtension({ skillRegistry: registry, config: { toolsDisabled: true } });
const indexOnlyTools = [];
await indexOnlyApi.activate({
  z: (await import("zod")).z,
  registerTool: (def) => indexOnlyTools.push(def),
  registerCommand: () => {},
  registerInterceptor: () => () => {},
  registerTurnContextProvider: () => () => {},
  logger: { info: () => {}, warn: () => {}, error: () => {} },
});
assert.equal(indexOnlyTools.length, 0, "toolsDisabled removes both tools");

console.log("skills-extension validation passed");
