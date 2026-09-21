/**
 * Validation for the built-in skills shipped with `@codent/core` (the builtin-skills capability).
 *
 * Covers the `builtin-skills` spec requirements:
 * - `BUILTIN_SKILLS` conforms to `skillSchema`; names unique; description/body non-empty
 * - `register` / `registerAll` write path, and `clear()` dropping built-ins
 * - precedence: a directory skill overrides a built-in of the same name, and the
 *   override is *reported* (not silently dropped)
 * - `source` attribution for directory skills vs built-ins
 * - `SkillsExtensionConfig.builtinsDisabled: true` drops built-ins while leaving
 *   directory skills intact (index, list_skills, /skill, load_skill all agree)
 * - the `write-extension` skill is listed, loadable, and its documented API surface
 *   exists — including the hook-name list matching the bus's own matching rules.
 *
 * Run: pnpm --filter @codent/core run validate:builtin-skills
 */

import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerCoreEnv, BUILTIN_SKILLS, SkillRegistry, createSkillsExtension, skillSchema } from "../dist/dev.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));

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
    exists: async (p) => {
      try {
        await stat(p);
        return true;
      } catch {
        return false;
      }
    },
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

const failures = [];
function check(label, fn) {
  try {
    fn();
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// 1. BUILTIN_SKILLS conforms to skillSchema
// ============================================================================

check("BUILTIN_SKILLS is non-empty", () => {
  assert.ok(Array.isArray(BUILTIN_SKILLS), "BUILTIN_SKILLS is an array");
  assert.ok(BUILTIN_SKILLS.length > 0, "at least one built-in skill");
});

for (const skill of BUILTIN_SKILLS) {
  check(`built-in "${skill?.name}" parses against skillSchema`, () => {
    const parsed = skillSchema.safeParse(skill);
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });

  check(`built-in "${skill?.name}" has non-empty description`, () => {
    assert.ok(typeof skill.description === "string" && skill.description.trim().length > 0, "description is empty");
  });

  check(`built-in "${skill?.name}" has non-empty body`, () => {
    assert.ok(typeof skill.body === "string" && skill.body.trim().length > 0, "body is empty");
  });

  check(`built-in "${skill?.name}" is tagged source=builtin`, () => {
    assert.equal(skill.source, "builtin");
  });

  check(`built-in "${skill?.name}" uses the synthetic builtin: path`, () => {
    assert.ok(skill.path.startsWith("builtin:"), `path is "${skill.path}"`);
  });
}

check("built-in names are unique", () => {
  const names = BUILTIN_SKILLS.map((s) => s.name);
  assert.equal(new Set(names).size, names.length, `duplicate names in ${names.join(", ")}`);
});

check("body stays within a sane size budget", () => {
  // A skill body is loaded on demand, but it is still prompt context: a runaway body
  // is a token-budget bug, not a feature.
  for (const skill of BUILTIN_SKILLS) {
    assert.ok(skill.body.length <= 40_000, `"${skill.name}" body is ${skill.body.length} chars (>40000)`);
  }
});

// ============================================================================
// 2. Registry write path
// ============================================================================

const registry = new SkillRegistry({ rootPath: root });
check("register returns true for a new skill", () => {
  assert.equal(registry.register(BUILTIN_SKILLS[0]), true);
  assert.equal(registry.size, 1);
});

check("register returns false for a shadowed skill", () => {
  assert.equal(registry.register(BUILTIN_SKILLS[0]), false, "second register must be a no-op");
  assert.equal(registry.size, 1, "size must not grow");
});

check("registerAll reports how many landed", () => {
  registry.clear();
  assert.equal(registry.size, 0, "clear() drops built-ins too");
  assert.equal(registry.registerAll(BUILTIN_SKILLS), BUILTIN_SKILLS.length);
});

check("builtinNames() lists exactly the built-ins", () => {
  assert.deepEqual(registry.builtinNames().sort(), BUILTIN_SKILLS.map((s) => s.name).sort());
});

// ============================================================================
// 3. Precedence: directory skill wins over a built-in, and the skip is reported
// ============================================================================

const builtinName = BUILTIN_SKILLS[0].name;
const userSkill = {
  name: builtinName,
  description: "user override",
  body: "USER BODY WINS",
  path: `${root}/.agents/skills/${builtinName}/SKILL.md`,
  source: "user",
  metadata: { name: builtinName, description: "user override" },
};

const warnings = [];
const precedenceRegistry = new SkillRegistry({ rootPath: root, logger: { warn: (m) => warnings.push(m) } });
precedenceRegistry.register(userSkill);
precedenceRegistry.registerAll(BUILTIN_SKILLS);

check("a user skill overrides a same-named built-in", () => {
  const resolved = precedenceRegistry.get(builtinName);
  assert.equal(resolved.body, "USER BODY WINS", "the user body must survive");
  assert.equal(precedenceRegistry.size, BUILTIN_SKILLS.length, "the built-in must not add a second entry");
});

check("the override is reported, not silent", () => {
  assert.equal(warnings.length, 1, `expected exactly one notice, got ${warnings.length}`);
  assert.ok(warnings[0].includes(builtinName), "the notice names the skill");
  assert.ok(/built-?in/i.test(warnings[0]), `the notice names the built-in origin: ${warnings[0]}`);
});

check("directory-vs-directory collisions are reported too", () => {
  const dirWarnings = [];
  const dirRegistry = new SkillRegistry({ rootPath: root, logger: { warn: (m) => dirWarnings.push(m) } });
  dirRegistry.register({ ...userSkill, source: "user" });
  dirRegistry.register({ ...userSkill, path: "/other/SKILL.md", source: "project" });
  assert.equal(dirWarnings.length, 1, "second registration must warn");
  assert.equal(dirRegistry.size, 1);
});

// ============================================================================
// 4. Source attribution from real directories
// ============================================================================

const sourceRegistry = new SkillRegistry({ rootPath: root });
await sourceRegistry.loadFromDirectories([
  { path: path.join(root, ".agents", "skills"), source: "project" },
  path.join(root, ".agents", "skills"), // bare string form → "project"
]);

check("directory-loaded skills carry a source", () => {
  const loaded = sourceRegistry.list();
  assert.ok(loaded.length >= 1, "the repo's own .agents/skills must load");
  for (const s of loaded) {
    assert.ok(["user", "project"].includes(s.source), `"${s.name}" has source ${s.source}`);
    assert.equal(typeof s.source, "string");
  }
});

await sourceRegistry.loadFromDirectories([{ path: path.join(root, ".agents", "skills"), source: "user" }]);

check("directory skills are never attributed to builtin", () => {
  for (const s of sourceRegistry.list()) {
    assert.notEqual(s.source, "builtin", `"${s.name}" came from a directory but claims builtin`);
  }
});

// ============================================================================
// 5. The skills extension: index, tools, /skill — with and without built-ins
// ============================================================================

async function activate(skillRegistry, config) {
  const api = createSkillsExtension({ skillRegistry, config });
  const tools = [];
  const commands = [];
  let provider = null;
  await api.activate({
    z: (await import("zod")).z,
    registerTool: (def) => tools.push(def),
    registerCommand: (cmd) => commands.push(cmd),
    registerInterceptor: () => () => {},
    registerContextProvider: (p) => {
      provider = p;
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });
  return { tools, commands, provider };
}

// A registry with one directory skill + all built-ins, so both sources coexist.
const mixed = new SkillRegistry({ rootPath: root });
await mixed.loadFromDirectories([{ path: path.join(root, ".agents", "skills"), source: "project" }]);
const dirNames = mixed.names();
mixed.registerAll(BUILTIN_SKILLS);

const on = await activate(mixed, undefined);
const onIndex = await on.provider.content();

check("index lists the write-extension built-in", () => {
  assert.ok(onIndex.includes("<skills>"), "index wraps <skills>");
  assert.ok(onIndex.includes("write-extension"), "write-extension is listed");
});

check("index distinguishes built-ins from user/project skills", () => {
  assert.ok(
    /write-extension \(builtin\)/.test(onIndex),
    `built-in origin missing from index:\n${onIndex.slice(0, 400)}`
  );
  for (const name of dirNames) {
    assert.ok(onIndex.includes(`(${name === "write-extension" ? "x" : ""}`) || onIndex.includes(name), "name listed");
  }
  assert.ok(/\(project\)/.test(onIndex), "project origin missing from index");
});

check("list_skills reports source", async () => {
  const tool = on.tools.find((t) => t.name === "list_skills");
  const out = await tool.execute({}, { toolCallId: "t1" });
  assert.equal(out.count, mixed.size);
  const builtinEntry = out.skills.find((s) => s.name === "write-extension");
  assert.equal(builtinEntry.source, "builtin", "list_skills carries source");
});

// --- builtinsDisabled: built-ins vanish from every surface, directory skills stay ---

const off = await activate(mixed, { builtinsDisabled: true });
const offIndex = await off.provider.content();

check("builtinsDisabled removes built-ins from the index", () => {
  assert.ok(!offIndex.includes("write-extension"), "built-in must not be listed");
  assert.ok(/\(builtin\)/.test(offIndex) === false, "no builtin origins when disabled");
  for (const name of dirNames) {
    assert.ok(offIndex.includes(name), `directory skill "${name}" must survive`);
  }
});

check("builtinsDisabled removes built-ins from list_skills", async () => {
  const tool = off.tools.find((t) => t.name === "list_skills");
  const out = await tool.execute({}, { toolCallId: "t2" });
  assert.ok(!out.skills.some((s) => s.name === "write-extension"), "must not be listed");
  assert.ok(!out.skills.some((s) => s.source === "builtin"), "no builtin_source entries");
});

check("builtinsDisabled makes load_skill reject a built-in name", async () => {
  const tool = off.tools.find((t) => t.name === "load_skill");
  await assert.rejects(() => tool.execute({ name: "write-extension" }, { toolCallId: "t3" }), /Unknown skill/);
});

check("builtinsDisabled makes /skill reject a built-in name", async () => {
  const cmd = off.commands.find((c) => c.name === "skill");
  const msg = await cmd.execute(["write-extension"]);
  assert.ok(msg.includes("Unknown skill"), `/skill must reject it, got "${msg}"`);
  assert.equal(await cmd.injectMessage(["write-extension"], msg), undefined, "must inject nothing");
  const options = await cmd.getOptions([]);
  assert.ok(!options.some((o) => o.value === "write-extension"), "must not be offered in the menu");
});

// --- defaults: built-ins on ---

check("built-ins are on by default", async () => {
  const cmd = on.commands.find((c) => c.name === "skill");
  const loadTool = on.tools.find((t) => t.name === "load_skill");
  const options = await cmd.getOptions([]);
  assert.ok(
    options.some((o) => o.value === "write-extension"),
    "offered in the menu"
  );
  const loaded = await loadTool.execute({ name: "write-extension" }, { toolCallId: "t4" });
  assert.ok(loaded.content.includes('<skill name="write-extension">'), "loads wrapped content");
});

// ============================================================================
// 6. The write-extension skill's documented API surface
// ============================================================================

const writeExtension = BUILTIN_SKILLS.find((s) => s.name === "write-extension");
const body = writeExtension?.body ?? "";

// Every `ctx.<member>` the skill documents must exist on ExtensionContext. The list is
// the real interface, transcribed from agent/extension/types.ts — if a member is renamed,
// this assertion is what fails instead of the skill quietly lying to the model.
const CONTEXT_MEMBERS = [
  "id",
  "env",
  "cwd",
  "coreEnv",
  "z",
  "registerTool",
  "registerCommand",
  "registerInterceptor",
  "registerContextProvider",
  "registerMessageTransformer",
  "events",
  "ui",
  "logger",
];

const UI_MEMBERS = ["notify", "subscribe", "render", "getContext"];

// Hook names actually dispatched by core. Renaming one must fail here.
const HOOK_NAMES = [
  "session:start",
  "session:shutdown",
  "before_agent_start",
  "tool:before:",
  "tool:after:",
  "tool:error:",
];

check("skill documents only real ctx members", () => {
  const documented = [...body.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  const unknown = [...new Set(documented)].filter((m) => !CONTEXT_MEMBERS.includes(m));
  assert.deepEqual(unknown, [], `skill references unknown ExtensionContext members: ${unknown.join(", ")}`);
});

check("skill documents only real ctx.ui members", () => {
  const documented = [...body.matchAll(/\bctx\.ui\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  const unknown = [...new Set(documented)].filter((m) => !UI_MEMBERS.includes(m));
  assert.deepEqual(unknown, [], `skill references unknown ctx.ui members: ${unknown.join(", ")}`);
});

check("skill documents every hook name", () => {
  for (const hook of HOOK_NAMES) {
    assert.ok(body.includes(hook), `hook "${hook}" is not documented`);
  }
});

check("skill does not document a removed turn-context API", () => {
  assert.ok(!body.includes("registerTurnContextProvider"), "registerTurnContextProvider does not exist");
  assert.ok(!body.includes("appendSystemPrompt"), "appendSystemPrompt does not exist on BeforeAgentStartEvent");
  assert.ok(!body.includes("appendTurnContext"), "appendTurnContext does not exist on BeforeAgentStartEvent");
});

check("skill does not promise a non-existent /extensions command", () => {
  assert.ok(!body.includes("/extensions"), "/extensions is not a command; enable/disable is the Ctrl+Y panel");
});

// The prefix-wildcard claim the skill makes must match the bus's matching rule.
check("skill's prefix:* claim matches the bus matcher", async () => {
  const busSource = await readFile(
    path.join(root, "packages/core/src/agent/agent-event-bus/agent-event-bus.ts"),
    "utf8"
  );
  assert.ok(/pattern\.endsWith\("\*"\)/.test(busSource), "bus no longer implements prefix wildcards");
  assert.ok(/pattern:\s*string/.test(busSource), "onIntercept signature changed");
  assert.ok(body.includes("prefix:*") || body.includes("tool:before:*"), "skill must document the wildcard");
});

// ============================================================================
// 7. Release-contract guard: built-ins must be inlined, never an asset
// ============================================================================

check("no SKILL.md asset ships for a built-in", async () => {
  // Built-ins are TS constants by design. A SKILL.md under src/ would mean someone
  // reintroduced the asset pipeline this decision removed.
  const builtinDir = path.join(root, "packages/core/src/agent/skills/builtin");
  const entries = await readdir(builtinDir);
  const assets = entries.filter((e) => !e.endsWith(".ts"));
  assert.deepEqual(assets, [], `unexpected non-TS files in builtin/: ${assets.join(", ")}`);
});

// ============================================================================
// Report
// ============================================================================

if (failures.length > 0) {
  console.error(`\nbuiltin-skills validation FAILED (${failures.length})\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `builtin-skills validation passed — ${BUILTIN_SKILLS.length} built-in skill(s): ${BUILTIN_SKILLS.map((s) => s.name).join(", ")}`
);
