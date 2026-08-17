/**
 * Validates the instruction-context enhancement:
 *   1. Instruction file discovery (AGENTS.md / CLAUDE.md priority + override)
 *   2. Change detection via content digest (no change → stable; change → detected)
 *   3. formatInstructionContextSection renders latest content + supersede notice
 *   4. formatInstructionStatusLabel produces the status-bar label
 *   5. buildDynamicTurnContext includes the <instruction_context> section and
 *      keeps the other sections' existing semantic tags
 *
 * Run: pnpm --filter @my-agent/core run validate:instruction-context
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildDynamicTurnContext,
  diffInstructionStates,
  formatInstructionContextSection,
  formatInstructionStatusLabel,
  instructionStateChanged,
  loadLatestInstructionContent,
  readInstructionContextState,
  registerCoreEnv,
} from "../dist/dev.mjs";

// ---------------------------------------------------------------------------
// In-memory + disk-backed CoreEnv with a temp workspace
// ---------------------------------------------------------------------------

const ws = mkdtempSync(join(tmpdir(), "instr-ctx-"));
const files = new Map(); // path -> content (for exists/readFile)

function abs(p) {
  return join(ws, p);
}

registerCoreEnv({
  rootPath: ws,
  getPlatform: async () => "test",
  getArch: async () => "arm64",
  getEnv: async () => ({}),
  homedir: async () => "/home/test",
  path: {
    join: (...parts) => join(...parts),
    dirname: (p) => join(p, ".."),
    basename: (p, ext) => {
      const base = p.split("/").pop() ?? p;
      return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
    },
    extname: (p) => {
      const base = p.split("/").pop() ?? p;
      const dot = base.lastIndexOf(".");
      return dot >= 0 ? base.slice(dot) : "";
    },
    resolve: (...parts) => join(...parts),
    normalize: (p) => p,
    isAbsolute: (p) => p.startsWith("/"),
    getSep: () => "/",
    parse: (p) => {
      const base = p.split("/").pop() ?? p;
      const dot = base.lastIndexOf(".");
      return {
        root: "/",
        dir: p.slice(0, p.lastIndexOf("/")),
        base,
        ext: dot >= 0 ? base.slice(dot) : "",
        name: dot >= 0 ? base.slice(0, dot) : base,
      };
    },
  },
  byteLength: (s) => encodeURI(s).replace(/%[A-F0-9]{2}/g, "x").length,
  fs: {
    readFile: async (p) => {
      const c = files.get(p);
      if (c === undefined) throw new Error(`ENOENT ${p}`);
      return c;
    },
    stat: async (p) => ({ isDirectory: false, isFile: true, size: files.get(p)?.length ?? 0, mtime: new Date() }),
    readdir: async () => [],
    writeFile: async (p, c) => files.set(p, String(c)),
    mkdir: async () => {},
    exists: async (p) => files.has(p),
    remove: async (p) => files.delete(p),
  },
  runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
  exec: async () => ({ stdout: "", stderr: "", code: 0 }),
  fetch: async () => ({ ok: true, status: 200 }),
});

function setFile(name, content) {
  files.set(abs(name), content);
}

// ---------------------------------------------------------------------------
// 1. Discovery: no files → empty state
// ---------------------------------------------------------------------------
{
  const state = await readInstructionContextState();
  assert.equal(state.primary, undefined, "no instruction files → primary undefined");
  assert.equal(state.override, undefined, "no instruction files → override undefined");
}

// ---------------------------------------------------------------------------
// 2. Discovery: CLAUDE.md priority over AGENTS.md + override
// ---------------------------------------------------------------------------
setFile("AGENTS.md", "# AGENTS instructions\n- rule A\n");
setFile("AGENTS.override.md", "# personal override\n");
{
  const state = await readInstructionContextState();
  assert.ok(state.primary, "AGENTS.md discovered");
  assert.equal(state.primary.name, "AGENTS.md");
  assert.ok(state.override, "AGENTS.override.md discovered");
  assert.equal(state.override.name, "AGENTS.override.md");

  // CLAUDE.md wins when both exist
  setFile("CLAUDE.md", "# CLAUDE instructions\n");
  const state2 = await readInstructionContextState();
  assert.equal(state2.primary.name, "CLAUDE.md", "CLAUDE.md takes priority");
}

// ---------------------------------------------------------------------------
// 3. Change detection: digest stable when unchanged, changes on edit
// ---------------------------------------------------------------------------
{
  const before = await readInstructionContextState();
  const afterSame = await readInstructionContextState();
  assert.equal(instructionStateChanged(before, afterSame), false, "no change → not changed");
  assert.equal(diffInstructionStates(before, afterSame).primaryChanged, false, "no change → primary digest stable");

  // Edit the instruction file
  files.set(abs("CLAUDE.md"), "# CLAUDE instructions\n- rule A\n- rule B changed\n");
  const afterEdit = await readInstructionContextState();
  assert.equal(instructionStateChanged(before, afterEdit), true, "edited content → changed");
  assert.equal(diffInstructionStates(before, afterEdit).primaryChanged, true, "primary digest differs after edit");
}

// ---------------------------------------------------------------------------
// 4. loadLatestInstructionContent + formatInstructionContextSection
// --------------------------------------------------------------------------
setFile("CLAUDE.override.md", "# personal override\n");
{
  const loaded = await loadLatestInstructionContent();
  assert.equal(loaded.primary.name, "CLAUDE.md", "primary loaded");
  assert.ok(loaded.primary.content.includes("rule B changed"), "latest content re-read");

  const section = formatInstructionContextSection(loaded);
  assert.ok(section.startsWith("<instruction_context>"), "section opens with <instruction_context>");
  assert.ok(section.endsWith("</instruction_context>"), "section closes with </instruction_context>");
  assert.ok(section.includes("# CLAUDE.md"), "primary heading present");
  assert.ok(section.includes("rule B changed"), "latest instruction content present");
  assert.ok(section.includes("authoritative"), "supersede notice present");
  assert.ok(section.includes("CLAUDE.override.md"), "override listed");
  assert.ok(section.includes("personal override"), "override content present");
}

// ---------------------------------------------------------------------------
// 5. Status label
// ---------------------------------------------------------------------------
{
  assert.equal(
    formatInstructionStatusLabel({ primaryChanged: true, overrideChanged: false }, "CLAUDE.md"),
    "CLAUDE.md updated",
    "primary-only label"
  );
  assert.equal(
    formatInstructionStatusLabel({ primaryChanged: true, overrideChanged: true }, "CLAUDE.md"),
    "CLAUDE.md, override updated",
    "primary+override label"
  );
  assert.equal(
    formatInstructionStatusLabel({ primaryChanged: false, overrideChanged: false }, "CLAUDE.md"),
    "",
    "no change → empty label"
  );
}

// ---------------------------------------------------------------------------
// 6. buildDynamicTurnContext includes <instruction_context> + keeps tags
// ---------------------------------------------------------------------------
{
  const loaded = await loadLatestInstructionContent();
  const instructionContext = formatInstructionContextSection(loaded);

  const payload = buildDynamicTurnContext({
    relevantMemoryContent: "<relevant_memories>memory A</relevant_memories>",
    todoNagReminder: "<reminder>Update todos</reminder>",
    currentDate: "August 17, 2026",
    gitBranch: "main",
    gitStatus: "M file.ts",
    planModeContent: '<plan_mode phase="planning">…</plan_mode>',
    extensionTurnContext: "ext activity",
    instructionContext,
  });

  assert.ok(payload.includes("<instruction_context>"), "instruction_context section present");
  assert.ok(payload.includes("rule B changed"), "latest instruction text in payload");
  assert.ok(payload.includes("<current_date>"), "current_date tag kept");
  assert.ok(payload.includes("<git_status>"), "git_status tag kept");
  assert.ok(payload.includes("<relevant_memories>"), "memory tag kept");
  assert.ok(payload.includes("<reminder>"), "todo nag tag kept");
  assert.ok(payload.includes("<plan_mode"), "plan mode tag kept");
  assert.ok(payload.includes("<extension_context>"), "extension_context tag kept");
}

// ---------------------------------------------------------------------------
// 7. Payload hash stability across unchanged turns (cache-friendly)
// ---------------------------------------------------------------------------
{
  const loadedA = await loadLatestInstructionContent();
  const a = buildDynamicTurnContext({
    currentDate: "August 17, 2026",
    gitBranch: "main",
    relevantMemoryContent: "<relevant_memories>m</relevant_memories>",
    instructionContext: formatInstructionContextSection(loadedA),
  });
  const loadedB = await loadLatestInstructionContent();
  const b = buildDynamicTurnContext({
    currentDate: "August 17, 2026",
    gitBranch: "main",
    relevantMemoryContent: "<relevant_memories>m</relevant_memories>",
    instructionContext: formatInstructionContextSection(loadedB),
  });
  assert.equal(a, b, "unchanged instructions → identical payload (cache stable)");
}

// ---------------------------------------------------------------------------
// 8. ManagedAgent integration: baseline → change → sticky active
// ---------------------------------------------------------------------------
{
  const { ManagedAgent } = await import("../dist/dev.mjs");

  // Reset workspace to a clean AGENTS.md baseline for the managed flow.
  files.clear();
  setFile("AGENTS.md", "# AGENTS\n- rule baseline\n");

  const managed = new ManagedAgent(
    { name: "instr-test", model: "gpt-4" },
    {
      log: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        agent: () => {},
        todo: () => {},
        clear: () => {},
      },
      tools: {},
      todoManager: null,
    }
  );

  // Turn 1: baseline — no instruction section (frozen prompt already carries content).
  const turn1 = (await managed.getDynamicTurnContext()) ?? "";
  assert.ok(!turn1.includes("<instruction_context>"), "baseline turn has no instruction_context");

  // Edit the instruction file, then evaluate again — change detected + injected.
  setFile("AGENTS.md", "# AGENTS\n- rule baseline\n- rule NEW\n");
  const turn2 = (await managed.getDynamicTurnContext()) ?? "";
  assert.ok(turn2.includes("<instruction_context>"), "changed turn injects instruction_context");
  assert.ok(turn2.includes("rule NEW"), "latest content injected");

  // No further change — still sticky (stable re-injection).
  const turn3 = (await managed.getDynamicTurnContext()) ?? "";
  assert.ok(turn3.includes("<instruction_context>"), "sticky active keeps injecting");

  // clearTurnContext clears the per-turn snapshot but NOT the instruction state —
  // sticky remains active (it must survive across user turns, since clearTurnContext
  // runs at every turn finalize).
  managed.clearTurnContext();
  const turn4 = (await managed.getDynamicTurnContext()) ?? "";
  assert.ok(turn4.includes("<instruction_context>"), "clearTurnContext keeps sticky active");
  assert.ok(turn4.includes("rule NEW"), "still injecting latest content after clear");

  // Full context reset (compaction path) re-baselines → next turn has no section.
  managed.resetAdmittedTurnContext();
  const turn5 = (await managed.getDynamicTurnContext()) ?? "";
  assert.ok(!turn5.includes("<instruction_context>"), "resetAdmittedTurnContext re-baselines");
}

// ---------------------------------------------------------------------------
// 9. Built-in extension: status bar + turn-context provider
// ---------------------------------------------------------------------------
{
  const { ExtensionRunner, builtinInstructionContext, INSTRUCTION_STATUS_KEY } = await import("../dist/dev.mjs");

  files.clear();
  setFile("AGENTS.md", "# AGENTS\n- rule v1\n");

  const runner = new ExtensionRunner({
    getEnvVar: () => undefined,
    cwd: ws,
    onRegisterTool: () => {},
    getCoreEnv: () => ({ rootPath: ws }),
  });
  const statusEvents = [];
  runner.getUI().subscribe("set-status", (data) => statusEvents.push(data));

  await runner.loadExtension(builtinInstructionContext);

  // First turn: no change vs the fresh extension → no status, but provider summary present.
  const turn1 = await runner.collectBeforeAgentStart("hi", "sess-1");
  assert.ok(turn1.turnContext.includes("AGENTS.md"), "provider reports active instructions file");
  assert.equal(statusEvents.length, 0, "no change → no status set");

  // Edit AGENTS.md, then next turn: status bar shows "AGENTS.md updated".
  setFile("AGENTS.md", "# AGENTS\n- rule v2\n");
  await new Promise((r) => setTimeout(r, 5));
  await runner.collectBeforeAgentStart("hi again", "sess-1");
  await new Promise((r) => setTimeout(r, 5));

  const status = runner.getUI().getStatus();
  assert.ok(status[INSTRUCTION_STATUS_KEY], "status key set");
  assert.equal(status[INSTRUCTION_STATUS_KEY], "AGENTS.md updated", "status shows updated label");

  await runner.destroyAll();
}

// ---------------------------------------------------------------------------
// 10. End-to-end admit flow: turn_context message injected with instruction
//     section after a change; hash/UI stable when nothing changes
// ---------------------------------------------------------------------------
{
  const { AgentUIChannel, ManagedAgent, extractTurnContextPayload } = await import("../dist/dev.mjs");

  files.clear();
  setFile("AGENTS.md", "# AGENTS\n- rule baseline\n");

  const managed = new ManagedAgent(
    { name: "instr-admit-test", model: "gpt-4" },
    {
      log: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        agent: () => {},
        todo: () => {},
        clear: () => {},
      },
      tools: {},
      todoManager: null,
    }
  );
  const channel = new AgentUIChannel();
  managed.setUIChannel(channel);

  // Baseline turn — snapshot + admit (no instruction section yet).
  await managed.captureTurnContextSnapshot();
  const admittedBaseline = managed.admitTurnContextIfNeeded();
  assert.equal(admittedBaseline, true, "baseline turn_context admitted");
  const baselineUIMessages = channel.getMessages();
  assert.equal(baselineUIMessages.length, 1, "one turn_context message in UI");
  const baselineContent = baselineUIMessages[0].parts.map((p) => p.content).join("\n");
  assert.ok(baselineContent.startsWith("<turn_context>"), "UI message is turn_context");
  assert.ok(!baselineContent.includes("<instruction_context>"), "baseline has no instruction section");

  // Same content, next turn — no new admit (hash stable, cache friendly).
  await managed.captureTurnContextSnapshot();
  const admittedAgain = managed.admitTurnContextIfNeeded();
  assert.equal(admittedAgain, false, "no change → no re-admit");
  assert.equal(channel.getMessages().length, 1, "UI unchanged (cache stable)");

  // Edit AGENTS.md → next turn snapshot detects change → new admit with section.
  setFile("AGENTS.md", "# AGENTS\n- rule baseline\n- rule NEW-ADMIT\n");
  await managed.captureTurnContextSnapshot();
  const admittedChanged = managed.admitTurnContextIfNeeded();
  assert.equal(admittedChanged, true, "change → re-admit");
  assert.equal(channel.getMessages().length, 2, "second turn_context message inserted");
  const changedMessages = channel.getMessages();
  const lastContent = changedMessages[changedMessages.length - 1].parts.map((p) => p.content).join("\n");
  assert.ok(lastContent.startsWith("<turn_context>"), "newest message is turn_context");
  assert.ok(lastContent.includes("<instruction_context>"), "instruction section present in newest turn_context");
  assert.ok(lastContent.includes("rule NEW-ADMIT"), "latest instruction text injected");
  assert.ok(lastContent.includes("authoritative"), "supersede notice present");

  // Parsing compatibility: extractTurnContextPayload still extracts the newest block.
  const newest = extractTurnContextPayload(lastContent);
  assert.ok(newest.includes("<instruction_context>"), "nested section survives payload extraction");
}

// ---------------------------------------------------------------------------
rmSync(ws, { recursive: true, force: true });
console.log("validate:instruction-context PASSED");
