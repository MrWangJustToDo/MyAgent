/**
 * Validation for the memory LLM contract (no network).
 *
 * Extraction and consolidation used to recover their structured result by
 * pattern-matching raw text and repairing fields afterwards. They now run
 * through `runSideTextQuery`'s structured overload against a Zod schema, so
 * this script drives each path with a fake adapter and asserts the contract
 * end to end — including the parts that only the schema can enforce.
 *
 * Covers:
 * - extraction writes the entries the model returned, including importance and
 *   a normalized expiresAt
 * - an out-of-range importance / unparseable expiry is normalized away rather
 *   than rejecting the memory or rejecting the response
 * - an unknown memory type is rejected by the schema instead of defaulting to
 *   a type the model never asked for
 * - a malformed response yields zero memories and never touches the store
 * - consolidation applies merges and deletions, and leaves everything alone
 *   when the response cannot satisfy the schema
 *
 * Run: pnpm --filter @my-agent/core run validate:memory-llm-contract
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, normalize, parse, resolve, sep } from "node:path";

import { MemoryManager, consolidateMemories, extractMemories, registerCoreEnv } from "../dist/dev.mjs";

const root = await mkdtemp(join(tmpdir(), "myagent-memory-llm-contract-"));

// Minimal CoreEnv backed by the real filesystem, scoped to `root`.
registerCoreEnv({
  rootPath: root,
  path: {
    join: (...p) => join(...p),
    dirname: (p) => dirname(p),
    basename: (p, ext) => (ext ? basename(p, ext) : basename(p)),
    extname: (p) => extname(p),
    resolve: (...p) => resolve(...p),
    normalize: (p) => normalize(p),
    isAbsolute: (p) => isAbsolute(p),
    getSep: () => sep,
    parse: (p) => parse(p),
  },
  getPlatform: async () => "test",
  getArch: async () => "test",
  getEnv: async () => ({}),
  homedir: async () => root,
  byteLength: (s) => Buffer.byteLength(s, "utf-8"),
  fs: {
    readFile: async (p) => {
      const { readFile } = await import("node:fs/promises");
      return readFile(p, "utf-8");
    },
    stat: async (p) => {
      const s = await stat(p);
      return { size: s.size, isFile: s.isFile(), isDirectory: s.isDirectory() };
    },
    readdir: async (p) => {
      const names = await readdir(p);
      return names.map((name) => ({ name, type: "file" }));
    },
    writeFile: async (p, content) => writeFile(p, content),
    mkdir: async (p) => {
      await mkdir(p, { recursive: true });
    },
    exists: async (p) => {
      try {
        await stat(p);
        return true;
      } catch {
        return false;
      }
    },
    remove: async (p) => rm(p, { recursive: true, force: true }),
    rename: async (from, to) => {
      const { rename } = await import("node:fs/promises");
      await rename(from, to);
    },
    appendFile: async (p, content) => {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(p, content);
    },
  },
});

// ---------------------------------------------------------------------------
// Fake adapter
// ---------------------------------------------------------------------------

const usageChunk = (promptTokens, completionTokens) => ({
  type: "RUN_FINISHED",
  usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
});

const completeChunk = (object) => ({
  type: "CUSTOM",
  name: "structured-output.complete",
  value: { object, raw: JSON.stringify(object) },
});

const runErrorChunk = (message) => ({ type: "RUN_ERROR", message });

/**
 * An adapter whose structured response is `object` (or a failure when given a
 * `failure` message). The port passes no tools, so the engine consumes
 * `structuredOutputStream` directly.
 */
const makeTextAdapterConfig = ({ object, failure }) => ({
  model: "fake-model",
  modelStyle: "openai",
  adapter: {
    kind: "text",
    name: "fake",
    model: "fake-model",
    "~types": {},
    chatStream() {
      return (async function* () {
        yield usageChunk(1, 1);
      })();
    },
    async structuredOutput() {
      throw new Error("not implemented");
    },
    structuredOutputStream() {
      return (async function* () {
        if (failure) {
          yield runErrorChunk(failure);
          return;
        }
        yield completeChunk(object);
        yield usageChunk(100, 20);
      })();
    },
  },
});

const dialogue = [
  { role: "user", content: "please use tabs" },
  { role: "assistant", content: "noted" },
];

const readBody = async (manager, filename) => manager.readMemory(filename);

// ---------------------------------------------------------------------------
// 1. Extraction writes what the model returned
// ---------------------------------------------------------------------------

{
  const manager = new MemoryManager({ rootPath: root });
  await manager.initialize();

  const textAdapter = makeTextAdapterConfig({
    object: [
      {
        name: "user-prefers-tabs",
        type: "user",
        description: "Indentation preference",
        body: "The user prefers tabs over spaces.",
        importance: 0.87,
        expiresAt: "2026-12-31",
      },
    ],
  });

  const count = await extractMemories(dialogue, manager, textAdapter);
  assert.equal(count, 1, "one extracted memory is written");

  const memories = await manager.listMemories();
  const written = memories.find((m) => m.name === "user-prefers-tabs");
  assert.ok(written, "the extracted memory is listed");
  assert.equal(written.type, "user");
  assert.equal(written.description, "Indentation preference");
  assert.equal(written.importance, 0.87, "importance survives the schema (rounded to two decimals, not dropped)");
  assert.equal(
    written.expiresAt,
    "2026-12-31T00:00:00.000Z",
    "a parseable expiry is normalized to ISO by the schema transform"
  );
  assert.ok((await readBody(manager, "user-prefers-tabs.md")).includes("tabs over spaces"));

  console.log("✓ extraction writes schema-validated entries");
}

// ---------------------------------------------------------------------------
// 2. Out-of-range hints are normalized, not fatal
// ---------------------------------------------------------------------------

{
  const manager = new MemoryManager({ rootPath: root });
  await manager.initialize();

  const textAdapter = makeTextAdapterConfig({
    object: [
      {
        name: "out-of-range-hints",
        type: "project",
        description: "Hints the schema had to repair",
        body: "Body text.",
        importance: 1.5,
        expiresAt: "not-a-date",
      },
    ],
  });

  const count = await extractMemories(dialogue, manager, textAdapter);
  assert.equal(count, 1, "an entry with unusable optional hints is still accepted");

  const written = (await manager.listMemories()).find((m) => m.name === "out-of-range-hints");
  assert.ok(written, "the entry is written");
  assert.equal(written.importance, undefined, "an importance outside 0–1 is dropped, not clamped silently");
  assert.equal(written.expiresAt, undefined, "an unparseable expiry is dropped");

  console.log("✓ invalid importance / expiry are normalized away");
}

// ---------------------------------------------------------------------------
// 3. An unknown memory type is rejected by the schema
// ---------------------------------------------------------------------------

{
  const manager = new MemoryManager({ rootPath: root });
  await manager.initialize();

  const before = (await manager.listMemories()).length;

  const textAdapter = makeTextAdapterConfig({
    object: [{ name: "made-up-type", type: "banana", description: "nope", body: "nope" }],
  });

  const count = await extractMemories(dialogue, manager, textAdapter);
  assert.equal(count, 0, "a response with an unknown type yields nothing");
  assert.equal(
    (await manager.listMemories()).length,
    before,
    "nothing is written, and the type is not silently rewritten to `user`"
  );

  console.log("✓ an unknown memory type is rejected, not defaulted");
}

// ---------------------------------------------------------------------------
// 4. A failed response is contained
// ---------------------------------------------------------------------------

{
  const manager = new MemoryManager({ rootPath: root });
  await manager.initialize();

  const before = (await manager.listMemories()).length;

  const failing = makeTextAdapterConfig({ failure: "provider exploded" });
  assert.equal(await extractMemories(dialogue, manager, failing), 0, "a transport failure yields zero memories");

  const malformed = makeTextAdapterConfig({ object: [{ name: "missing-body", type: "user", description: "d" }] });
  assert.equal(
    await extractMemories(dialogue, manager, malformed),
    0,
    "a schema-violating response yields zero memories"
  );

  assert.equal((await manager.listMemories()).length, before, "the store is untouched by either failure");

  console.log("✓ extraction failures are contained");
}

// ---------------------------------------------------------------------------
// 5. Consolidation applies merges and deletions
// ---------------------------------------------------------------------------

{
  const manager = new MemoryManager({ rootPath: root, consolidateThreshold: 2 });
  await manager.initialize();

  await manager.writeMemory("alpha-note", "project", "Alpha", "Alpha body.");
  await manager.writeMemory("beta-note", "project", "Beta", "Beta body.");
  await manager.writeMemory("stale-note", "reference", "Stale", "Stale body.");

  const textAdapter = makeTextAdapterConfig({
    object: {
      merged: [
        {
          name: "alpha-beta-note",
          type: "project",
          description: "Alpha and Beta merged",
          body: "Combined body.",
          replaces: ["alpha-note.md", "beta-note.md"],
        },
      ],
      deleted: ["stale-note.md"],
    },
  });

  const result = await consolidateMemories(manager, textAdapter);
  assert.equal(result.changed, true, "consolidation reports a change");

  const names = (await manager.listMemories()).map((m) => m.name);
  assert.ok(names.includes("alpha-beta-note"), "the merged entry is written");
  assert.ok(!names.includes("alpha-note"), "a replaced file is deleted");
  assert.ok(!names.includes("beta-note"), "every replaced file is deleted");
  assert.ok(!names.includes("stale-note"), "an explicitly deleted file is deleted");

  console.log("✓ consolidation applies merges and deletions");
}

// ---------------------------------------------------------------------------
// 6. Consolidation failures leave existing memories alone
// ---------------------------------------------------------------------------

{
  const manager = new MemoryManager({ rootPath: root, consolidateThreshold: 2 });
  await manager.initialize();

  await manager.writeMemory("keep-one", "project", "One", "One body.");
  await manager.writeMemory("keep-two", "project", "Two", "Two body.");

  const before = (await manager.listMemories()).map((m) => m.filename).sort();

  const failing = makeTextAdapterConfig({ failure: "provider exploded" });
  const failed = await consolidateMemories(manager, failing);
  assert.equal(failed.changed, false, "a transport failure reports no change");

  const malformed = makeTextAdapterConfig({ object: { merged: "not-an-array", deleted: 42 } });
  const malformedResult = await consolidateMemories(manager, malformed);
  assert.equal(malformedResult.changed, false, "a response with the wrong shapes reports no change");

  assert.deepEqual(
    (await manager.listMemories()).map((m) => m.filename).sort(),
    before,
    "existing memories are untouched by either failure"
  );

  console.log("✓ consolidation failures are contained");
}

await rm(root, { recursive: true, force: true });

console.log("memory-llm-contract validation passed");
